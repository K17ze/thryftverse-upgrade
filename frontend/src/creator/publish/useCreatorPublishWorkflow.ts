import { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, RootStackParamList } from '../../navigation/types';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useCreator } from '../studio/CreatorContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';

import { publishCreatorDocument, publishCreatorDocumentAsync, schedulePublication } from '../../services/creatorPublicationsApi';
import type { PublicationResult } from '../../services/creatorPublicationsApi';
import { CreatorDocumentConflictError } from '../../services/creatorDocumentsApi';
import type { CreatorDocumentSaveResult } from '../../services/creatorDocumentsApi';
import {
  savePublicationAttempt,
  updatePublicationAttemptState,
} from './publicationAttemptStore';
import { CreatorAnalytics } from '../shared/creatorAnalytics';
import { hasLocalUris } from '../core/upload/mediaUploadPipeline';
import { useUploadManager } from '../core/upload';
import {
  validateDocumentStructure,
  validateForPublish,
  PublishGuard } from '../core/projectStore/compositionContract';
import { useStore } from '../../store/useStore';
import { createPublishStyles } from './CreatorPublishStyles';
import {
  REVIEW_STATE,
  buildPublishCommand,
  documentMayRequireRender,
  generatePublicationAttemptId,
  invalidateCachesAfterPublish,
  type PublishState,
  type CreatorPublishSheetProps } from './publishWorkflowShared';
import {
  uploadLocalMediaForPublish,
  saveWorkingDocumentToServer,
  mapPublishErrorToState } from './publishExecution';
import { usePublishUploadMonitor } from './usePublishUploadMonitor';
import { usePublishDraftActions } from './usePublishDraftActions';
import { usePublishReconciliation } from './usePublishReconciliation';
import { useScheduleRetry } from './useScheduleRetry';
import { usePublishConflictHandlers } from './usePublishConflictHandlers';

// Shared types/constants live in publishWorkflowShared.ts — re-exported
// here so existing consumers (CreatorPublishSheet) compile unchanged.
export { REVIEW_STATE };
export type { PublishState, CreatorPublishSheetProps };

// ── Publish sheet ──────────────────────────────────────────────────
// Per Phase G anti-AI polish: the former 4-step "Preparing → Uploading
// → Processing → Publishing" progress theatre and confetti celebration
// have been replaced with a single "Sharing…" state and a quiet
// confirmation that transitions to the published object. Granular
// upload stages remain in telemetry/logs, not product chrome.
//
// The workflow is composed of focused sub-hooks in this directory:
//   usePublishUploadMonitor    — stage-driven effects (progress,
//                                haptics, auto-close, AppState warning)
//   usePublishDraftActions     — save-draft + cancel-upload actions
//   usePublishReconciliation   — check-result / check-schedule lookups
//   useScheduleRetry           — server-owned schedule re-creation
//   usePublishConflictHandlers — reload-from-server / duplicate draft
// The heavy async steps (media upload, document save, error mapping)
// are plain functions in publishExecution.ts; shared types and pure
// helpers are in publishWorkflowShared.ts.
export function useCreatorPublishWorkflow({ visible, onClose }: CreatorPublishSheetProps) {
  const { document, saveDraft, setDocument, updateMetadataLive } = useCreator();
  const currentUser = useStore((s) => s.currentUser);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show: showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  // UploadManager hook — provides durable, resumable uploads with real
  // byte-level progress. When USE_UPLOAD_MANAGER is true, the publish flow
  // queues local media through this manager instead of the legacy
  // foreground pipeline.
  const uploadManager = useUploadManager(document.id);
  const [publishState, setPublishState] = useState<PublishState>(REVIEW_STATE);
  // Persisted publication attempt ID — generated once per publish attempt,
  // used as the idempotency key and for unknown-outcome recovery. A new
  // attempt (retry, re-publish after edit) generates a new ID. Persisted
  // to AsyncStorage via publicationAttemptStore so it survives unmount /
  // process death.
  const [publicationAttemptId, setPublicationAttemptId] = useState<string>('');
  // Persisted schedule attempt ID — separate from the publish attempt so
  // schedule unknown-outcome reconciliation hits the schedule endpoint,
  // not the publication endpoint.
  const [scheduleAttemptId, setScheduleAttemptId] = useState<string>('');
  // Server-side document metadata from the last successful save. Used to
  // populate expectedLockVersion, expectedDocumentHash, and revision on
  // the publish command. Null until the document has been saved to the
  // server at least once in this session.
  const serverDocMetaRef = useRef<CreatorDocumentSaveResult | null>(null);
  const publishGuardRef = useRef(new PublishGuard());
  const publishAbortRef = useRef<AbortController | null>(null);
  const styles = useMemo(() => createPublishStyles(colors), [colors]);

  // Convenience accessor — the current tag, for switch-style checks.
  const stage = publishState.tag;

  // ── Smooth progress bar (UI-thread animated) ────────────────────
  // During the upload stage, the bar reflects **real transmitted bytes**
  // (uploadManager.progress, 0–1) mapped into the 0.15–0.7 range of the
  // overall publish flow. No fake interpolation — the bar advances only
  // when actual bytes are confirmed sent by XMLHttpRequest.onprogress.
  const progressWidth = useSharedValue(0);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%` }));

  // Stage-driven effects — progress sync, haptics, sheet-open haptic,
  // success auto-close, upload-job cleanup, attempt reconciliation on
  // mount, and the AppState background-upload warning. Same order as
  // the original inline effects.
  usePublishUploadMonitor({
    stage,
    visible,
    onClose,
    uploadManager,
    progressWidth,
    reduceMotion,
    haptic,
    showToast,
    setPublishState,
  });

  const handleClose = useCallback(() => {
    // During upload/publishing, allow dismissing to background — the upload
    // continues and the user gets a toast on completion. This matches the
    // flagship pattern (IG background posting with progress in feed header).
    if (stage === 'uploading' || stage === 'processing' || stage === 'publishing') {
      haptic.selection();
      onClose();
      return;
    }
    haptic.selection();
    setPublishState(REVIEW_STATE);
    publishGuardRef.current.reset();
    setPublicationAttemptId('');
    setScheduleAttemptId('');
    progressWidth.value = 0;
    onClose();
  }, [stage, haptic, onClose, progressWidth]);

  const { handleSaveDraftWithState, handleSaveDraftFromError, handleCancelUpload } = usePublishDraftActions({
    haptic,
    saveDraft,
    onClose,
    uploadManager,
    progressWidth,
    publishGuardRef,
    publishAbortRef,
    setPublishState,
    setPublicationAttemptId,
    setScheduleAttemptId,
  });

  const handlePublish = useCallback(async () => {
    // Prevent duplicate submissions
    if (!publishGuardRef.current.begin(document.id)) {
      return;
    }
    haptic.medium();

    CreatorAnalytics.publishStart(document.type);
    let publicationRequestStarted = false;
    // True when this publish went through the async (immediate-schedule)
    // path — needed in the catch to route unknown-outcome reconciliation
    // to the schedule lookup rather than the publication lookup.
    let usedAsyncPublish = false;
    // Schedule attempt ID for this run, tracked in a local so the catch
    // block sees the value set during this attempt — the scheduleAttemptId
    // state is a stale closure inside the catch and previously resolved to
    // a *prior* attempt's ID, corrupting failure bookkeeping.
    let schedAttemptId = '';
    const abortController = new AbortController();
    publishAbortRef.current = abortController;
    // Generate a unique attempt ID for this publish attempt. Used as the
    // idempotency key so retried requests replay safely, and for
    // unknown-outcome recovery lookup. A new retry generates a new ID.
    const attemptId = generatePublicationAttemptId();
    setPublicationAttemptId(attemptId);
    setScheduleAttemptId('');
    try {
      // 1. Validate document structure (allows local URIs — they will be uploaded next)
      const structureValidation = validateDocumentStructure(document);
      if (!structureValidation.valid) {
        throw new Error(structureValidation.errors.join('; '));
      }

      let workingDoc = document;

      // 2. Upload all local media URIs before publishing. The durable
      // UploadManager path (queue → waitForCompletion → URI substitution)
      // and the legacy foreground pipeline both live in
      // publishExecution.ts — a null return means the wait was aborted
      // and the cancel path already reset the sheet.
      if (hasLocalUris(document)) {
        const uploadedDoc = await uploadLocalMediaForPublish({
          document,
          uploadManager,
          signal: abortController.signal,
          progressWidth,
          reduceMotion,
          spring,
          setPublishState,
        });
        if (!uploadedDoc) {
          publishGuardRef.current.reset();
          return;
        }
        workingDoc = uploadedDoc;
      }

      // 3. Re-validate after upload to ensure no local URIs remain
      // ── Processing stage: post-upload validation + document save ──
      // Truthful label: "Preparing video…" when the composition contains
      // video layers, "Checking media…" otherwise. This is the real work
      // of validating uploaded media and saving the canonical document.
      setPublishState({ tag: 'processing' });
      progressWidth.value = reduceMotion ? 0.75 : withSpring(0.75, spring.entrance);

      const postUploadValidation = validateForPublish(workingDoc);
      if (!postUploadValidation.valid) {
        throw new Error(postUploadValidation.errors.join('; '));
      }

      // 4. Save the canonical document to the server before publishing.
      // The publication orchestrator reads document_json from the
      // creator_documents row to build the public projection. If the row
      // is missing or stale, the published content diverges from what the
      // creator authored. saveWorkingDocumentToServer self-heals on 404
      // (deleted row → re-create) and 428 (If-Match required → fetch +
      // update); a CreatorDocumentConflictError means the document was
      // edited on another device — show conflict UI with reload /
      // duplicate options instead of crashing.
      try {
        await saveWorkingDocumentToServer(workingDoc, serverDocMetaRef);
      } catch (err) {
        if (err instanceof CreatorDocumentConflictError) {
          setPublishState({ tag: 'conflict', message: err.message });
          publishGuardRef.current.fail();
          return;
        }
        throw err;
      }

      const serverMeta = serverDocMetaRef.current!;

      setPublishState({ tag: 'publishing' });
      const processingFraction = 0.8;
      progressWidth.value = reduceMotion ? processingFraction : withSpring(processingFraction, spring.entrance);

      // ── Build the unified publication command ──
      // The orchestrator creates the public projection transactionally
      // inside the same commit that writes the creator_publications row.
      // The command is built by the shared pure `buildPublishCommand`
      // function so every publish path (publish now, schedule, retry)
      // produces an identical media contract.
      const publishCommand = buildPublishCommand(workingDoc, serverMeta);

      // ── Branch: schedule vs publish now ──
      // When scheduledFor is set, create a server-owned schedule row.
      // The content is NOT published immediately — the worker publishes
      // exactly once at the scheduled time. This is the honest scheduling
      // path that replaces the old "publish now + attach schedule" bug.
      if (workingDoc.metadata.scheduledFor) {
        publicationRequestStarted = true;
        // Generate a separate schedule attempt ID so schedule
        // unknown-outcome reconciliation hits the schedule endpoint,
        // not the publication endpoint.
        schedAttemptId = generatePublicationAttemptId();
        setScheduleAttemptId(schedAttemptId);

        // Persist the schedule attempt before sending so unknown-outcome
        // recovery can resolve it even if the process dies before the
        // response. The commandType 'schedule' routes reconciliation to
        // the schedule lookup endpoint.
        await savePublicationAttempt({
          attemptId: schedAttemptId,
          documentId: workingDoc.id,
          expectedHash: serverMeta.documentHash,
          destination: publishCommand.destination,
          state: 'sending',
          requestStartedAt: new Date().toISOString(),
          lastCheckedAt: null,
          targetId: null,
          failureCode: null,
          commandType: 'schedule',
        });

        await schedulePublication(workingDoc.id, {
          dueAt: workingDoc.metadata.scheduledFor,
          publishCommand,
          idempotencyKey: schedAttemptId });

        // Update the persisted schedule attempt to committed.
        await updatePublicationAttemptState(schedAttemptId, {
          state: 'committed',
          targetId: undefined,
          lastCheckedAt: new Date().toISOString(),
        });

        publishGuardRef.current.complete(workingDoc.id);
        progressWidth.value = reduceMotion ? 1 : withSpring(1, spring.success);
        setPublishState({ tag: 'scheduled', dueAt: workingDoc.metadata.scheduledFor });
        CreatorAnalytics.publishSuccess(workingDoc.type, `scheduled:${workingDoc.id}`);
        // Clear the schedule intent from the draft — the schedule is
        // server-owned now, and leaving scheduledFor set would silently
        // re-schedule on the next publish instead of publishing now.
        updateMetadataLive({ scheduledFor: undefined });
      } else {
        // Publish now. Render-heavy documents (video media or multi-page
        // posters) go through the async path: the command is frozen into a
        // server-owned schedule row due immediately, the request returns in
        // ~200ms instead of blocking on the FFmpeg render, and we poll the
        // schedule state until the worker commits the publication.
        const useAsyncPublish = documentMayRequireRender(workingDoc);
        usedAsyncPublish = useAsyncPublish;
        publicationRequestStarted = true;

        // Persist the attempt before sending so unknown-outcome recovery
        // can resolve it even if the process dies before the response.
        // The async path stores commandType 'schedule' so reconciliation
        // resolves via the schedule lookup endpoint.
        await savePublicationAttempt({
          attemptId,
          documentId: workingDoc.id,
          expectedHash: serverMeta.documentHash,
          destination: publishCommand.destination,
          state: 'sending',
          requestStartedAt: new Date().toISOString(),
          lastCheckedAt: null,
          targetId: null,
          failureCode: null,
          commandType: useAsyncPublish ? 'schedule' : 'publish',
        });

        const pubResult: PublicationResult = useAsyncPublish
          ? await publishCreatorDocumentAsync(
              workingDoc.id,
              publishCommand,
              attemptId,
              { signal: abortController.signal },
            )
          : await publishCreatorDocument(
              workingDoc.id,
              publishCommand,
              attemptId,
            );
        const targetId = pubResult.targetId;

        // Update the persisted attempt to committed.
        await updatePublicationAttemptState(attemptId, {
          state: 'committed',
          targetId,
          lastCheckedAt: new Date().toISOString(),
        });

        publishGuardRef.current.complete(workingDoc.id);
        invalidateCachesAfterPublish(workingDoc.id, currentUser?.id ?? null);
        progressWidth.value = reduceMotion ? 1 : withSpring(1, spring.success);
        setPublishState({ tag: 'success', publishedId: targetId });
        CreatorAnalytics.publishSuccess(workingDoc.type, targetId);
      }
    } catch (err: unknown) {
      publishGuardRef.current.fail();
      // All error→state mapping lives in publishExecution.ts — abort →
      // review, 409 document conflict → conflict UI, async-failed → error,
      // async-timeout → scheduleUnknown, network-after-send →
      // unknown/scheduleUnknown, everything else → retriable error.
      // schedAttemptId is passed as the local captured at send time —
      // never the stale-closure state.
      mapPublishErrorToState(err, {
        document,
        abortController,
        publicationRequestStarted,
        usedAsyncPublish,
        attemptId,
        schedAttemptId,
        setPublishState,
        serverDocMetaRef,
      });
    }
  }, [document, reduceMotion, spring, uploadManager, currentUser, haptic, progressWidth, updateMetadataLive]);

  const handleRetry = useCallback(() => {
    haptic.medium();
    setPublishState(REVIEW_STATE);
    progressWidth.value = 0;
    publishGuardRef.current.reset();
    // Clear the attempt ID so handlePublish generates a fresh one.
    setPublicationAttemptId('');
    setScheduleAttemptId('');
    handlePublish();
  }, [haptic, progressWidth, handlePublish]);

  const { isCheckingResult, handleCheckPublishResult, handleCheckSchedule } = usePublishReconciliation({
    document,
    haptic,
    progressWidth,
    publishGuardRef,
    publicationAttemptId,
    scheduleAttemptId,
    currentUserId: currentUser?.id ?? null,
    setPublishState,
    updateMetadataLive,
  });

  const { handleRetrySchedule } = useScheduleRetry({
    document,
    serverDocMetaRef,
    haptic,
    reduceMotion,
    spring,
    progressWidth,
    setPublishState,
    setScheduleAttemptId,
    updateMetadataLive,
  });

  const { handleReloadFromServer, handleDuplicateAsNewDraft } = usePublishConflictHandlers({
    document,
    setDocument,
    serverDocMetaRef,
    publishGuardRef,
    progressWidth,
    setPublishState,
    showToast,
  });

  // Extract state-specific data for the render.
  const errorMessage = publishState.tag === 'error' ? publishState.message
    : publishState.tag === 'conflict' ? publishState.message
    : publishState.tag === 'unknown' ? publishState.detail
    : publishState.tag === 'scheduleUnknown' ? publishState.detail
    : '';
  const publishedId = publishState.tag === 'success' ? publishState.publishedId : '';
  const scheduleError = publishState.tag === 'scheduleFailed' ? publishState.error : '';

  return { document, navigation, colors, haptic, reduceMotion, publishState, setPublishState, isCheckingResult, serverDocMetaRef, publishGuardRef, styles, stage, progressWidth, progressAnimatedStyle, uploadManager, handleClose, handlePublish, handleSaveDraftWithState, handleCancelUpload, handleRetry, handleSaveDraftFromError, handleCheckPublishResult, handleCheckSchedule, handleRetrySchedule, handleReloadFromServer, handleDuplicateAsNewDraft, errorMessage, publishedId, scheduleError };
}
