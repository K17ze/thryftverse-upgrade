import AsyncStorage from '@react-native-async-storage/async-storage';
import { lookupPublicationByKey, lookupScheduleByKey } from '../services/creatorPublicationsApi';

/**
 * Durable publication attempt persistence.
 *
 * Replaces the in-memory `useRef` that previously held the publication
 * attempt ID (idempotency key). If the app unmounted or the process died
 * after the publish request left the device but before the response
 * arrived, the attempt ID was lost — making unknown-outcome recovery
 * impossible. This store persists every attempt to AsyncStorage so
 * `reconcilePublicationAttempts()` can resolve ambiguous outcomes on
 * the next launch.
 *
 * Both publish commands and schedule commands are tracked. The
 * `commandType` field distinguishes them so reconciliation calls the
 * correct server endpoint:
 *  - 'publish'  → GET /creator/documents/:id/publications/:key
 *  - 'schedule' → GET /creator/documents/:id/schedule/:key
 */

const STORAGE_KEY = '@thryftverse/creator/publication_attempts';
/** Attempts older than this in 'sending' state are treated as 'unknown'. */
const SENDING_TIMEOUT_MS = 30_000;

export type PublicationAttemptState = 'sending' | 'unknown' | 'committed' | 'failed';

/** Which server command this attempt tracks. */
export type AttemptCommandType = 'publish' | 'schedule';

export interface PublicationAttempt {
  attemptId: string;
  documentId: string;
  expectedHash: string;
  destination: string;
  state: PublicationAttemptState;
  requestStartedAt: string;
  lastCheckedAt: string | null;
  targetId: string | null;
  failureCode: string | null;
  /** Distinguishes publish commands from schedule commands. */
  commandType: AttemptCommandType;
}

async function readAll(): Promise<PublicationAttempt[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PublicationAttempt[];
  } catch {
    return [];
  }
}

async function writeAll(attempts: PublicationAttempt[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
}

/** Persist a new publication attempt before sending the publish request. */
export async function savePublicationAttempt(attempt: PublicationAttempt): Promise<void> {
  const all = await readAll();
  all.push(attempt);
  await writeAll(all);
}

/** Update an attempt's state and associated fields. */
export async function updatePublicationAttemptState(
  attemptId: string,
  updates: Partial<Pick<PublicationAttempt, 'state' | 'targetId' | 'failureCode' | 'lastCheckedAt'>>,
): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((a) => a.attemptId === attemptId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...updates };
  await writeAll(all);
}

/** Remove a committed or failed attempt (cleanup). */
export async function removePublicationAttempt(attemptId: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((a) => a.attemptId !== attemptId));
}

/** Get all non-terminal attempts for UI display. */
export async function getPendingAttempts(): Promise<PublicationAttempt[]> {
  const all = await readAll();
  return all.filter((a) => a.state === 'sending' || a.state === 'unknown');
}

/** Get the most recent non-terminal attempt for a document. */
export async function getPendingAttemptForDocument(documentId: string): Promise<PublicationAttempt | null> {
  const pending = await getPendingAttempts();
  const forDoc = pending.filter((a) => a.documentId === documentId);
  if (forDoc.length === 0) return null;
  forDoc.sort((a, b) => b.requestStartedAt.localeCompare(a.requestStartedAt));
  return forDoc[0];
}

/**
 * Resolve ambiguous publication outcomes.
 *
 * Reads all 'sending'/'unknown' attempts, transitions stale 'sending'
 * entries to 'unknown', then calls the appropriate lookup endpoint for
 * each based on `commandType`:
 *  - 'publish'  → lookupPublicationByKey
 *  - 'schedule' → lookupScheduleByKey
 *
 * Updates the stored state based on the lookup result.
 */
export async function reconcilePublicationAttempts(): Promise<void> {
  const all = await readAll();
  const now = Date.now();
  let changed = false;

  // Transition stale 'sending' → 'unknown'
  for (const attempt of all) {
    if (attempt.state === 'sending') {
      const elapsed = now - new Date(attempt.requestStartedAt).getTime();
      if (elapsed > SENDING_TIMEOUT_MS) {
        attempt.state = 'unknown';
        changed = true;
      }
    }
  }

  // Lookup each 'unknown' attempt via the correct endpoint.
  for (const attempt of all) {
    if (attempt.state !== 'unknown') continue;
    try {
      if (attempt.commandType === 'schedule') {
        // Schedule reconciliation — look up the schedule row by key.
        const result = await lookupScheduleByKey(attempt.documentId, attempt.attemptId);
        if (result && result.ok) {
          attempt.state = 'committed';
          attempt.targetId = result.scheduleId;
          attempt.lastCheckedAt = new Date().toISOString();
          changed = true;
        } else {
          // 404 — the schedule command didn't reach the server.
          attempt.state = 'failed';
          attempt.failureCode = 'NOT_FOUND';
          attempt.lastCheckedAt = new Date().toISOString();
          changed = true;
        }
      } else {
        // Publish reconciliation — look up the publication row by key.
        const result = await lookupPublicationByKey(attempt.documentId, attempt.attemptId);
        if (result && result.ok) {
          attempt.state = 'committed';
          attempt.targetId = result.targetId;
          attempt.lastCheckedAt = new Date().toISOString();
          changed = true;
        } else {
          // 404 — the publish command didn't reach the server.
          attempt.state = 'failed';
          attempt.failureCode = 'NOT_FOUND';
          attempt.lastCheckedAt = new Date().toISOString();
          changed = true;
        }
      }
    } catch {
      // Lookup itself failed (network error) — leave as 'unknown' for
      // the next reconciliation cycle.
    }
  }

  if (changed) {
    await writeAll(all);
  }
}
