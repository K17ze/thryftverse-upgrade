// ── Schedule retry ─────────────────────────────────────────────────
// Retry scheduling after a failure. With the server-owned schedule,
// this re-creates the schedule row (the old row was cancelled on
// retry). Extracted verbatim from useCreatorPublishWorkflow.ts —
// the attempt ID is generated per call and persisted before sending,
// exactly as in the original handler.
import { useCallback, type MutableRefObject } from 'react';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import { schedulePublication } from '../../services/creatorPublicationsApi';
import type { CreatorDocumentSaveResult } from '../../services/creatorDocumentsApi';
import {
  savePublicationAttempt,
  updatePublicationAttemptState,
} from './publicationAttemptStore';
import { CreatorAnalytics } from '../shared/creatorAnalytics';
import type { CreatorDocument } from '../core/projectStore/composition';
import type { useHaptic } from '../../hooks/useHaptic';
import type { useMotionConfig } from '../../hooks/useMotionConfig';
import {
  buildPublishCommand,
  generatePublicationAttemptId,
  isNetworkError,
  type PublishState } from './publishWorkflowShared';

export interface ScheduleRetryParams {
  document: CreatorDocument;
  serverDocMetaRef: MutableRefObject<CreatorDocumentSaveResult | null>;
  haptic: ReturnType<typeof useHaptic>;
  reduceMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  progressWidth: SharedValue<number>;
  setPublishState: (state: PublishState) => void;
  setScheduleAttemptId: (id: string) => void;
  updateMetadataLive: (updates: Partial<CreatorDocument['metadata']>) => void;
}

export function useScheduleRetry({
  document,
  serverDocMetaRef,
  haptic,
  reduceMotion,
  spring,
  progressWidth,
  setPublishState,
  setScheduleAttemptId,
  updateMetadataLive }: ScheduleRetryParams) {
  // Retry scheduling after a failure. With the new server-owned schedule,
  // this re-creates the schedule row (the old row was cancelled on retry).
  const handleRetrySchedule = useCallback(async () => {
    if (!document.metadata.scheduledFor) return;
    const serverMeta = serverDocMetaRef.current;
    if (!serverMeta) {
      setPublishState({ tag: 'scheduleFailed', error: 'Document metadata is not available. Save the document first.' });
      return;
    }
    haptic.medium();
    setPublishState({ tag: 'publishing' });
    progressWidth.value = reduceMotion ? 0.8 : withSpring(0.8, spring.entrance);
    let scheduleRequestStarted = false;
    const schedAttemptId = generatePublicationAttemptId();
    setScheduleAttemptId(schedAttemptId);
    try {
      // Build the same publish command via the shared pure builder so
      // the schedule retry's media contract is identical to the initial
      // schedule and publish-now paths.
      const retryCommand = buildPublishCommand(document, serverMeta);

      // Persist the schedule attempt before sending so unknown-outcome
      // recovery can resolve it.
      await savePublicationAttempt({
        attemptId: schedAttemptId,
        documentId: document.id,
        expectedHash: serverMeta.documentHash,
        destination: retryCommand.destination,
        state: 'sending',
        requestStartedAt: new Date().toISOString(),
        lastCheckedAt: null,
        targetId: null,
        failureCode: null,
        commandType: 'schedule',
      });

      scheduleRequestStarted = true;
      await schedulePublication(document.id, {
        dueAt: document.metadata.scheduledFor,
        publishCommand: retryCommand,
        idempotencyKey: schedAttemptId });

      // Update the persisted schedule attempt to committed.
      await updatePublicationAttemptState(schedAttemptId, {
        state: 'committed',
        lastCheckedAt: new Date().toISOString(),
      });

      progressWidth.value = reduceMotion ? 1 : withSpring(1, spring.success);
      setPublishState({ tag: 'scheduled', dueAt: document.metadata.scheduledFor });
      CreatorAnalytics.publishSuccess(document.type, `scheduled:${document.id}`);
      // Schedule intent is server-owned now — clear it so a later publish
      // doesn't silently re-schedule.
      updateMetadataLive({ scheduledFor: undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scheduling failed';
      const isUnknown = scheduleRequestStarted && isNetworkError(msg);
      if (isUnknown) {
        setPublishState({ tag: 'scheduleUnknown', detail: msg });
        CreatorAnalytics.scheduleUnknown(document.type);
      } else {
        setPublishState({ tag: 'scheduleFailed', error: msg });
        void updatePublicationAttemptState(schedAttemptId, {
          state: 'failed',
          failureCode: err instanceof Error ? err.name : 'UNKNOWN',
          lastCheckedAt: new Date().toISOString(),
        });
      }
      CreatorAnalytics.publishError(document.type, `Schedule retry failed: ${msg}`);
    }
  }, [document, haptic, reduceMotion, spring.entrance, spring.success, progressWidth, updateMetadataLive, serverDocMetaRef, setPublishState, setScheduleAttemptId]);

  return { handleRetrySchedule };
}
