// ── Publish result reconciliation ──────────────────────────────────
// The two "check the result" actions for unknown-outcome states:
//   handleCheckPublishResult — publication lookup by idempotency key
//   handleCheckSchedule      — schedule-row lookup by idempotency key
// Extracted verbatim from useCreatorPublishWorkflow.ts, including the
// persisted-attempt fallback for recovery after unmount/process death.
import { useCallback, useState, type MutableRefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  lookupPublicationByKey,
  lookupScheduleByKey } from '../../services/creatorPublicationsApi';
import {
  updatePublicationAttemptState,
  getPendingAttemptForDocument,
} from './publicationAttemptStore';
import { CreatorAnalytics } from '../shared/creatorAnalytics';
import type { CreatorDocument } from '../core/projectStore/composition';
import type { PublishGuard } from '../core/projectStore/compositionContract';
import type { useHaptic } from '../../hooks/useHaptic';
import { invalidateCachesAfterPublish, type PublishState } from './publishWorkflowShared';

export interface PublishReconciliationParams {
  document: CreatorDocument;
  haptic: ReturnType<typeof useHaptic>;
  progressWidth: SharedValue<number>;
  publishGuardRef: MutableRefObject<PublishGuard>;
  /** In-memory publish attempt ID; falls back to the persisted store. */
  publicationAttemptId: string;
  /** In-memory schedule attempt ID; falls back to the persisted store. */
  scheduleAttemptId: string;
  currentUserId: string | null;
  setPublishState: (state: PublishState) => void;
  updateMetadataLive: (updates: Partial<CreatorDocument['metadata']>) => void;
}

export function usePublishReconciliation({
  document,
  haptic,
  progressWidth,
  publishGuardRef,
  publicationAttemptId,
  scheduleAttemptId,
  currentUserId,
  setPublishState,
  updateMetadataLive }: PublishReconciliationParams) {
  const [isCheckingResult, setIsCheckingResult] = useState(false);

  const handleCheckPublishResult = useCallback(async () => {
    haptic.medium();
    setIsCheckingResult(true);
    try {
      // First, try the authoritative publication lookup by idempotency key.
      // The orchestrator's creator_publications row is the source of truth —
      // if it exists, the publish committed, regardless of whether the public
      // projection has propagated to the read model yet.
      // Use the in-memory attempt ID, or fall back to the persisted store
      // (for recovery after unmount/process death), then the legacy key.
      let attemptId = publicationAttemptId;
      if (!attemptId) {
        const pending = await getPendingAttemptForDocument(document.id);
        attemptId = pending?.attemptId ?? `pub_${document.id}_0`;
      }
      const publication = await lookupPublicationByKey(document.id, attemptId);
      if (publication && publication.ok) {
        publishGuardRef.current.complete(publication.targetId);
        invalidateCachesAfterPublish(publication.targetId, currentUserId);
        // Update the persisted attempt to committed.
        void updatePublicationAttemptState(attemptId, {
          state: 'committed',
          targetId: publication.targetId,
          lastCheckedAt: new Date().toISOString(),
        });
        progressWidth.value = 1;
        setPublishState({ tag: 'success', publishedId: publication.targetId });
        CreatorAnalytics.publishSuccess(document.type, publication.targetId);
        return;
      }

      // The keyed lookup is authoritative. A 404 means the publish did
      // not commit under this attempt's idempotency key — mark it failed
      // so the user can retry. Do NOT fall back to fetching the public
      // projection by document id: projection ids equal document ids, so
      // any earlier successful publication of this document would
      // satisfy that check and falsely report a stale artifact as the
      // result of this attempt.
      void updatePublicationAttemptState(attemptId, {
        state: 'failed',
        failureCode: 'NOT_FOUND',
        lastCheckedAt: new Date().toISOString(),
      });
      setPublishState({ tag: 'unknown', detail: 'No result yet. Check again.' });
    } catch {
      setPublishState({ tag: 'unknown', detail: 'No result yet. Check again.' });
    } finally {
      setIsCheckingResult(false);
    }
  }, [document.id, document.type, haptic, progressWidth, currentUserId, publicationAttemptId, publishGuardRef, setPublishState]);

  // Check schedule result — resolves an unknown schedule outcome by
  // looking up the schedule row by idempotency key. This is separate
  // from `handleCheckPublishResult` because schedule commands hit a
  // different server endpoint (GET /schedule/:key, not GET /publications/:key).
  const handleCheckSchedule = useCallback(async () => {
    haptic.medium();
    setIsCheckingResult(true);
    try {
      // Use the in-memory schedule attempt ID, or fall back to the
      // persisted store (for recovery after unmount/process death).
      let attemptId = scheduleAttemptId;
      if (!attemptId) {
        const pending = await getPendingAttemptForDocument(document.id);
        // Only consider schedule-type attempts for schedule reconciliation.
        if (pending?.commandType !== 'schedule') {
          setPublishState({ tag: 'scheduleFailed', error: "Couldn't connect. Try again." });
          return;
        }
        attemptId = pending.attemptId;
      }
      const schedule = await lookupScheduleByKey(document.id, attemptId);
      if (schedule && schedule.ok) {
        // Async publish-now completed on the server — the schedule reached
        // a terminal state. 'published' resolves to the success state with
        // the real targetId; 'failed' surfaces the worker's reason.
        if (schedule.state === 'published') {
          publishGuardRef.current.complete(document.id);
          void updatePublicationAttemptState(attemptId, {
            state: 'committed',
            targetId: schedule.targetId ?? schedule.publicationId ?? undefined,
            lastCheckedAt: new Date().toISOString(),
          });
          invalidateCachesAfterPublish(document.id, currentUserId);
          progressWidth.value = 1;
          setPublishState({ tag: 'success', publishedId: schedule.targetId ?? '' });
          CreatorAnalytics.publishSuccess(document.type, schedule.targetId ?? document.id);
          return;
        }
        if (schedule.state === 'failed') {
          void updatePublicationAttemptState(attemptId, {
            state: 'failed',
            failureCode: 'PUBLISH_FAILED',
            lastCheckedAt: new Date().toISOString(),
          });
          setPublishState({
            tag: 'error',
            message: schedule.failureReason ?? 'The post could not be published.',
            canRetry: true,
            canSaveDraft: true,
          });
          return;
        }
        if (schedule.state === 'cancelled') {
          // The row was superseded (a newer schedule/publish attempt
          // cancelled it) or explicitly cancelled — the publication will
          // never land from this attempt.
          void updatePublicationAttemptState(attemptId, {
            state: 'failed',
            failureCode: 'CANCELLED',
            lastCheckedAt: new Date().toISOString(),
          });
          setPublishState({
            tag: 'error',
            message: 'This publish attempt was replaced by a newer one.',
            canRetry: true,
            canSaveDraft: true,
          });
          return;
        }
        // Still processing. For an immediate publish (no scheduledFor)
        // this is an in-flight render — stay on the unknown state so the
        // user can check again, not the "Scheduled for…" confirmation.
        if (!document.metadata.scheduledFor) {
          setPublishState({
            tag: 'scheduleUnknown',
            detail: 'Still processing on the server — check again in a moment.',
          });
          return;
        }
        // Schedule was committed on the server. Transition to the
        // scheduled confirmation state.
        publishGuardRef.current.complete(document.id);
        void updatePublicationAttemptState(attemptId, {
          state: 'committed',
          targetId: schedule.scheduleId,
          lastCheckedAt: new Date().toISOString(),
        });
        progressWidth.value = 1;
        setPublishState({ tag: 'scheduled', dueAt: document.metadata.scheduledFor ?? '' });
        CreatorAnalytics.publishSuccess(document.type, `scheduled:${document.id}`);
        updateMetadataLive({ scheduledFor: undefined });
        return;
      }

      // 404 — the schedule command didn't reach the server. Mark as
      // failed so the user can safely retry with a new attempt ID.
      void updatePublicationAttemptState(attemptId, {
        state: 'failed',
        failureCode: 'NOT_FOUND',
        lastCheckedAt: new Date().toISOString(),
      });
      setPublishState({ tag: 'scheduleFailed', error: 'No schedule yet. Check again.' });
    } catch {
      setPublishState({ tag: 'scheduleUnknown', detail: "Couldn't connect. Try again." });
    } finally {
      setIsCheckingResult(false);
    }
  }, [document.id, document.type, haptic, progressWidth, scheduleAttemptId, document.metadata.scheduledFor, currentUserId, updateMetadataLive, publishGuardRef, setPublishState]);

  return { isCheckingResult, handleCheckPublishResult, handleCheckSchedule };
}
