import { fetchJson } from '../lib/apiClient';

/**
 * Creator publication orchestrator client.
 *
 * This is the P0 fix for the publishing-lifecycle architectural disconnect
 * (research report 23). The native publisher previously called createLookOnApi
 * / createPosterStory directly, bypassing server creator documents entirely.
 * The new POST /creator/documents/:id/publications endpoint creates the public
 * projection transactionally inside the same commit that writes the
 * creator_publications row — so the document revision and the public object
 * can never diverge.
 *
 * This service also provides unknown-outcome recovery: when the network drops
 * after a publish command is sent but before the response is received, the
 * client can resolve the authoritative outcome by idempotency key using
 * GET /creator/documents/:id/publications/:idempotencyKey.
 */

export type PublicationDestination = 'look' | 'poster' | 'moodboard';

export interface ExpectedMediaEntry {
  layerId: string;
  finalizationId: string;
  assetId?: string;
  mediaType: 'image' | 'video';
  suppliedUrl: string;
  role?: string;
}

export interface PublishCommand {
  revision: number;
  destination: PublicationDestination;
  audience?: 'public' | 'private' | 'closeFriends';
  expiresInHours?: number;
  expectedMedia: ExpectedMediaEntry[];
  compositionDocument?: unknown;
  rightsSnapshotId?: string;
  /** Server lock_version at save time — enables optimistic concurrency on publish. */
  expectedLockVersion?: number;
  /** Canonical SHA-256 hash of the document JSON at save time. */
  expectedDocumentHash?: string;
}

export interface PublicationResult {
  ok: boolean;
  documentId: string;
  publicationId: string;
  targetId: string;
  destination: PublicationDestination;
  revisionNumber: number;
  state: string;
  idempotentReplay: boolean;
  error?: string;
  code?: string;
}

export interface PublicationLookupResult {
  ok: boolean;
  documentId: string;
  publicationId: string;
  targetId: string;
  destination: PublicationDestination;
  revisionNumber: number;
  state: string;
  publishedAt: string;
  error?: string;
  code?: string;
}

export interface PublicationHistoryEntry {
  id: string;
  revisionNumber: number;
  destination: PublicationDestination;
  targetId: string;
  state: string;
  publishedAt: string;
}

export interface PublicationHistoryResult {
  ok: boolean;
  publications: PublicationHistoryEntry[];
}

/**
 * Send the canonical publish command to the publication orchestrator.
 *
 * The idempotency key should be a unique publication attempt ID generated
 * by the caller before sending. A retried publish after a lost response
 * uses the same key to replay safely. A new publish attempt (after edit,
 * retry from error) uses a new key. The caller should persist this key
 * before sending so unknown-outcome recovery can use it.
 */
export async function publishCreatorDocument(
  documentId: string,
  command: PublishCommand,
  idempotencyKey?: string,
): Promise<PublicationResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = idempotencyKey ?? `pub_${documentId}_${command.revision}`;
  headers['Idempotency-Key'] = key;

  return fetchJson<PublicationResult>(
    `/creator/documents/${documentId}/publications`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(command),
    },
  );
}

/**
 * Resolve an unknown outcome after a lost network response.
 *
 * The client sent a publish command but never received the response. The
 * outcome is ambiguous — not a success, not a failure. This lookup resolves
 * it against the authoritative creator_publications row.
 *
 * Returns the publication if the server committed it, or a 404 if no
 * publication exists for this key (the command may not have reached the
 * server — safe to retry).
 */
export async function lookupPublicationByKey(
  documentId: string,
  idempotencyKey: string,
): Promise<PublicationLookupResult | null> {
  try {
    return await fetchJson<PublicationLookupResult>(
      `/creator/documents/${documentId}/publications/${encodeURIComponent(idempotencyKey)}`,
    );
  } catch (error) {
    // 404 means no publication found — the command didn't reach the server.
    // This is an honest "not yet published" result, not an error to surface.
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * List all publications for a document — the revision history as a
 * publication timeline. Used by the revision history surface.
 */
export async function fetchPublicationHistory(
  documentId: string,
): Promise<PublicationHistoryResult> {
  return fetchJson<PublicationHistoryResult>(
    `/creator/documents/${documentId}/publications`,
  );
}

// ── Scheduling ────────────────────────────────────────────────────────

export interface ScheduleCreatorDocumentParams {
  dueAt: string;
  timezone?: string;
  publishCommand: PublishCommand;
  /** Idempotency key for unknown-outcome reconciliation. */
  idempotencyKey?: string;
  /**
   * When true, the server treats the schedule as due immediately and
   * triggers the publication sweep right away — the async "publish now"
   * path. The request returns instantly instead of blocking on the
   * server-side media render; the caller polls `fetchScheduleInfo` for
   * the terminal state.
   */
  immediate?: boolean;
}

export interface ScheduleResult {
  ok: boolean;
  scheduleId: string;
  documentId: string;
  dueAt: string;
  timezone: string;
  immediate?: boolean;
  idempotencyKey?: string;
  error?: string;
}

/**
 * Create a server-owned scheduled publication.
 *
 * The publish command is frozen at schedule time and executed by the
 * scheduled-publication worker at due_at. This is the honest scheduling
 * path: the content is NOT published immediately — it publishes exactly
 * once at the scheduled time.
 *
 * The idempotency key is sent via the Idempotency-Key header so the
 * server can deduplicate and the client can resolve unknown outcomes.
 */
export async function schedulePublication(
  documentId: string,
  params: ScheduleCreatorDocumentParams,
): Promise<ScheduleResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey;
  }
  return fetchJson<ScheduleResult>(
    `/creator/documents/${documentId}/schedule`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dueAt: params.dueAt,
        timezone: params.timezone ?? 'UTC',
        publishCommand: params.publishCommand,
        ...(params.immediate ? { immediate: true } : {}),
      }),
    },
  );
}

/**
 * Cancel a pending scheduled publication.
 * Increments the schedule version so an already-leased stale job
 * cannot publish.
 */
export async function cancelScheduledPublication(
  documentId: string,
): Promise<{ ok: boolean; cancelled: number }> {
  return fetchJson<{ ok: boolean; cancelled: number }>(
    `/creator/documents/${documentId}/schedule`,
    { method: 'DELETE' },
  );
}

/**
 * Get the current schedule for a document (if any).
 */
export interface ScheduleInfo {
  id: string;
  dueAt: string;
  timezone: string;
  version: number;
  state: 'pending' | 'claimed' | 'published' | 'failed' | 'cancelled';
  attempts: number;
  publicationId: string | null;
  /** Published entity id (look id / story id), resolved via the joined
   *  creator_publications row once the schedule reaches 'published'. */
  targetId: string | null;
  failureReason: string | null;
}

export async function fetchScheduleInfo(
  documentId: string,
): Promise<{ ok: boolean; schedule: ScheduleInfo | null }> {
  return fetchJson<{ ok: boolean; schedule: ScheduleInfo | null }>(
    `/creator/documents/${documentId}/schedule`,
  );
}

// ── Async publish ("publish now, process on server") ────────────────────

export class PublishAsyncTimeoutError extends Error {
  readonly scheduleId: string;
  constructor(scheduleId: string) {
    super('Publication is still processing on the server');
    this.name = 'PublishAsyncTimeoutError';
    this.scheduleId = scheduleId;
  }
}

export class PublishAsyncFailedError extends Error {
  readonly scheduleId: string;
  readonly failureReason: string | null;
  constructor(scheduleId: string, failureReason: string | null) {
    super(failureReason ?? 'Publication failed on the server');
    this.name = 'PublishAsyncFailedError';
    this.scheduleId = scheduleId;
    this.failureReason = failureReason;
  }
}

export interface PublishAsyncOptions {
  /** Poll interval in ms (default 1500). */
  pollIntervalMs?: number;
  /** Total wait budget in ms before giving up with a timeout error
   *  (default 150_000 — server renders of multi-frame video compositions
   *  can legitimately take tens of seconds). */
  timeoutMs?: number;
  /** Optional callback fired on each poll with the latest schedule state. */
  onState?: (state: ScheduleInfo['state']) => void;
  /** AbortSignal to cancel the poll loop (does NOT cancel the server-side
   *  publication — the schedule row keeps executing). */
  signal?: AbortSignal;
}

/**
 * Publish a document without blocking on the server-side render.
 *
 * Creates a server-owned schedule row due immediately (`immediate: true`),
 * which the publication sweep worker claims within ~1s and executes via the
 * same canonical `publishCreatorDocumentTransaction` used by the sync
 * publish route. The client then polls `fetchScheduleInfo` until the
 * schedule reaches a terminal state.
 *
 * Returns a PublicationResult-shaped object so callers can treat sync and
 * async publishes identically. Throws `PublishAsyncFailedError` when the
 * worker reports a terminal failure, or `PublishAsyncTimeoutError` when the
 * wait budget is exhausted — in the timeout case the schedule may still
 * complete later (the persisted attempt + push notification cover that).
 */
export async function publishCreatorDocumentAsync(
  documentId: string,
  command: PublishCommand,
  idempotencyKey: string,
  options: PublishAsyncOptions = {},
): Promise<PublicationResult> {
  const { pollIntervalMs = 1500, timeoutMs = 150_000, onState, signal } = options;

  const schedule = await schedulePublication(documentId, {
    dueAt: new Date().toISOString(),
    publishCommand: command,
    idempotencyKey,
    immediate: true,
  });

  if (!schedule.ok || !schedule.scheduleId) {
    throw new Error(schedule.error ?? 'Failed to enqueue publication');
  }

  const deadline = Date.now() + timeoutMs;
  let lastState: ScheduleInfo['state'] | null = null;

  // First poll after a short delay — the sweep needs a moment to claim and
  // execute. The interval is the same for every poll; no fake progress.
  await new Promise((r) => setTimeout(r, 1000));

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new DOMException('Publish polling aborted', 'AbortError');
    }

    const { schedule: info } = await fetchScheduleInfo(documentId);

    // fetchScheduleInfo returns the latest non-cancelled schedule. If it's
    // a different row (a newer schedule superseded ours), keep polling —
    // our row's outcome is resolvable via lookupScheduleByKey.
    if (info && info.id === schedule.scheduleId) {
      if (info.state !== lastState) {
        lastState = info.state;
        onState?.(info.state);
      }

      if (info.state === 'published') {
        let publicationId = info.publicationId;
        let targetId = info.targetId;
        if (!publicationId || !targetId) {
          // The schedule says published but the join came back empty —
          // resolve through the publication row directly. The worker's
          // publication idempotency key is deterministic.
          const pub = await lookupPublicationByKey(
            documentId,
            `sched_${schedule.scheduleId}_${info.version}`,
          );
          if (pub?.publicationId) publicationId = pub.publicationId;
          if (pub?.targetId) targetId = pub.targetId;
        }
        return {
          ok: true,
          documentId,
          publicationId: publicationId ?? '',
          targetId: targetId ?? '',
          destination: command.destination,
          revisionNumber: command.revision,
          state: 'published',
          idempotentReplay: false,
        };
      }
      if (info.state === 'failed') {
        throw new PublishAsyncFailedError(schedule.scheduleId, info.failureReason);
      }
      // 'pending' | 'claimed' → still processing, keep polling.
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new PublishAsyncTimeoutError(schedule.scheduleId);
}

// ── Schedule reconciliation ────────────────────────────────────────────

export interface ScheduleLookupResult {
  ok: boolean;
  documentId: string;
  scheduleId: string;
  dueAt: string;
  timezone: string;
  version: number;
  state: 'pending' | 'claimed' | 'published' | 'failed' | 'cancelled';
  attempts: number;
  publicationId: string | null;
  targetId: string | null;
  failureReason: string | null;
  error?: string;
  code?: string;
}

/**
 * Resolve an unknown schedule outcome after a lost network response.
 *
 * The client sent a POST /schedule command but never received the
 * response. The outcome is ambiguous — the schedule may or may not have
 * been created. This lookup resolves it against the authoritative
 * creator_schedules row by idempotency key.
 *
 * Returns the schedule if the server committed it, or null if no
 * schedule exists for this key (the command may not have reached the
 * server — safe to retry).
 */
export async function lookupScheduleByKey(
  documentId: string,
  idempotencyKey: string,
): Promise<ScheduleLookupResult | null> {
  try {
    return await fetchJson<ScheduleLookupResult>(
      `/creator/documents/${documentId}/schedule/${encodeURIComponent(idempotencyKey)}`,
    );
  } catch (error) {
    // 404 means no schedule found — the command didn't reach the server.
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

// ── Collaborators (P2.12) ─────────────────────────────────────────────

export interface Collaborator {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  state: 'active' | 'invited' | 'suspended' | 'removed';
  joinedAt: string;
}

export async function fetchCollaborators(
  documentId: string,
): Promise<{ ok: boolean; collaborators: Collaborator[] }> {
  return fetchJson<{ ok: boolean; collaborators: Collaborator[] }>(
    `/creator/documents/${documentId}/collaborators`,
  );
}

export async function inviteCollaborator(
  documentId: string,
  userId: string,
  role: 'editor' | 'viewer' = 'viewer',
): Promise<{ ok: boolean; documentId: string; userId: string; role: string; state: string }> {
  return fetchJson(
    `/creator/documents/${documentId}/collaborators`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    },
  );
}

export async function acceptInvitation(
  documentId: string,
  userId: string,
): Promise<{ ok: boolean; documentId: string; userId: string; role: string; state: string }> {
  return fetchJson(
    `/creator/documents/${documentId}/collaborators/${userId}/accept`,
    { method: 'POST' },
  );
}

export async function removeCollaborator(
  documentId: string,
  userId: string,
): Promise<{ ok: boolean; removed: number }> {
  return fetchJson(
    `/creator/documents/${documentId}/collaborators/${userId}`,
    { method: 'DELETE' },
  );
}

export async function changeCollaboratorRole(
  documentId: string,
  userId: string,
  role: 'editor' | 'viewer',
): Promise<{ ok: boolean; documentId: string; userId: string; role: string }> {
  return fetchJson(
    `/creator/documents/${documentId}/collaborators/${userId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
}

// ── Operation log (P2.12) ─────────────────────────────────────────────

export interface CreatorOperation {
  id: string;
  actorId: string;
  operation: string;
  targetUserId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export async function fetchOperationLog(
  documentId: string,
): Promise<{ ok: boolean; operations: CreatorOperation[] }> {
  return fetchJson<{ ok: boolean; operations: CreatorOperation[] }>(
    `/creator/documents/${documentId}/operations`,
  );
}

// ── Live presence (P2.13) ─────────────────────────────────────────────

export interface PresenceEntry {
  userId: string;
  activity: 'viewing' | 'editing' | 'idle';
  lastSeenAt: string;
}

export async function heartbeatPresence(
  documentId: string,
  socketId: string,
  activity: 'viewing' | 'editing' | 'idle' = 'viewing',
): Promise<{ ok: boolean }> {
  return fetchJson(
    `/creator/documents/${documentId}/presence`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socketId, activity }),
    },
  );
}

export async function fetchPresence(
  documentId: string,
): Promise<{ ok: boolean; presence: PresenceEntry[] }> {
  return fetchJson<{ ok: boolean; presence: PresenceEntry[] }>(
    `/creator/documents/${documentId}/presence`,
  );
}

export async function clearPresence(
  documentId: string,
  socketId?: string,
): Promise<{ ok: boolean }> {
  const qs = socketId ? `?socketId=${encodeURIComponent(socketId)}` : '';
  return fetchJson(
    `/creator/documents/${documentId}/presence${qs}`,
    { method: 'DELETE' },
  );
}

// ── C2PA content credentials (P2.14) ──────────────────────────────────

export interface ContentCredential {
  id: string;
  manifest: Record<string, unknown>;
  specVersion: string;
  claimGenerator: string;
  source: 'platform' | 'imported' | 'third_party';
  assertionTypes: string[];
  hasAiDisclosure: boolean;
  verified: boolean;
  verifiedAt: string | null;
  signatureFingerprint: string | null;
  createdAt: string;
}

export async function attachContentCredentials(
  assetId: string,
  params: {
    manifest: Record<string, unknown>;
    specVersion?: string;
    claimGenerator?: string;
    source?: 'platform' | 'imported' | 'third_party';
    assertionTypes?: string[];
    hasAiDisclosure?: boolean;
    signatureFingerprint?: string;
  },
): Promise<{ ok: boolean; credentialId: string; mediaAssetId: string }> {
  return fetchJson(
    `/media/${assetId}/content-credentials`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  );
}

export async function fetchContentCredentials(
  assetId: string,
): Promise<{ ok: boolean; credentials: ContentCredential[] }> {
  return fetchJson<{ ok: boolean; credentials: ContentCredential[] }>(
    `/media/${assetId}/content-credentials`,
  );
}
