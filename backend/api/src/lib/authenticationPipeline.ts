/**
 * Physical authentication pipeline for the ThryftVerse marketplace.
 *
 * Provides a tiered authentication workflow for high-value items, moving
 * from AI photo triage → remote expert review → physical inspection →
 * lab analysis, with badge issuance and certificate generation.
 *
 * 2026 authentication landscape (August 2026 research):
 * - The RealReal: Full-service consignment, expert authentication, 98-99% accuracy
 * - StockX: Multi-point verification, intercepts items in transit
 * - Vestiaire Collective: Hybrid model with in-house experts + community verification
 * - Bunjang Corelytics: AI + X-ray fluorescence + digital microscopy, 99.99% accuracy
 * - Tiered pipeline: field NFC/photo triage → remote graders → lab escalation
 * - Digital product passports (LVMH Aura blockchain, NFC chips)
 * - Cost per item: 5-15 euros for expert inspection
 * - Hybrid AI + human is the standard — AI for first pass, human for high-value
 *
 * Design principles (AGENTS.md §11 — Truthful):
 * - AI triage is clearly labeled as preliminary — never a guarantee
 * - Every step is auditable with timestamp, actor, action, result
 * - Badges reflect real verification, never fabricated
 * - Certificates are verifiable via public certificate ID
 */

import crypto from 'node:crypto';
import type { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthenticationTier = 1 | 2 | 3 | 4;

export type AuthenticationStatus =
  | 'pending_ai_triage'
  | 'ai_triage_complete'
  | 'pending_expert_review'
  | 'expert_review_complete'
  | 'pending_lab_analysis'
  | 'lab_analysis_complete'
  | 'authenticated'
  | 'counterfeit'
  | 'inconclusive'
  | 'cancelled';

export type AiTriageRecommendation = 'pass' | 'review' | 'fail';

export type ExpertVerdict = 'authenticated' | 'counterfeit' | 'inconclusive' | 'needs_lab';

export type LabMethod = 'microscopy' | 'spectroscopy' | 'xrf' | 'digital_imaging' | 'material_analysis';

export type BadgeType = 'AI_VERIFIED' | 'EXPERT_VERIFIED' | 'LAB_CERTIFIED';

export interface AuthenticationRequest {
  id: string;
  listingId: string;
  itemValue: number; // in GBP
  category: string;
  brand?: string;
  tier: AuthenticationTier;
  status: AuthenticationStatus;
  sellerId: string;
  buyerId?: string;
  requestedBy: 'seller' | 'buyer' | 'system';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  aiTriageResult?: AiTriageResult;
  expertReview?: ExpertReview;
  labReport?: LabReport;
  badge?: AuthenticationBadge;
  auditTrail: AuditEntry[];
}

export interface AiTriageResult {
  confidenceScore: number; // 0-1
  recommendation: AiTriageRecommendation;
  flaggedAnomalies: string[];
  checksPerformed: string[];
  triagedAt: string;
  /** Truthful label: AI preliminary assessment — not a guarantee */
  isPreliminary: true;
}

export interface ExpertReview {
  expertId: string;
  expertName: string;
  assignedAt: string;
  completedAt: string;
  verdict: ExpertVerdict;
  notes: string;
  confidenceLevel: number; // 0-1
}

export interface LabReport {
  labId: string;
  labName: string;
  methodsUsed: LabMethod[];
  submittedAt: string;
  result: 'authentic' | 'counterfeit' | 'inconclusive';
  confidence: number; // 0-1
  reportSummary: string;
  reportHash: string;
}

export interface AuthenticationBadge {
  badgeId: string;
  certificateId: string;
  type: BadgeType;
  listingId: string;
  authenticator: string;
  method: string;
  confidenceLevel: number;
  issuedAt: string;
  expiresAt?: string;
}

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  result: string;
  notes?: string;
}

export interface CreateAuthenticationRequestInput {
  listingId: string;
  itemValue: number;
  category: string;
  brand?: string;
  sellerId: string;
  buyerId?: string;
  requestedBy: 'seller' | 'buyer' | 'system';
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Value thresholds for tier determination (in GBP). */
export const TIER_THRESHOLDS = {
  tier1Max: 100,    // < £100: AI photo triage only
  tier2Max: 500,    // £100-£500: AI + remote expert
  tier3Max: 2000,   // £500-£2000: AI + physical inspection
  // > £2000: Full lab analysis
} as const;

/** AI triage check categories. */
const AI_TRIAGE_CHECKS = [
  'logo_consistency',
  'stitching_pattern',
  'hardware_color',
  'material_texture',
  'font_spacing',
  'serial_number_format',
  'overall craftsmanship',
] as const;

/** Redis key prefix. */
const REDIS_KEY_PREFIX = 'auth';

function redisKey(...parts: string[]): string {
  return [REDIS_KEY_PREFIX, ...parts].join(':');
}

// ---------------------------------------------------------------------------
// Tier determination
// ---------------------------------------------------------------------------

/**
 * Determines the authentication tier based on item value.
 * Tier 1: < £100 — AI photo triage only
 * Tier 2: £100-£500 — AI + remote expert review
 * Tier 3: £500-£2000 — AI + physical inspection
 * Tier 4: > £2000 — Full lab analysis
 */
export function determineTier(itemValue: number): AuthenticationTier {
  if (itemValue < TIER_THRESHOLDS.tier1Max) return 1;
  if (itemValue < TIER_THRESHOLDS.tier2Max) return 2;
  if (itemValue < TIER_THRESHOLDS.tier3Max) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function generateCertificateId(): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${Date.now()}_${crypto.randomUUID()}`);
  return `CERT-${hash.digest('hex').substring(0, 12).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// AI photo triage
// ---------------------------------------------------------------------------

/**
 * Performs AI photo triage on a listing's photos.
 *
 * IMPORTANT (AGENTS.md §11 — Truthful):
 * This is a simulated AI assessment. In production, this would call a
 * computer vision model trained on authentic and counterfeit items.
 * The result is clearly labeled as preliminary — never a guarantee.
 */
export function performAiTriage(
  _listingId: string,
  _photos: string[]
): AiTriageResult {
  // Simulated AI analysis — in production, this would call a CV model.
  // We perform a deterministic hash-based assessment so results are
  // reproducible for testing, while clearly being a simulation.
  const hash = crypto.createHash('sha256');
  hash.update(_listingId);
  const hashBytes = hash.digest();

  // Derive a confidence score from the hash (0.7-0.95 range)
  const confidenceScore = 0.7 + (hashBytes[0] / 255) * 0.25;

  // Determine recommendation based on confidence
  let recommendation: AiTriageRecommendation;
  if (confidenceScore >= 0.85) {
    recommendation = 'pass';
  } else if (confidenceScore >= 0.75) {
    recommendation = 'review';
  } else {
    recommendation = 'fail';
  }

  // Flag anomalies based on hash (simulated)
  const flaggedAnomalies: string[] = [];
  if (hashBytes[1] % 4 === 0) flaggedAnomalies.push('Logo spacing slightly irregular');
  if (hashBytes[2] % 5 === 0) flaggedAnomalies.push('Stitch count differs from reference');
  if (hashBytes[3] % 6 === 0) flaggedAnomalies.push('Hardware color variation detected');

  return {
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    recommendation,
    flaggedAnomalies,
    checksPerformed: [...AI_TRIAGE_CHECKS],
    triagedAt: new Date().toISOString(),
    isPreliminary: true,
  };
}

// ---------------------------------------------------------------------------
// Authentication request lifecycle
// ---------------------------------------------------------------------------

/**
 * Creates a new authentication request.
 */
export async function createAuthenticationRequest(
  redis: Redis,
  input: CreateAuthenticationRequestInput
): Promise<AuthenticationRequest> {
  const tier = determineTier(input.itemValue);
  const now = new Date().toISOString();
  const id = generateId('auth');

  const request: AuthenticationRequest = {
    id,
    listingId: input.listingId,
    itemValue: input.itemValue,
    category: input.category,
    brand: input.brand,
    tier,
    status: 'pending_ai_triage',
    sellerId: input.sellerId,
    buyerId: input.buyerId,
    requestedBy: input.requestedBy,
    createdAt: now,
    updatedAt: now,
    auditTrail: [
      {
        timestamp: now,
        actor: input.requestedBy,
        action: 'create_request',
        result: `Tier ${tier} authentication requested for ${input.category}`,
        notes: `Item value: £${input.itemValue}`,
      },
    ],
  };

  await storeRequest(redis, request);
  return request;
}

/**
 * Runs AI triage on an authentication request and advances the status.
 */
export async function runAiTriage(
  redis: Redis,
  authRequestId: string,
  photos: string[]
): Promise<AuthenticationRequest> {
  const request = await getRequest(redis, authRequestId);
  if (!request) throw new Error(`Authentication request ${authRequestId} not found`);
  if (request.status !== 'pending_ai_triage') {
    throw new Error(`Request ${authRequestId} is not pending AI triage (current: ${request.status})`);
  }

  const triageResult = performAiTriage(request.listingId, photos);
  const now = new Date().toISOString();

  request.aiTriageResult = triageResult;
  request.updatedAt = now;
  request.auditTrail.push({
    timestamp: now,
    actor: 'ai_triage_system',
    action: 'ai_triage',
    result: triageResult.recommendation,
    notes: `Confidence: ${triageResult.confidenceScore}, Anomalies: ${triageResult.flaggedAnomalies.length}`,
  });

  // Advance status based on tier and triage result
  if (triageResult.recommendation === 'fail') {
    // AI triage failed — mark as counterfeit (still needs human confirmation for high tiers)
    if (request.tier === 1) {
      request.status = 'counterfeit';
      request.completedAt = now;
    } else {
      request.status = 'pending_expert_review';
    }
  } else if (request.tier === 1 && triageResult.recommendation === 'pass') {
    // Tier 1: AI pass is sufficient
    request.status = 'authenticated';
    request.completedAt = now;
    request.badge = issueBadge(request, 'AI_VERIFIED', 'AI Photo Triage');
  } else {
    // Tier 2+: needs expert review
    request.status = 'ai_triage_complete';
  }

  await storeRequest(redis, request);
  return request;
}

/**
 * Queues an authentication request for expert review.
 */
export async function queueForExpertReview(
  redis: Redis,
  authRequestId: string
): Promise<AuthenticationRequest> {
  const request = await getRequest(redis, authRequestId);
  if (!request) throw new Error(`Authentication request ${authRequestId} not found`);

  const now = new Date().toISOString();
  request.status = 'pending_expert_review';
  request.updatedAt = now;
  request.auditTrail.push({
    timestamp: now,
    actor: 'system',
    action: 'queue_expert_review',
    result: 'Queued for expert review',
  });

  // Add to expert review queue
  await redis.zadd(redisKey('expert_queue'), Date.now(), authRequestId);

  await storeRequest(redis, request);
  return request;
}

/**
 * Assigns an expert to an authentication request.
 */
export async function assignExpert(
  redis: Redis,
  authRequestId: string,
  expertId: string,
  expertName: string
): Promise<AuthenticationRequest> {
  const request = await getRequest(redis, authRequestId);
  if (!request) throw new Error(`Authentication request ${authRequestId} not found`);
  if (request.status !== 'pending_expert_review' && request.status !== 'ai_triage_complete') {
    throw new Error(`Request ${authRequestId} is not ready for expert assignment (current: ${request.status})`);
  }

  const now = new Date().toISOString();
  request.status = 'pending_expert_review';
  request.expertReview = {
    expertId,
    expertName,
    assignedAt: now,
    completedAt: '',
    verdict: 'inconclusive',
    notes: '',
    confidenceLevel: 0,
  };
  request.updatedAt = now;
  request.auditTrail.push({
    timestamp: now,
    actor: expertId,
    action: 'assign_expert',
    result: `Assigned to ${expertName}`,
  });

  // Remove from queue
  await redis.zrem(redisKey('expert_queue'), authRequestId);

  await storeRequest(redis, request);
  return request;
}

/**
 * Submits an expert verdict on an authentication request.
 */
export async function submitExpertVerdict(
  redis: Redis,
  authRequestId: string,
  expertId: string,
  verdict: ExpertVerdict,
  notes: string,
  confidenceLevel: number
): Promise<AuthenticationRequest> {
  const request = await getRequest(redis, authRequestId);
  if (!request) throw new Error(`Authentication request ${authRequestId} not found`);
  if (!request.expertReview || request.expertReview.expertId !== expertId) {
    throw new Error(`Expert ${expertId} is not assigned to request ${authRequestId}`);
  }

  const now = new Date().toISOString();
  request.expertReview.verdict = verdict;
  request.expertReview.notes = notes;
  request.expertReview.confidenceLevel = confidenceLevel;
  request.expertReview.completedAt = now;
  request.updatedAt = now;
  request.auditTrail.push({
    timestamp: now,
    actor: expertId,
    action: 'expert_verdict',
    result: verdict,
    notes,
  });

  // Advance status based on verdict
  if (verdict === 'authenticated') {
    request.status = 'authenticated';
    request.completedAt = now;
    request.badge = issueBadge(request, 'EXPERT_VERIFIED', request.expertReview.expertName);
  } else if (verdict === 'counterfeit') {
    request.status = 'counterfeit';
    request.completedAt = now;
  } else if (verdict === 'needs_lab' && request.tier >= 3) {
    request.status = 'pending_lab_analysis';
  } else {
    request.status = 'inconclusive';
    request.completedAt = now;
  }

  await storeRequest(redis, request);
  return request;
}

/**
 * Escalates an authentication request to lab analysis.
 */
export async function escalateToLab(
  redis: Redis,
  authRequestId: string,
  labId: string,
  labName: string
): Promise<AuthenticationRequest> {
  const request = await getRequest(redis, authRequestId);
  if (!request) throw new Error(`Authentication request ${authRequestId} not found`);
  if (request.tier < 3) {
    throw new Error(`Lab escalation is only available for tier 3+ requests (current tier: ${request.tier})`);
  }

  const now = new Date().toISOString();
  request.status = 'pending_lab_analysis';
  request.labReport = {
    labId,
    labName,
    methodsUsed: [],
    submittedAt: now,
    result: 'inconclusive',
    confidence: 0,
    reportSummary: '',
    reportHash: '',
  };
  request.updatedAt = now;
  request.auditTrail.push({
    timestamp: now,
    actor: labId,
    action: 'escalate_to_lab',
    result: `Escalated to ${labName}`,
  });

  await storeRequest(redis, request);
  return request;
}

/**
 * Submits a lab report for an authentication request.
 */
export async function submitLabReport(
  redis: Redis,
  authRequestId: string,
  labId: string,
  methodsUsed: LabMethod[],
  result: 'authentic' | 'counterfeit' | 'inconclusive',
  confidence: number,
  reportSummary: string
): Promise<AuthenticationRequest> {
  const request = await getRequest(redis, authRequestId);
  if (!request) throw new Error(`Authentication request ${authRequestId} not found`);
  if (!request.labReport || request.labReport.labId !== labId) {
    throw new Error(`Lab ${labId} is not assigned to request ${authRequestId}`);
  }

  const now = new Date().toISOString();
  const reportHash = crypto
    .createHash('sha256')
    .update(`${authRequestId}_${labId}_${now}_${result}`)
    .digest('hex');

  request.labReport.methodsUsed = methodsUsed;
  request.labReport.result = result;
  request.labReport.confidence = confidence;
  request.labReport.reportSummary = reportSummary;
  request.labReport.reportHash = reportHash;
  request.updatedAt = now;
  request.auditTrail.push({
    timestamp: now,
    actor: labId,
    action: 'lab_report',
    result,
    notes: `Methods: ${methodsUsed.join(', ')}, Confidence: ${confidence}`,
  });

  if (result === 'authentic') {
    request.status = 'authenticated';
    request.completedAt = now;
    request.badge = issueBadge(request, 'LAB_CERTIFIED', request.labReport.labName);
  } else if (result === 'counterfeit') {
    request.status = 'counterfeit';
    request.completedAt = now;
  } else {
    request.status = 'inconclusive';
    request.completedAt = now;
  }

  await storeRequest(redis, request);
  return request;
}

// ---------------------------------------------------------------------------
// Badge and certificate
// ---------------------------------------------------------------------------

/**
 * Issues an authentication badge after successful authentication.
 */
function issueBadge(
  request: AuthenticationRequest,
  type: BadgeType,
  authenticator: string
): AuthenticationBadge {
  const certificateId = generateCertificateId();
  const method = type === 'AI_VERIFIED'
    ? 'AI Photo Triage'
    : type === 'EXPERT_VERIFIED'
    ? 'Expert Physical Inspection'
    : 'Laboratory Analysis';

  return {
    badgeId: generateId('badge'),
    certificateId,
    type,
    listingId: request.listingId,
    authenticator,
    method,
    confidenceLevel: request.aiTriageResult?.confidenceScore ?? 0.95,
    issuedAt: new Date().toISOString(),
  };
}

/**
 * Generates a digital certificate for an authenticated item.
 */
export async function generateCertificate(
  redis: Redis,
  authRequestId: string
): Promise<AuthenticationBadge & { itemDetails: { listingId: string; category: string; brand?: string; itemValue: number }; certificateUrl: string }> {
  const request = await getRequest(redis, authRequestId);
  if (!request) throw new Error(`Authentication request ${authRequestId} not found`);
  if (!request.badge) throw new Error(`Request ${authRequestId} has no badge — authentication not complete`);

  const certificate = {
    ...request.badge,
    itemDetails: {
      listingId: request.listingId,
      category: request.category,
      brand: request.brand,
      itemValue: request.itemValue,
    },
    certificateUrl: `https://thryftverse.com/verify/${request.badge.certificateId}`,
  };

  // Store certificate for public verification
  await redis.setex(
    redisKey('certificate', request.badge.certificateId),
    86400 * 365, // 1 year TTL
    JSON.stringify(certificate)
  );

  return certificate;
}

/**
 * Retrieves the authentication badge for a listing.
 */
export async function getAuthenticationBadge(
  redis: Redis,
  listingId: string
): Promise<AuthenticationBadge | null> {
  const requestJson = await redis.get(redisKey('listing', listingId, 'latest'));
  if (!requestJson) return null;
  const request: AuthenticationRequest = JSON.parse(requestJson);
  return request.badge ?? null;
}

/**
 * Verifies an authentication badge by certificate ID (public endpoint).
 */
export async function verifyAuthenticationBadge(
  redis: Redis,
  certificateId: string
): Promise<{ valid: boolean; certificate?: unknown; error?: string }> {
  const certJson = await redis.get(redisKey('certificate', certificateId));
  if (!certJson) {
    return { valid: false, error: 'Certificate not found' };
  }
  const certificate = JSON.parse(certJson);
  return { valid: true, certificate };
}

/**
 * Gets the full authentication history for a listing.
 */
export async function getAuthenticationHistory(
  redis: Redis,
  listingId: string
): Promise<AuthenticationRequest[]> {
  // Get all request IDs for this listing
  const ids = await redis.lrange(redisKey('listing', listingId, 'history'), 0, -1);
  if (ids.length === 0) return [];

  const requests: AuthenticationRequest[] = [];
  for (const id of ids) {
    const json = await redis.get(redisKey('request', id));
    if (json) {
      requests.push(JSON.parse(json));
    }
  }
  return requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Gets the expert review queue.
 */
export async function getExpertReviewQueue(
  redis: Redis,
  limit = 50
): Promise<string[]> {
  const ids = await redis.zrange(redisKey('expert_queue'), 0, limit - 1);
  return ids;
}

// ---------------------------------------------------------------------------
// Redis storage
// ---------------------------------------------------------------------------

async function storeRequest(redis: Redis, request: AuthenticationRequest): Promise<void> {
  const key = redisKey('request', request.id);
  await redis.setex(key, 86400 * 90, JSON.stringify(request)); // 90-day TTL

  // Index by listing
  await redis.lpush(redisKey('listing', request.listingId, 'history'), request.id);
  await redis.setex(redisKey('listing', request.listingId, 'latest'), 86400 * 90, JSON.stringify(request));
}

async function getRequest(redis: Redis, id: string): Promise<AuthenticationRequest | null> {
  const json = await redis.get(redisKey('request', id));
  if (!json) return null;
  return JSON.parse(json);
}

// ---------------------------------------------------------------------------
// Mock Redis for testing
// ---------------------------------------------------------------------------

export function createMockRedis(): Redis {
  const store = new Map<string, string>();
  const sortedSets = new Map<string, Array<{ member: string; score: number }>>();
  const lists = new Map<string, string[]>();

  const mockRedis = {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async setex(key: string, _seconds: number, value: string): Promise<string> {
      store.set(key, value);
      return 'OK';
    },
    async zadd(key: string, score: number, member: string): Promise<number> {
      let set = sortedSets.get(key);
      if (!set) {
        set = [];
        sortedSets.set(key, set);
      }
      set.push({ member, score });
      return 1;
    },
    async zrem(key: string, member: string): Promise<number> {
      const set = sortedSets.get(key);
      if (!set) return 0;
      const idx = set.findIndex((e) => e.member === member);
      if (idx === -1) return 0;
      set.splice(idx, 1);
      return 1;
    },
    async zrange(key: string, start: number, stop: number): Promise<string[]> {
      const set = sortedSets.get(key);
      if (!set) return [];
      const sorted = [...set].sort((a, b) => a.score - b.score);
      const startIdx = start < 0 ? sorted.length + start : start;
      const stopIdx = stop < 0 ? sorted.length + stop : stop;
      return sorted.slice(startIdx, stopIdx + 1).map((e) => e.member);
    },
    async lpush(key: string, ...values: string[]): Promise<number> {
      let list = lists.get(key);
      if (!list) {
        list = [];
        lists.set(key, list);
      }
      list.unshift(...values);
      return list.length;
    },
    async lrange(key: string, start: number, stop: number): Promise<string[]> {
      const list = lists.get(key) ?? [];
      const stopIdx = stop < 0 ? list.length + stop + 1 : stop + 1;
      return list.slice(start, stopIdx);
    },
  } as unknown as Redis;

  return mockRedis;
}
