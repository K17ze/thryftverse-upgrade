// ── Publish upload monitor ─────────────────────────────────────────
// All stage-driven side effects of the publish sheet: real-byte progress
// sync, stage haptics, sheet-open haptic, success auto-close, upload-job
// cleanup, persisted-attempt reconciliation on mount, and the AppState
// background warning. Extracted verbatim from useCreatorPublishWorkflow.ts
// — effect order is preserved exactly.
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import { Motion } from '../../theme/motionTokens';
import { reconcilePublicationAttempts } from './publicationAttemptStore';
import type { UseUploadManagerResult } from '../core/upload/useUploadManager';
import type { useHaptic } from '../../hooks/useHaptic';
import type { useToast } from '../../context/ToastContext';
import { REVIEW_STATE, type PublishState } from './publishWorkflowShared';

export interface PublishUploadMonitorParams {
  stage: PublishState['tag'];
  visible: boolean;
  onClose: () => void;
  uploadManager: UseUploadManagerResult;
  progressWidth: SharedValue<number>;
  reduceMotion: boolean;
  haptic: ReturnType<typeof useHaptic>;
  showToast: ReturnType<typeof useToast>['show'];
  setPublishState: (state: PublishState) => void;
}

export function usePublishUploadMonitor({
  stage,
  visible,
  onClose,
  uploadManager,
  progressWidth,
  reduceMotion,
  haptic,
  showToast,
  setPublishState }: PublishUploadMonitorParams) {
  // ── Smooth progress bar (UI-thread animated) ────────────────────
  // During the upload stage, the bar reflects **real transmitted bytes**
  // (uploadManager.progress, 0–1) mapped into the 0.15–0.7 range of the
  // overall publish flow. No fake interpolation — the bar advances only
  // when actual bytes are confirmed sent by XMLHttpRequest.onprogress.

  // Sync real upload byte progress to the progress bar during upload.
  useEffect(() => {
    if (stage !== 'uploading') return;
    if (uploadManager.totalBytes <= 0) return;
    // Map upload progress (0..1) into the 0.15–0.7 range.
    const fraction = 0.15 + uploadManager.progress * 0.55;
    progressWidth.value = reduceMotion
      ? fraction
      : withSpring(fraction, Motion.spring.settle);
  }, [stage, uploadManager.progress, uploadManager.totalBytes, reduceMotion, progressWidth]);

  // Haptic feedback when entering the success state
  useEffect(() => {
    if (stage === 'success') {
      haptic.success();
    } else if (stage === 'error') {
      haptic.error();
    } else if (stage === 'unknown' || stage === 'scheduleUnknown') {
      haptic.warning();
    }
  }, [stage, haptic]);

  // Light haptic when sheet opens
  useEffect(() => {
    if (visible) {
      haptic.light();
    }
  }, [visible, haptic]);

  // Auto-close the sheet shortly after a successful publish so the user
  // lands back on the studio without an extra tap. The "View" and "Done"
  // buttons remain as manual overrides for users who want to act sooner.
  useEffect(() => {
    if (stage !== 'success') return;
    const timer = setTimeout(() => {
      setPublishState(REVIEW_STATE);
      onClose();
    }, 1500);
    return () => clearTimeout(timer);
  }, [stage, onClose, setPublishState]);

  // Clean up completed/failed upload jobs from AsyncStorage after a
  // successful publish so the store doesn't grow unbounded over time.
  useEffect(() => {
    if (stage !== 'success') return;
    void uploadManager.clearProjectJobs().catch(() => {
      // Best-effort cleanup — don't block the success flow.
    });
  }, [stage, uploadManager]);

  // On mount, reconcile any persisted publication attempts from previous
  // sessions. This resolves unknown outcomes (network dropped after the
  // publish request was sent but before the response arrived) by checking
  // the server's publication lookup endpoint.
  useEffect(() => {
    void reconcilePublicationAttempts();
  }, []);

  // ── AppState listener — warn when backgrounded during upload ────
  // The OS may suspend the app while an upload is in flight. We do NOT
  // cancel the upload — the UploadManager persists jobs to AsyncStorage
  // and resumes them when the app returns to the foreground. We only
  // surface a quiet toast so the user knows the upload is still pending
  // and may be paused by the OS. This matches the flagship background-
  // posting pattern (progress continues, user is informed).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (stage === 'uploading' || stage === 'processing' || stage === 'publishing') {
          showToast('Upload will resume when you return', 'info');
        }
      }
    });
    return () => subscription.remove();
  }, [stage, showToast]);
}
