from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
import threading
from typing import Any

from app.ranking import (
    FEATURE_SCHEMA_VERSION,
    POLICY_VERSION,
    RANKING_FEATURES,
    extract_candidate_features,
    rank_recommendations,
)
from app.schemas import (
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
    ShadowScoreEntry,
    ShadowScoring,
)


logger = logging.getLogger(__name__)

# LightGBM is an optional training/serving dependency.  The service must
# import and start even when lightgbm is not installed (heuristic-only mode).
try:
    import lightgbm as lgb  # type: ignore[import-untyped]
    _LGB_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only without lightgbm
    lgb = None  # type: ignore[assignment]
    _LGB_AVAILABLE = False


@dataclass(frozen=True)
class ScoredCandidate:
    """A single candidate with its model score and feature row."""

    listing_id: str
    score: float
    features: dict[str, float]
    rank: int


@dataclass
class ModelManifest:
    """Metadata persisted alongside a trained LightGBM artifact."""

    model_id: str
    model_version: str
    objective: str  # "lambdarank" | "rank_xendcg"
    feature_schema_version: str
    feature_names: list[str]
    artifact_sha256: str
    training_data_hash: str
    training_code_commit: str | None = None
    evaluation_metrics: dict[str, float] = field(default_factory=dict)
    created_at: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ModelManifest:
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
        }


class RankingModel(ABC):
    """Abstract interface for a ranking model (champion or challenger)."""

    @abstractmethod
    def score(
        self,
        payload: RecommendationRequest,
    ) -> list[ScoredCandidate]:
        """Score every eligible candidate and return them sorted by score desc."""

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


class HeuristicRankingModel(RankingModel):
    """Wraps the existing deterministic ``rank_recommendations`` function.

    This is the champion baseline. It is always available and never depends on
    external artifacts.
    """

    @property
    def model_id(self) -> str:
        return "recommendation-heuristic"

    @property
    def model_version(self) -> str:
        return POLICY_VERSION

    @property
    def is_trained(self) -> bool:
        return False

    def score(self, payload: RecommendationRequest) -> list[ScoredCandidate]:
        rows = extract_candidate_features(payload)
        scored = [
            ScoredCandidate(
                listing_id=row["listing_id"],  # type: ignore[index]
                score=float(row["utility"]),  # type: ignore[index]
                features={k: float(v) for k, v in row["components"].items()},  # type: ignore[index]
                rank=0,
            )
            for row in rows
        ]
        scored.sort(key=lambda c: (-c.score, c.listing_id))
        for index, candidate in enumerate(scored, start=1):
            candidate = ScoredCandidate(
                listing_id=candidate.listing_id,
                score=candidate.score,
                features=candidate.features,
                rank=index,
            )
            scored[index - 1] = candidate
        return scored


class LightGBMRankingModel(RankingModel):
    """Loads a LightGBM ranking artifact from disk and scores candidates.

    The artifact is validated at load time:
    1. SHA256 of the model file is checked against the manifest hash.
    2. Feature schema version is checked against the serving schema.
    3. Feature names are checked against the expected ranking features.

    The model is only ``ready`` after all validations pass.
    """

    def __init__(self, model_path: str, manifest_path: str) -> None:
        self._model_path = model_path
        self._manifest_path = manifest_path
        self._manifest: ModelManifest | None = None
        self._booster: Any = None
        self._ready = False
        self._load_error: str | None = None

    @property
    def model_id(self) -> str:
        return self._manifest.model_id if self._manifest else "lightgbm-ranking"

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
            manifest = ModelManifest.from_dict(manifest_data)

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
            if manifest.feature_schema_version != FEATURE_SCHEMA_VERSION:
                self._load_error = (
                    f"feature schema version mismatch: expected "
                    f"{FEATURE_SCHEMA_VERSION}, got {manifest.feature_schema_version}"
                )
                self._ready = False
                return

            # 3. Feature name check
            expected = set(RANKING_FEATURES)
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
                "loaded shadow model %s v%s (%s)",
                manifest.model_id,
                manifest.model_version,
                manifest.objective,
            )
        except Exception as exc:  # pragma: no cover - defensive
            self._load_error = f"failed to load shadow model: {exc}"
            self._ready = False
            logger.exception("shadow model load failed")

    def score(self, payload: RecommendationRequest) -> list[ScoredCandidate]:
        if not self._ready or self._booster is None:
            return []
        rows = extract_candidate_features(payload)
        if not rows:
            return []
        import numpy as np

        feature_matrix = np.array(
            [
                [float(row["components"][name]) for name in RANKING_FEATURES]  # type: ignore[index]
                for row in rows
            ],
            dtype=np.float64,
        )
        raw_scores = self._booster.predict(feature_matrix)
        scored: list[ScoredCandidate] = []
        for row, raw in zip(rows, raw_scores):
            scored.append(
                ScoredCandidate(
                    listing_id=row["listing_id"],  # type: ignore[index]
                    score=float(raw),
                    features={k: float(v) for k, v in row["components"].items()},  # type: ignore[index]
                    rank=0,
                )
            )
        scored.sort(key=lambda c: (-c.score, c.listing_id))
        for index, candidate in enumerate(scored, start=1):
            scored[index - 1] = ScoredCandidate(
                listing_id=candidate.listing_id,
                score=candidate.score,
                features=candidate.features,
                rank=index,
            )
        return scored


@dataclass
class ShadowTelemetry:
    """Rolling aggregate telemetry for the shadow challenger."""

    total_requests: int = 0
    total_scored: int = 0
    total_errors: int = 0
    latency_samples: deque = field(default_factory=lambda: deque(maxlen=1000))
    missingness_samples: deque = field(default_factory=lambda: deque(maxlen=1000))
    rank_overlap_samples: deque = field(default_factory=lambda: deque(maxlen=1000))

    def record(
        self,
        latency_ms: float,
        missingness: float,
        rank_overlap: float,
        scored: int,
        error: bool = False,
    ) -> None:
        self.total_requests += 1
        if error:
            self.total_errors += 1
            return
        self.total_scored += scored
        self.latency_samples.append(latency_ms)
        self.missingness_samples.append(missingness)
        self.rank_overlap_samples.append(rank_overlap)

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

        return {
            "total_requests": self.total_requests,
            "total_scored": self.total_scored,
            "total_errors": self.total_errors,
            "latency_ms": _stats(self.latency_samples),
            "feature_missingness": _stats(self.missingness_samples),
            "rank_overlap_at_k": _stats(self.rank_overlap_samples),
        }


class ModelRegistry:
    """Owns the champion model and an optional shadow challenger.

    The champion is always the heuristic baseline. A shadow challenger can be
    loaded at runtime via ``load_shadow`` and unloaded via ``unload_shadow``.
    The shadow never affects user-facing responses.
    """

    def __init__(self) -> None:
        self._champion: RankingModel = HeuristicRankingModel()
        self._shadow: LightGBMRankingModel | None = None
        self._telemetry = ShadowTelemetry()
        self._lock = threading.Lock()

    @property
    def champion(self) -> RankingModel:
        return self._champion

    @property
    def shadow(self) -> LightGBMRankingModel | None:
        return self._shadow

    @property
    def shadow_loaded(self) -> bool:
        return self._shadow is not None and self._shadow.is_ready()

    @property
    def shadow_version(self) -> str | None:
        if self.shadow_loaded and self._shadow is not None:
            return self._shadow.model_version
        return None

    def load_shadow(self, model_path: str, manifest_path: str) -> tuple[bool, str]:
        """Load a shadow challenger. Returns (success, message)."""
        with self._lock:
            model = LightGBMRankingModel(model_path, manifest_path)
            model.load()
            if model.is_ready():
                self._shadow = model
                msg = (
                    f"shadow model loaded: {model.model_id} v{model.model_version} "
                    f"({model.objective})"
                )
                logger.info(msg)
                return True, msg
            self._shadow = None
            err = model.load_error() or "unknown error"
            logger.warning("shadow model load failed: %s", err)
            return False, err

    def unload_shadow(self) -> None:
        with self._lock:
            if self._shadow is not None:
                logger.info(
                    "unloading shadow model %s v%s",
                    self._shadow.model_id,
                    self._shadow.model_version,
                )
            self._shadow = None

    def telemetry_summary(self) -> dict[str, Any]:
        return self._telemetry.summary()

    def score_shadow(
        self, payload: RecommendationRequest, champion_scored: list[ScoredCandidate]
    ) -> ShadowScoring | None:
        """Score with the shadow challenger and build telemetry.

        Returns ``None`` if no shadow is loaded or scoring fails. Errors are
        logged and recorded but never propagated — the champion response is
        unaffected.
        """
        if not self.shadow_loaded or self._shadow is None:
            return None

        start = datetime.now(timezone.utc)
        try:
            shadow_scored = self._shadow.score(payload)
        except Exception as exc:
            logger.exception("shadow scoring error: %s", exc)
            self._telemetry.record(0.0, 0.0, 0.0, 0, error=True)
            return None
        elapsed_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000.0

        if not shadow_scored:
            self._telemetry.record(elapsed_ms, 0.0, 0.0, 0)
            return None

        champion_by_id = {c.listing_id: c for c in champion_scored}
        shadow_by_id = {c.listing_id: c for c in shadow_scored}

        # Feature missingness: fraction of features that are at default/zero
        total_features = len(RANKING_FEATURES) * len(shadow_scored)
        missing = sum(
            1
            for c in shadow_scored
            for v in c.features.values()
            if v <= 0.0
        )
        missingness = missing / max(1, total_features)

        # Rank overlap at K (Jaccard of top-K)
        k = min(len(champion_scored), len(shadow_scored), 10)
        champion_top = {c.listing_id for c in champion_scored[:k]}
        shadow_top = {c.listing_id for c in shadow_scored[:k]}
        overlap = (
            len(champion_top & shadow_top) / len(champion_top | shadow_top)
            if champion_top | shadow_top
            else 0.0
        )

        self._telemetry.record(elapsed_ms, missingness, overlap, len(shadow_scored))

        entries: list[ShadowScoreEntry] = []
        for champ in champion_scored:
            chall = shadow_by_id.get(champ.listing_id)
            if chall is None:
                continue
            entries.append(
                ShadowScoreEntry(
                    listing_id=champ.listing_id,
                    champion_score=round(champ.score, 6),
                    challenger_score=round(chall.score, 6),
                    score_delta=round(chall.score - champ.score, 6),
                    champion_rank=champ.rank,
                    challenger_rank=chall.rank,
                )
            )

        return ShadowScoring(
            shadow_model_id=self._shadow.model_id,
            shadow_model_version=self._shadow.model_version,
            shadow_objective=self._shadow.objective,
            scored_count=len(shadow_scored),
            latency_ms=round(elapsed_ms, 3),
            feature_missingness=round(missingness, 6),
            rank_overlap_at_k=round(overlap, 6),
            scores=entries,
        )


__all__ = [
    "HeuristicRankingModel",
    "LightGBMRankingModel",
    "ModelManifest",
    "ModelRegistry",
    "RankingModel",
    "ScoredCandidate",
    "ShadowTelemetry",
]
