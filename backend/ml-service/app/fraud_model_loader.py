"""Fraud scoring model loader and shadow registry.

Mirrors the shadow scoring pattern from ``model_loader.py`` (Phase 2c) but
for binary fraud classification instead of learning-to-rank.

The rule-based fraud detector in the API (``fraudDetection.ts``) is the
champion. A trained LightGBM binary classifier may shadow it for offline
comparison. The shadow never affects user-facing fraud decisions — it only
produces a parallel score that is logged to ``fraud_scoring_ledger`` for
offline agreement analysis and calibration.

Design (AGENTS.md §11 — Truthful, §10 — No black-box AI claims):
- The champion is always ``RuleEngineFraudModel``, which wraps the rule-engine
  signals as a deterministic baseline. It is always available.
- ``LightGBMFraudModel`` loads a binary classification artifact, validates
  SHA256 + feature schema at load time, and is only ``ready`` after validation
  passes.
- ``FraudModelRegistry`` owns the champion and an optional shadow challenger.
  The shadow is loaded/unloaded at runtime via admin endpoints.
- If no shadow is loaded, scoring returns an honest placeholder — no
  fabricated scores.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

# LightGBM is an optional training/serving dependency. The service must
# import and start even when lightgbm is not installed (rule-engine-only mode).
try:
    import lightgbm as lgb  # type: ignore[import-untyped]
    _LGB_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only without lightgbm
    lgb = None  # type: ignore[assignment]
    _LGB_AVAILABLE = False


# ---------------------------------------------------------------------------
# Feature schema
# ---------------------------------------------------------------------------

# The fraud feature schema is derived from the rule-engine signals. The
# LightGBM challenger consumes exactly these features so that champion and
# shadow operate on the same interpretable feature space. This is the
# "use the existing rule-engine signals as features" principle from the ML
# flagship report §8.3.
FRAUD_FEATURE_SCHEMA_VERSION = "fraud-features-v1"

FRAUD_FEATURES: tuple[str, ...] = (
    "rule_engine_score",          # 0-100, the champion score
    "signal_count",               # number of signals fired
    "velocity_account_creation",  # raw count
    "velocity_listing_creation",  # raw count
    "velocity_message",           # raw count
    "velocity_login_attempt",     # raw count
    "account_age_seconds",        # raw seconds (-1 if unknown)
    "amount_gbp",                 # raw amount (0 if not a transaction)
    "ip_blacklisted",             # 0/1
    "disposable_email",           # 0/1
    "new_account",                # 0/1 (account < 24h)
    "missing_user_agent",         # 0/1
    "device_multiple_accounts",   # count of accounts on this device
    "high_value_new_account",     # 0/1
)

# Decision thresholds for the shadow model's calibrated probability.
# These map the continuous score to a discrete decision that can be compared
# against the rule engine's allow/flag/block.
SHADOW_AUTO_APPROVE_THRESHOLD = 0.15  # below → auto_approve (low risk)
SHADOW_AUTO_BLOCK_THRESHOLD = 0.70   # above → auto_block (high risk)
# between → review (medium risk)


@dataclass(frozen=True)
class FraudScoreResult:
    """The result of scoring a single fraud event with a model."""

    score: float | None  # calibrated probability of fraud (0.0-1.0), None if unavailable
    decision: str  # "auto_approve" | "review" | "auto_block"
    confidence: float | None  # 0.0-1.0, None if unavailable
    model_id: str | None
    model_version: str | None
    features: dict[str, float]
    reason: str | None = None  # set when unavailable


@dataclass
class FraudModelManifest:
    """Metadata persisted alongside a trained LightGBM fraud artifact."""

    model_id: str
    model_version: str
    objective: str  # "binary"
    feature_schema_version: str
    feature_names: list[str]
    artifact_sha256: str
    training_data_hash: str
    training_code_commit: str | None = None
    evaluation_metrics: dict[str, float] = field(default_factory=dict)
    created_at: str = ""
    # Calibration metadata (isotonic / Platt scaling applied post-training)
    calibration_method: str | None = None  # "isotonic" | "platt" | None
    calibration_data_hash: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FraudModelManifest:
        return cls(
            model_id=data["model_id"],
            model_version=data["model_version"],
            objective=data["objective"],
            feature_schema_version=data["feature_schema_version"],
            feature_names=data["feature_names"],
            artifact_sha256=data["artifact_sha256"],
            training_data_hash=data["training_data_hash"],
            training_code_commit=data.get("training_code_commit"),
            evaluation_metrics=data.get("evaluation_metrics", {}),
            created_at=data.get("created_at", ""),
            calibration_method=data.get("calibration_method"),
            calibration_data_hash=data.get("calibration_data_hash"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_id": self.model_id,
            "model_version": self.model_version,
            "objective": self.objective,
            "feature_schema_version": self.feature_schema_version,
            "feature_names": list(self.feature_names),
            "artifact_sha256": self.artifact_sha256,
            "training_data_hash": self.training_data_hash,
            "training_code_commit": self.training_code_commit,
            "evaluation_metrics": dict(self.evaluation_metrics),
            "created_at": self.created_at,
            "calibration_method": self.calibration_method,
            "calibration_data_hash": self.calibration_data_hash,
        }


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------


def extract_fraud_features(signals: dict[str, Any]) -> dict[str, float]:
    """Extract the fraud feature vector from the rule-engine signals payload.

    The input is the JSON payload sent by the API's fraud shadow scoring
    service. It contains the rule-engine score, the individual signal objects,
    velocity counts, account age, and amount.

    Returns a dict keyed by FRAUD_FEATURES with float values. Missing values
    default to 0.0 — this is the honest placeholder, not a fabricated signal.
    """
    rule_engine_score = float(signals.get("rule_engine_score", 0) or 0)
    signal_list = signals.get("signals", [])
    signal_rule_ids = {s.get("ruleId") for s in signal_list if isinstance(s, dict)}

    velocity = signals.get("velocity", {})
    account_age = float(signals.get("account_age_seconds", -1) or -1)
    amount = float(signals.get("amount_gbp", 0) or 0)
    device_accounts = float(signals.get("device_multiple_accounts", 0) or 0)

    return {
        "rule_engine_score": rule_engine_score,
        "signal_count": float(len(signal_list)),
        "velocity_account_creation": float(velocity.get("accountCreation", 0) or 0),
        "velocity_listing_creation": float(velocity.get("listingCreation", 0) or 0),
        "velocity_message": float(velocity.get("message", 0) or 0),
        "velocity_login_attempt": float(velocity.get("loginAttempt", 0) or 0),
        "account_age_seconds": max(-1.0, account_age),
        "amount_gbp": max(0.0, amount),
        "ip_blacklisted": 1.0 if "ip.blacklist" in signal_rule_ids else 0.0,
        "disposable_email": 1.0 if "email.disposable_domain" in signal_rule_ids else 0.0,
        "new_account": 1.0 if account_age >= 0 and account_age < 86400 else 0.0,
        "missing_user_agent": 1.0 if "behavioral.missing_user_agent" in signal_rule_ids else 0.0,
        "device_multiple_accounts": device_accounts,
        "high_value_new_account": 1.0 if "transaction.high_value_new_account" in signal_rule_ids else 0.0,
    }


def decision_from_score(score: float) -> str:
    """Map a calibrated fraud probability to a discrete decision."""
    if score >= SHADOW_AUTO_BLOCK_THRESHOLD:
        return "auto_block"
    if score < SHADOW_AUTO_APPROVE_THRESHOLD:
        return "auto_approve"
    return "review"


def confidence_from_score(score: float) -> float:
    """A simple confidence measure: distance from the review band boundaries."""
    if score >= SHADOW_AUTO_BLOCK_THRESHOLD:
        return min(1.0, (score - SHADOW_AUTO_BLOCK_THRESHOLD) / (1.0 - SHADOW_AUTO_BLOCK_THRESHOLD + 1e-9))
    if score < SHADOW_AUTO_APPROVE_THRESHOLD:
        return min(1.0, (SHADOW_AUTO_APPROVE_THRESHOLD - score) / (SHADOW_AUTO_APPROVE_THRESHOLD + 1e-9))
    # Inside the review band — confidence is low (that's the point of review)
    return 0.0


# ---------------------------------------------------------------------------
# Model interfaces
# ---------------------------------------------------------------------------


class FraudScoringModel(ABC):
    """Abstract interface for a fraud scoring model (champion or challenger)."""

    @abstractmethod
    def score(self, signals: dict[str, Any]) -> FraudScoreResult:
        """Score a single fraud event and return the result."""

    @property
    @abstractmethod
    def model_id(self) -> str:
        ...

    @property
    @abstractmethod
    def model_version(self) -> str:
        ...

    @property
    @abstractmethod
    def is_trained(self) -> bool:
        ...

    def is_ready(self) -> bool:
        return True


class RuleEngineFraudModel(FraudScoringModel):
    """Wraps the rule-engine signals as a deterministic baseline.

    This is the champion baseline. It is always available and never depends on
    external artifacts. It maps the rule-engine score (0-100) to a calibrated
    probability using a simple linear mapping, so champion and shadow produce
    comparable probability outputs.
    """

    @property
    def model_id(self) -> str:
        return "fraud-rule-engine"

    @property
    def model_version(self) -> str:
        return "rule-engine-v1"

    @property
    def is_trained(self) -> bool:
        return False

    def score(self, signals: dict[str, Any]) -> FraudScoreResult:
        features = extract_fraud_features(signals)
        raw_score = features["rule_engine_score"]
        # Linear mapping: 0-100 → 0.0-1.0
        calibrated = min(1.0, max(0.0, raw_score / 100.0))
        decision = decision_from_score(calibrated)
        confidence = confidence_from_score(calibrated)
        return FraudScoreResult(
            score=round(calibrated, 4),
            decision=decision,
            confidence=round(confidence, 4),
            model_id=self.model_id,
            model_version=self.model_version,
            features=features,
        )


class LightGBMFraudModel(FraudScoringModel):
    """Loads a LightGBM binary classification artifact and scores fraud events.

    The artifact is validated at load time:
    1. SHA256 of the model file is checked against the manifest hash.
    2. Feature schema version is checked against the serving schema.
    3. Feature names are checked against the expected fraud features.

    The model is only ``ready`` after all validations pass.
    """

    def __init__(self, model_path: str, manifest_path: str) -> None:
        self._model_path = model_path
        self._manifest_path = manifest_path
        self._manifest: FraudModelManifest | None = None
        self._booster: Any = None
        self._ready = False
        self._load_error: str | None = None

    @property
    def model_id(self) -> str:
        return self._manifest.model_id if self._manifest else "lightgbm-fraud"

    @property
    def model_version(self) -> str:
        return self._manifest.model_version if self._manifest else "unknown"

    @property
    def objective(self) -> str:
        return self._manifest.objective if self._manifest else "unknown"

    @property
    def is_trained(self) -> bool:
        return True

    def is_ready(self) -> bool:
        return self._ready

    def load_error(self) -> str | None:
        return self._load_error

    def load(self) -> None:
        """Load and validate the artifact. Sets ``_ready`` on success."""
        if not _LGB_AVAILABLE:
            self._load_error = "lightgbm is not installed"
            self._ready = False
            return

        try:
            manifest_data = json.loads(
                open(self._manifest_path, encoding="utf-8").read()
            )
            manifest = FraudModelManifest.from_dict(manifest_data)

            # 1. SHA256 validation
            sha = hashlib.sha256()
            with open(self._model_path, "rb") as fh:
                for chunk in iter(lambda: fh.read(65536), b""):
                    sha.update(chunk)
            actual_hash = sha.hexdigest()
            if actual_hash != manifest.artifact_sha256:
                self._load_error = (
                    f"artifact SHA256 mismatch: expected {manifest.artifact_sha256}, "
                    f"got {actual_hash}"
                )
                self._ready = False
                return

            # 2. Feature schema version check
            if manifest.feature_schema_version != FRAUD_FEATURE_SCHEMA_VERSION:
                self._load_error = (
                    f"feature schema version mismatch: expected "
                    f"{FRAUD_FEATURE_SCHEMA_VERSION}, got {manifest.feature_schema_version}"
                )
                self._ready = False
                return

            # 3. Feature name check
            expected = set(FRAUD_FEATURES)
            actual = set(manifest.feature_names)
            if actual != expected:
                missing = expected - actual
                extra = actual - expected
                self._load_error = (
                    f"feature name mismatch: missing={missing}, extra={extra}"
                )
                self._ready = False
                return

            # 4. Load the booster
            self._booster = lgb.Booster(model_file=self._model_path)  # type: ignore[union-attr]
            self._manifest = manifest
            self._ready = True
            self._load_error = None
            logger.info(
                "loaded fraud shadow model %s v%s (%s, calibration=%s)",
                manifest.model_id,
                manifest.model_version,
                manifest.objective,
                manifest.calibration_method or "none",
            )
        except Exception as exc:  # pragma: no cover - defensive
            self._load_error = f"failed to load fraud shadow model: {exc}"
            self._ready = False
            logger.exception("fraud shadow model load failed")

    def score(self, signals: dict[str, Any]) -> FraudScoreResult:
        if not self._ready or self._booster is None:
            return FraudScoreResult(
                score=None,
                decision="review",
                confidence=None,
                model_id=self.model_id,
                model_version=self.model_version,
                features=extract_fraud_features(signals),
                reason="model_not_ready",
            )
        import numpy as np

        features = extract_fraud_features(signals)
        feature_vector = np.array(
            [[features[name] for name in FRAUD_FEATURES]],
            dtype=np.float64,
        )
        # LightGBM binary objective returns probability of the positive class
        raw_probs = self._booster.predict(feature_vector)
        calibrated = float(raw_probs[0])
        calibrated = min(1.0, max(0.0, calibrated))
        decision = decision_from_score(calibrated)
        confidence = confidence_from_score(calibrated)
        return FraudScoreResult(
            score=round(calibrated, 4),
            decision=decision,
            confidence=round(confidence, 4),
            model_id=self.model_id,
            model_version=self.model_version,
            features=features,
        )


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------


@dataclass
class FraudShadowTelemetry:
    """Rolling aggregate telemetry for the fraud shadow challenger."""

    total_requests: int = 0
    total_scored: int = 0
    total_errors: int = 0
    total_unavailable: int = 0
    latency_samples: deque = field(default_factory=lambda: deque(maxlen=1000))
    agreement_samples: deque = field(default_factory=lambda: deque(maxlen=1000))

    def record(
        self,
        latency_ms: float,
        agreement: str,
        error: bool = False,
        unavailable: bool = False,
    ) -> None:
        self.total_requests += 1
        if error:
            self.total_errors += 1
            return
        if unavailable:
            self.total_unavailable += 1
            return
        self.total_scored += 1
        self.latency_samples.append(latency_ms)
        self.agreement_samples.append(agreement)

    def summary(self) -> dict[str, Any]:
        import numpy as np

        def _stats(samples: deque) -> dict[str, float]:
            if not samples:
                return {"mean": 0.0, "p50": 0.0, "p95": 0.0}
            arr = np.array(list(samples), dtype=np.float64)
            return {
                "mean": float(np.mean(arr)),
                "p50": float(np.percentile(arr, 50)),
                "p95": float(np.percentile(arr, 95)),
            }

        agreement_counts: dict[str, int] = {}
        for agg in self.agreement_samples:
            agreement_counts[agg] = agreement_counts.get(agg, 0) + 1

        return {
            "total_requests": self.total_requests,
            "total_scored": self.total_scored,
            "total_errors": self.total_errors,
            "total_unavailable": self.total_unavailable,
            "latency_ms": _stats(self.latency_samples),
            "agreement_distribution": agreement_counts,
        }


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class FraudModelRegistry:
    """Owns the champion fraud model and an optional shadow challenger.

    The champion is always the rule-engine baseline. A shadow challenger can
    be loaded at runtime via ``load_shadow`` and unloaded via ``unload_shadow``.
    The shadow never affects user-facing fraud decisions.
    """

    def __init__(self) -> None:
        self._champion: FraudScoringModel = RuleEngineFraudModel()
        self._shadow: LightGBMFraudModel | None = None
        self._telemetry = FraudShadowTelemetry()
        self._lock = threading.Lock()

    @property
    def champion(self) -> FraudScoringModel:
        return self._champion

    @property
    def shadow(self) -> LightGBMFraudModel | None:
        return self._shadow

    @property
    def shadow_loaded(self) -> bool:
        return self._shadow is not None and self._shadow.is_ready()

    @property
    def shadow_version(self) -> str | None:
        if self.shadow_loaded and self._shadow is not None:
            return self._shadow.model_version
        return None

    @property
    def shadow_model_id(self) -> str | None:
        if self.shadow_loaded and self._shadow is not None:
            return self._shadow.model_id
        return None

    def load_shadow(self, model_path: str, manifest_path: str) -> tuple[bool, str]:
        """Load a shadow challenger. Returns (success, message)."""
        with self._lock:
            model = LightGBMFraudModel(model_path, manifest_path)
            model.load()
            if model.is_ready():
                self._shadow = model
                msg = (
                    f"fraud shadow model loaded: {model.model_id} v{model.model_version} "
                    f"({model.objective})"
                )
                logger.info(msg)
                return True, msg
            self._shadow = None
            err = model.load_error() or "unknown error"
            logger.warning("fraud shadow model load failed: %s", err)
            return False, err

    def unload_shadow(self) -> None:
        with self._lock:
            if self._shadow is not None:
                logger.info(
                    "unloading fraud shadow model %s v%s",
                    self._shadow.model_id,
                    self._shadow.model_version,
                )
            self._shadow = None

    def telemetry_summary(self) -> dict[str, Any]:
        return self._telemetry.summary()

    def score_shadow(self, signals: dict[str, Any]) -> FraudScoreResult:
        """Score with the shadow challenger.

        Returns an honest unavailable result if no shadow is loaded or scoring
        fails. Errors are logged and recorded but never propagated — the
        champion (rule engine) decision is unaffected.
        """
        if not self.shadow_loaded or self._shadow is None:
            self._telemetry.record(0.0, "shadow_unavailable", unavailable=True)
            return FraudScoreResult(
                score=None,
                decision="review",
                confidence=None,
                model_id=None,
                model_version=None,
                features=extract_fraud_features(signals),
                reason="no_model_loaded",
            )

        start = datetime.now(timezone.utc)
        try:
            result = self._shadow.score(signals)
        except Exception as exc:
            logger.exception("fraud shadow scoring error: %s", exc)
            self._telemetry.record(0.0, "shadow_unavailable", error=True)
            return FraudScoreResult(
                score=None,
                decision="review",
                confidence=None,
                model_id=self._shadow.model_id,
                model_version=self._shadow.model_version,
                features=extract_fraud_features(signals),
                reason="scoring_error",
            )
        elapsed_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000.0

        # Determine agreement with the rule engine for telemetry
        rule_score = float(signals.get("rule_engine_score", 0) or 0)
        if result.score is not None:
            shadow_score_100 = result.score * 100.0
            delta = shadow_score_100 - rule_score
            if abs(delta) < 15.0:
                agreement = "agree"
            elif delta > 0:
                agreement = "disagree_shadow_higher"
            else:
                agreement = "disagree_rule_higher"
        else:
            agreement = "shadow_unavailable"

        self._telemetry.record(elapsed_ms, agreement)
        return result


__all__ = [
    "FRAUD_FEATURES",
    "FRAUD_FEATURE_SCHEMA_VERSION",
    "FraudModelManifest",
    "FraudModelRegistry",
    "FraudScoreResult",
    "FraudScoringModel",
    "LightGBMFraudModel",
    "RuleEngineFraudModel",
    "SHADOW_AUTO_APPROVE_THRESHOLD",
    "SHADOW_AUTO_BLOCK_THRESHOLD",
    "FraudShadowTelemetry",
    "decision_from_score",
    "extract_fraud_features",
]
