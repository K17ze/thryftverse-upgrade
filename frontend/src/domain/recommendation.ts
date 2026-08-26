import type { Listing } from './listing';

export type ServeMode =
  | 'personalized'
  | 'cold_start'
  | 'non_profiled'
  | 'degraded_baseline'
  | 'recovery_general';

export type ScoreBand = 'high' | 'medium' | 'explore';

export interface CandidateLineage {
  source: string;
  sourceRank: number;
  sourceScore: number;
  retrievalVersion: string;
}

export type RecommendationReasonCode = string;

export interface RecommendationItemVM {
  listing: Listing;
  score: number;
  scoreBand: ScoreBand;
  model: string;
  policy: 'exploit' | 'explore';
  position: number;
  reasonCodes: RecommendationReasonCode[];
  componentScores: Record<string, number>;
  candidateSources: CandidateLineage[];
  selectionPropensity: number | null;
  explanationToken: string | null;
}

export interface RecommendationPage {
  requestId: string;
  sessionId: string;
  surface: string;
  serveMode: ServeMode;
  policyVersion: string;
  featureSchemaVersion: string;
  trainedModel: boolean;
  capabilityLevel: string;
  generatedAt: string;
  explorationRate: number;
  intentVersion: number;
  items: RecommendationItemVM[];
}

export type ImpressionStatus = 'rendered' | 'viewable';

export interface ImpressionEntry {
  listingId: string;
  status: ImpressionStatus;
  viewability?: Record<string, unknown>;
}

export function deriveScoreBand(score: number, policy: 'exploit' | 'explore'): ScoreBand {
  if (policy === 'explore') return 'explore';
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'explore';
}

export function deriveServeMode(
  source: 'decision_service' | 'cache' | 'fallback' | string,
  coldStart: boolean,
): ServeMode {
  if (source === 'fallback') return 'degraded_baseline';
  if (coldStart) return 'cold_start';
  return 'personalized';
}
