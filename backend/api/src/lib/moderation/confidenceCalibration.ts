// Confidence calibration for moderation providers.
//
// Provider scores (0-1) are not directly comparable — OpenAI's 0.45 and
// Rekognition's 0.95 mean different things. Calibration maps raw provider
// scores to calibrated probabilities using per-provider, per-category
// calibration curves derived from human-labeled ground truth.
//
// Per-category thresholds determine the auto-approve / auto-reject /
// human-review bands:
//   score >= autoRejectThreshold  -> auto-reject
//   score <= autoApproveThreshold -> auto-approve
//   otherwise                     -> human review (triage)

export interface CalibrationCurve {
  // Piecewise linear interpolation points
  // rawScore -> calibratedProbability
  points: Array<{ raw: number; calibrated: number }>;
}

export interface CategoryThreshold {
  reasonCode: string;
  autoApproveThreshold: number;  // below this, auto-approve
  autoRejectThreshold: number;   // above this, auto-reject
  // Between the two: human review
}

export interface ProviderCalibration {
  providerName: string;
  curves: Record<string, CalibrationCurve>; // by reason code
  thresholds: CategoryThreshold[];
}

// ── Default calibrations ───────────────────────────────────────────────
//
// These are initial estimates. In production, they would be derived from
// a labeled dataset of human-reviewed decisions by computing the actual
// precision/recall curves per provider per category.

const DEFAULT_CALIBRATIONS: Record<string, ProviderCalibration> = {
  rekognition: {
    providerName: 'rekognition',
    curves: {
      hate_speech: { points: [{ raw: 0.5, calibrated: 0.3 }, { raw: 0.8, calibrated: 0.7 }, { raw: 0.95, calibrated: 0.95 }] },
      harassment: { points: [{ raw: 0.5, calibrated: 0.25 }, { raw: 0.8, calibrated: 0.6 }, { raw: 0.95, calibrated: 0.9 }] },
      minor_safety: { points: [{ raw: 0.3, calibrated: 0.5 }, { raw: 0.7, calibrated: 0.85 }, { raw: 0.9, calibrated: 0.98 }] },
      spam: { points: [{ raw: 0.5, calibrated: 0.4 }, { raw: 0.8, calibrated: 0.75 }, { raw: 0.95, calibrated: 0.95 }] },
    },
    thresholds: [
      { reasonCode: 'hate_speech', autoApproveThreshold: 0.3, autoRejectThreshold: 0.85 },
      { reasonCode: 'harassment', autoApproveThreshold: 0.25, autoRejectThreshold: 0.8 },
      { reasonCode: 'minor_safety', autoApproveThreshold: 0.1, autoRejectThreshold: 0.5 }, // Low threshold for CSAM
      { reasonCode: 'spam', autoApproveThreshold: 0.4, autoRejectThreshold: 0.9 },
      { reasonCode: 'scam', autoApproveThreshold: 0.3, autoRejectThreshold: 0.85 },
      { reasonCode: 'counterfeit', autoApproveThreshold: 0.3, autoRejectThreshold: 0.85 },
    ],
  },
  sightengine: {
    providerName: 'sightengine',
    curves: {
      hate_speech: { points: [{ raw: 0.4, calibrated: 0.35 }, { raw: 0.7, calibrated: 0.65 }, { raw: 0.9, calibrated: 0.92 }] },
      harassment: { points: [{ raw: 0.4, calibrated: 0.3 }, { raw: 0.7, calibrated: 0.6 }, { raw: 0.9, calibrated: 0.88 }] },
      minor_safety: { points: [{ raw: 0.3, calibrated: 0.55 }, { raw: 0.6, calibrated: 0.8 }, { raw: 0.85, calibrated: 0.97 }] },
      spam: { points: [{ raw: 0.4, calibrated: 0.45 }, { raw: 0.7, calibrated: 0.7 }, { raw: 0.9, calibrated: 0.93 }] },
    },
    thresholds: [
      { reasonCode: 'hate_speech', autoApproveThreshold: 0.35, autoRejectThreshold: 0.82 },
      { reasonCode: 'harassment', autoApproveThreshold: 0.3, autoRejectThreshold: 0.78 },
      { reasonCode: 'minor_safety', autoApproveThreshold: 0.1, autoRejectThreshold: 0.45 },
      { reasonCode: 'spam', autoApproveThreshold: 0.45, autoRejectThreshold: 0.88 },
    ],
  },
};

// ── Calibration functions ──────────────────────────────────────────────

export function calibrateScore(
  providerName: string,
  reasonCode: string,
  rawScore: number,
): number {
  const calibration = DEFAULT_CALIBRATIONS[providerName];
  if (!calibration) return rawScore; // No calibration data, use raw score

  const curve = calibration.curves[reasonCode];
  if (!curve) return rawScore; // No curve for this category

  return interpolate(curve.points, rawScore);
}

export function getThreshold(
  providerName: string,
  reasonCode: string,
): CategoryThreshold | null {
  const calibration = DEFAULT_CALIBRATIONS[providerName];
  if (!calibration) return null;
  return calibration.thresholds.find(t => t.reasonCode === reasonCode) ?? null;
}

export type ModerationAction = 'auto_approve' | 'auto_reject' | 'human_review';

export function determineAction(
  providerName: string,
  reasonCode: string,
  rawScore: number,
): { action: ModerationAction; calibratedScore: number; threshold: CategoryThreshold | null } {
  const calibratedScore = calibrateScore(providerName, reasonCode, rawScore);
  const threshold = getThreshold(providerName, reasonCode);

  if (!threshold) {
    // No threshold defined: human review for anything above 0.5
    return {
      action: calibratedScore > 0.5 ? 'human_review' : 'auto_approve',
      calibratedScore,
      threshold: null,
    };
  }

  if (calibratedScore >= threshold.autoRejectThreshold) {
    return { action: 'auto_reject', calibratedScore, threshold };
  }
  if (calibratedScore <= threshold.autoApproveThreshold) {
    return { action: 'auto_approve', calibratedScore, threshold };
  }
  return { action: 'human_review', calibratedScore, threshold };
}

// ── Helpers ────────────────────────────────────────────────────────────

function interpolate(points: Array<{ raw: number; calibrated: number }>, raw: number): number {
  if (points.length === 0) return raw;
  if (raw <= points[0].raw) return points[0].calibrated;
  if (raw >= points[points.length - 1].raw) return points[points.length - 1].calibrated;

  for (let i = 0; i < points.length - 1; i++) {
    if (raw >= points[i].raw && raw <= points[i + 1].raw) {
      const t = (raw - points[i].raw) / (points[i + 1].raw - points[i].raw);
      return points[i].calibrated + t * (points[i + 1].calibrated - points[i].calibrated);
    }
  }
  return raw;
}
