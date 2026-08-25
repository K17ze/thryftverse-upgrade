/**
 * Account Security API service.
 *
 * Provides typed access to the account-security endpoints introduced by
 * the fraud/scams/ATO flagship upgrade. The user-facing surface is
 * deliberately restrained: users see intervention state, session
 * inventory, and recovery actions — never numeric risk scores, raw
 * signals, or surveillance-like device details (FR-11).
 *
 * Design (AGENTS.md §4 — Anti-AI design policy):
 * - No decorative security score, no animated risk meter, no surveillance motif.
 * - The user sees plain-language state and a clear next action.
 * - Sessions are redacted: no token hashes, no raw device fingerprints.
 */

import { fetchJson } from '../lib/apiClient';

// ---------------------------------------------------------------------------
// User-safe intervention state (replaces /fraud/score and /fraud/signals)
// ---------------------------------------------------------------------------

export type InterventionState =
  | 'normal'
  | 'verification_required'
  | 'review_in_progress'
  | 'account_secured'
  | 'access_limited';

export interface UserSafeInterventionState {
  state: InterventionState;
  reasonFamily: string;
  nextAction: {
    label: string;
    route: string;
  };
  supportRoute: string;
  impactedCapabilities: string[];
}

export async function fetchInterventionState(): Promise<UserSafeInterventionState> {
  const payload = await fetchJson<{ ok: true; state: UserSafeInterventionState }>(
    '/fraud/intervention-state/me',
  );
  return payload.state;
}

// ---------------------------------------------------------------------------
// Session inventory (redacted, server-derived current-session marker)
// ---------------------------------------------------------------------------

export interface SecuritySessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  isCurrent: boolean;
  isRevoked: boolean;
  deviceName: string;
  platform: string;
}

export async function fetchSecuritySessions(): Promise<SecuritySessionInfo[]> {
  const payload = await fetchJson<{ ok: true; sessions: SecuritySessionInfo[] }>(
    '/account-security/sessions',
  );
  return payload.sessions;
}

export async function revokeSecuritySession(sessionId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/account-security/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
}

export async function revokeOtherSecuritySessions(): Promise<{ revokedCount: number }> {
  const payload = await fetchJson<{ ok: true; revokedCount: number }>(
    '/account-security/sessions/revoke-others',
    { method: 'POST' },
  );
  return { revokedCount: payload.revokedCount };
}

// ---------------------------------------------------------------------------
// Compromise declaration and recovery
// ---------------------------------------------------------------------------

export interface CompromiseIncidentInput {
  suspiciousSessionIds?: string[];
  details?: string;
}

export interface CompromiseIncidentResult {
  caseId: string;
  state: string;
  nextAction: {
    label: string;
    route: string;
  };
  impactedCapabilities: string[];
}

export async function declareCompromise(
  input: CompromiseIncidentInput,
): Promise<CompromiseIncidentResult> {
  const payload = await fetchJson<{ ok: true; incident: CompromiseIncidentResult }>(
    '/account-security/incidents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return payload.incident;
}

export interface CompromiseIncidentDetail {
  caseId: string;
  state: string;
  detectedAt: string;
  detectedBy: string;
  sessionsRevokedCount: number | null;
  payoutHoldActive: boolean;
  withdrawalHoldActive: boolean;
  protectedChangeHoldActive: boolean;
  recoveryMethod: string | null;
  recoveryStartedAt: string | null;
  cooldownUntil: string | null;
  nextAction: {
    label: string;
    route: string;
  };
  supportRoute: string;
  impactedCapabilities: string[];
}

export async function fetchIncident(caseId: string): Promise<CompromiseIncidentDetail> {
  const payload = await fetchJson<{ ok: true; incident: CompromiseIncidentDetail }>(
    `/account-security/incidents/${encodeURIComponent(caseId)}`,
  );
  return payload.incident;
}

// ---------------------------------------------------------------------------
// Recovery challenges
// ---------------------------------------------------------------------------

export interface RecoveryChallengeInput {
  factor: 'passkey' | 'totp' | 'email' | 'phone';
}

export interface RecoveryChallengeResult {
  challengeId: string;
  factor: string;
  expiresInSeconds: number;
}

export async function createRecoveryChallenge(
  caseId: string,
  input: RecoveryChallengeInput,
): Promise<RecoveryChallengeResult> {
  const payload = await fetchJson<{ ok: true; challenge: RecoveryChallengeResult }>(
    `/account-security/recovery/${encodeURIComponent(caseId)}/challenges`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return payload.challenge;
}

export async function verifyRecoveryChallenge(
  caseId: string,
  challengeId: string,
  proof: string,
): Promise<{ verified: boolean; nextAction: { label: string; route: string } }> {
  const payload = await fetchJson<{ ok: true; verified: boolean; nextAction: { label: string; route: string } }>(
    `/account-security/recovery/${encodeURIComponent(caseId)}/challenges/${encodeURIComponent(challengeId)}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof }),
    },
  );
  return { verified: payload.verified, nextAction: payload.nextAction };
}

// ---------------------------------------------------------------------------
// Restore access (never auto-releases money)
// ---------------------------------------------------------------------------

export interface RestoreResult {
  caseId: string;
  state: string;
  cooldownUntil: string;
  monitoredUntil: string;
  nextAction: {
    label: string;
    route: string;
  };
}

export async function restoreAccess(caseId: string): Promise<RestoreResult> {
  const payload = await fetchJson<{ ok: true; restoration: RestoreResult }>(
    `/account-security/incidents/${encodeURIComponent(caseId)}/restore`,
    { method: 'POST' },
  );
  return payload.restoration;
}

// ---------------------------------------------------------------------------
// Fraud report (user-facing, creates a durable PostgreSQL case)
// ---------------------------------------------------------------------------

export interface FraudReportInput {
  reportedUserId: string;
  reason: string;
  details?: string;
  referenceId?: string;
}

export interface FraudReportResult {
  caseId: string;
  status: string;
  createdAt: string;
}

export async function submitFraudReport(
  input: FraudReportInput,
): Promise<FraudReportResult> {
  const payload = await fetchJson<{ ok: true; caseId: string; status: string; createdAt: string }>(
    '/fraud/report',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return {
    caseId: payload.caseId,
    status: payload.status,
    createdAt: payload.createdAt,
  };
}
