// ── Publish draft + cancel actions ─────────────────────────────────
// Sheet actions that persist or abandon work without publishing:
// save-draft (from review and from error), and cancel-upload with its
// confirmation alert. Extracted verbatim from useCreatorPublishWorkflow.ts.
import { useCallback, type MutableRefObject } from 'react';
import { Alert } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { useHaptic } from '../../hooks/useHaptic';
import type { UseUploadManagerResult } from '../core/upload/useUploadManager';
import type { PublishGuard } from '../core/projectStore/compositionContract';
import { REVIEW_STATE, type PublishState } from './publishWorkflowShared';

export interface PublishDraftActionsParams {
  haptic: ReturnType<typeof useHaptic>;
  saveDraft: () => Promise<void>;
  onClose: () => void;
  uploadManager: UseUploadManagerResult;
  progressWidth: SharedValue<number>;
  publishGuardRef: MutableRefObject<PublishGuard>;
  publishAbortRef: MutableRefObject<AbortController | null>;
  setPublishState: (state: PublishState) => void;
  setPublicationAttemptId: (id: string) => void;
  setScheduleAttemptId: (id: string) => void;
}

export function usePublishDraftActions({
  haptic,
  saveDraft,
  onClose,
  uploadManager,
  progressWidth,
  publishGuardRef,
  publishAbortRef,
  setPublishState,
  setPublicationAttemptId,
  setScheduleAttemptId }: PublishDraftActionsParams) {
  // Save draft with a visible "Saving draft…" state so the user knows
  // their work is being persisted, not silently swallowed.
  const handleSaveDraftWithState = useCallback(async () => {
    haptic.light();
    setPublishState({ tag: 'saving' });
    try {
      await saveDraft();
      setPublishState(REVIEW_STATE);
    } catch {
      setPublishState({ tag: 'error', message: "Couldn't save draft. Try again.", canRetry: false, canSaveDraft: false });
    }
  }, [haptic, saveDraft, setPublishState]);

  // Save as draft from the error state — persists the document and closes
  // the sheet so the user can return to it later.
  const handleSaveDraftFromError = useCallback(async () => {
    haptic.light();
    try {
      await saveDraft();
      progressWidth.value = 0;
      publishGuardRef.current.reset();
      setPublicationAttemptId('');
      setScheduleAttemptId('');
      setPublishState(REVIEW_STATE);
      onClose();
    } catch {
      setPublishState({ tag: 'error', message: "Couldn't save draft. Try again.", canRetry: false, canSaveDraft: false });
    }
  }, [haptic, saveDraft, onClose, progressWidth, publishGuardRef, setPublishState, setPublicationAttemptId, setScheduleAttemptId]);

  // Cancel an in-progress upload: abort all active jobs for this document
  // and return to the review stage so the user can adjust and retry.
  // Shows a confirmation alert first — accidental cancel loses all progress.
  const handleCancelUpload = useCallback(() => {
    haptic.light();
    Alert.alert(
      'Cancel upload?',
      'Your upload progress will be lost.',
      [
        { text: 'Keep uploading', style: 'cancel' },
        {
          text: 'Cancel upload',
          style: 'destructive',
          onPress: () => {
            haptic.medium();
            void (async () => {
              for (const job of uploadManager.jobs) {
                if (job.status !== 'completed' && job.status !== 'failed') {
                  await uploadManager.cancelJob(job.id);
                }
              }
              progressWidth.value = 0;
              publishGuardRef.current.reset();
              setPublicationAttemptId('');
              setScheduleAttemptId('');
              publishAbortRef.current?.abort();
              setPublishState(REVIEW_STATE);
            })();
          },
        },
      ],
    );
  }, [haptic, uploadManager, progressWidth, publishGuardRef, publishAbortRef, setPublishState, setPublicationAttemptId, setScheduleAttemptId]);

  return { handleSaveDraftWithState, handleSaveDraftFromError, handleCancelUpload };
}
