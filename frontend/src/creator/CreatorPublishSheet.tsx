import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  LayoutAnimation,
  Platform,
  AppState,
  ActivityIndicator,
  type AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  Easing } from 'react-native-reanimated';
import { Space, Radius, Typography, Stroke, IconGrammar } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { createLookOnApi, fetchLookByIdFromApi, updateLookOnApi } from '../services/looksApi';
import { createPosterStory, fetchPosterStoryById, scheduleCreatorDocument } from '../services/postersApi';
import { publishCreatorDocument, lookupPublicationByKey, schedulePublication, lookupScheduleByKey } from '../services/creatorPublicationsApi';
import type { PublishCommand, ExpectedMediaEntry } from '../services/creatorPublicationsApi';
import { createCreatorDocument, updateCreatorDocument, fetchCreatorDocument, computeDocumentHash, CreatorDocumentConflictError } from '../services/creatorDocumentsApi';
import type { CreatorDocumentSaveResult } from '../services/creatorDocumentsApi';
import { ApiRequestError } from '../lib/apiClient';
import {
  savePublicationAttempt,
  updatePublicationAttemptState,
  getPendingAttemptForDocument,
  reconcilePublicationAttempts,
} from './publicationAttemptStore';
import { CreatorAnalytics } from './creatorAnalytics';
import { uploadAllLocalMedia, hasLocalUris } from './mediaUploadPipeline';
import { useUploadManager, detectMimeType } from './core/upload';
import type { UploadJob, UploadJobStatus } from './core/upload';
import type { CreatorDocument, CreatorLayer } from './composition';
import { walkMediaReferences, isLocalUri as isLocalUriWalker } from './mediaReferenceWalker';
import {
  validateDocumentStructure,
  validateForPublish,
  serialiseToLookPayload,
  serialiseToPosterPayload,
  PublishGuard } from './compositionContract';
import { queryClient, queryKeys } from '../platform/server';
import { CreatorDraftService } from './drafts';
import { useStore } from '../store/useStore';

// ── Shared publish-command builder ──────────────────────────────────
// A single pure function that constructs the PublishCommand from a
// composition document and its server-side metadata. Used by every
// publish path — publish now, initial schedule, schedule retry, and
// resumed background publish — so no branch can rebuild media evidence
// differently and diverge from the server walker's expectations.
//
// The expectedMedia list is derived from `walkMediaReferences`, which
// mirrors the server's `extractMediaReferences` walker exactly. Roles
// ('primary', 'thumbnail', 'product-snapshot', 'look-snapshot') match
// the server's role strings — never 'frame:${page.id}' or other
// ad-hoc values.
function buildPublishCommand(
  doc: CreatorDocument,
  serverMeta: CreatorDocumentSaveResult,
): PublishCommand {
  const { payload: lookPayload } = doc.type === 'look'
    ? serialiseToLookPayload(doc)
    : { payload: null as null };
  const { payload: posterPayload } = doc.type === 'poster'
    ? serialiseToPosterPayload(doc)
    : { payload: null as null };

  const allRefs = walkMediaReferences(doc);
  const expectedMedia: ExpectedMediaEntry[] = allRefs
    .filter((ref) => ref.finalizationId && !isLocalUriWalker(ref.uri))
    .map((ref) => ({
      layerId: ref.layerId,
      finalizationId: ref.finalizationId!,
      assetId: ref.mediaAssetId,
      mediaType: ref.mediaType,
      suppliedUrl: ref.uri,
      role: ref.role,
    }));

  return {
    revision: serverMeta.headRevision + 1,
    destination: doc.type === 'look' ? 'look' : 'poster',
    // Close Friends is not a supported audience — fail closed to private.
    audience: doc.metadata.visibility === 'closeFriends'
      ? 'private'
      : (doc.metadata.visibility as 'public' | 'private'),
    expiresInHours: doc.metadata.expiresInHours ?? 24,
    expectedMedia,
    compositionDocument: doc.type === 'look'
      ? lookPayload?.compositionDocument
      : posterPayload?.compositionDocument,
    expectedLockVersion: serverMeta.lockVersion,
    expectedDocumentHash: serverMeta.documentHash,
  };
}

// ── Feature flag ───────────────────────────────────────────────────
// When true, uploads flow through the durable UploadManager (resumable,
// persisted, auto-retry). When false, falls back to the sequential
// foreground `mediaUploadPipeline`.
const USE_UPLOAD_MANAGER = true;

export interface CreatorPublishSheetProps {
  visible: boolean;
  onClose: () => void;
  editingLookId?: string;
  /** Opens the full-screen CreatorPreviewOverlay from the host screen. */
  onOpenPreview?: () => void;
}

// ── Local URI scanning (mirrors mediaUploadPipeline for UploadManager path) ──
const LOCAL_URI_PREFIXES = [
  'file://',
  'ph://',
  'asset://',
  'data:',
  'content://',
  'assets-library://',
];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

interface LocalMediaRef {
  layerId: string;
  field: string;
  currentUri: string;
  /** Asset type hint for MIME detection: "image" or "video". */
  assetType: string;
}

function scanDocumentForLocalUris(doc: CreatorDocument): LocalMediaRef[] {
  const refs: LocalMediaRef[] = [];
  for (const page of doc.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media') {
        // mediaType is "image" | "video" on the media layer payload.
        const mediaType = layer.payload.mediaType ?? 'image';
        if (layer.payload.mediaUri && isLocalUri(layer.payload.mediaUri)) {
          refs.push({ layerId: layer.id, field: 'mediaUri', currentUri: layer.payload.mediaUri, assetType: mediaType });
        }
        if (layer.payload.thumbnailUri && isLocalUri(layer.payload.thumbnailUri)) {
          refs.push({ layerId: layer.id, field: 'thumbnailUri', currentUri: layer.payload.thumbnailUri, assetType: 'image' });
        }
      }
      if (layer.type === 'product' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          refs.push({ layerId: layer.id, field: 'snapshotImageUrl', currentUri: layer.payload.snapshotImageUrl, assetType: 'image' });
        }
      }
      if (layer.type === 'look' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          refs.push({ layerId: layer.id, field: 'snapshotImageUrl', currentUri: layer.payload.snapshotImageUrl, assetType: 'image' });
        }
      }
    }
  }
  return refs;
}

function replaceUriInDoc(
  doc: CreatorDocument,
  layerId: string,
  field: string,
  newUri: string,
  receipt?: Pick<UploadJob, 'finalizationId' | 'mediaAssetId'>,
): CreatorDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer): CreatorLayer => {
        if (layer.id !== layerId) return layer;
        if (layer.type === 'media' && (field === 'mediaUri' || field === 'thumbnailUri')) {
          const evidence = field === 'mediaUri'
            ? {
                mediaFinalizationId: receipt?.finalizationId,
                mediaAssetId: receipt?.mediaAssetId }
            : {
                thumbnailFinalizationId: receipt?.finalizationId,
                thumbnailMediaAssetId: receipt?.mediaAssetId };
          return { ...layer, payload: { ...layer.payload, [field]: newUri, ...evidence } };
        }
        if (layer.type === 'product' && field === 'snapshotImageUrl') {
          return {
            ...layer,
            payload: {
              ...layer.payload,
              snapshotImageUrl: newUri,
              snapshotMediaFinalizationId: receipt?.finalizationId,
              snapshotMediaAssetId: receipt?.mediaAssetId } };
        }
        if (layer.type === 'look' && field === 'snapshotImageUrl') {
          return {
            ...layer,
            payload: {
              ...layer.payload,
              snapshotImageUrl: newUri,
              snapshotMediaFinalizationId: receipt?.finalizationId,
              snapshotMediaAssetId: receipt?.mediaAssetId } };
        }
        return layer;
      }) })),
    updatedAt: new Date().toISOString() };
}

// ── Upload UI helpers ──────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function jobStateLabel(state: UploadJobStatus, retries: number): string {
  switch (state) {
    case 'queued': return 'Queued';
    case 'initiating': return 'Preparing';
    case 'uploading': return retries > 0 ? `Retrying (${retries + 1})` : 'Uploading';
    case 'paused': return 'Paused';
    case 'failed': return 'Failed';
    case 'completed': return 'Done';
  }
}

function jobStateIcon(state: UploadJobStatus): string {
  switch (state) {
    case 'queued': return 'time-outline';
    case 'initiating': return 'sync-outline';
    case 'uploading': return 'cloud-upload-outline';
    case 'paused': return 'pause-outline';
    case 'failed': return 'alert-circle-outline';
    case 'completed': return 'checkmark-circle-outline';
  }
}

function isNetworkError(error: string | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes('network') || lower.includes('fetch') || lower.includes('abort') || lower.includes('timeout') || lower.includes('connection');
}

/**
 * Generate a unique publication attempt ID. This is persisted locally
 * before the publish request and used as the idempotency key. A new
 * attempt (retry, re-publish after edit) generates a new ID so the
 * server can distinguish replay from a genuinely new publication.
 */
function generatePublicationAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `attempt_${crypto.randomUUID()}`;
  }
  return `attempt_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Invalidate all caches that depend on published creator content.
 * After a successful publication, the following surfaces must not
 * serve stale data:
 *  - Profile (user looks, profile stats)
 *  - Discovery feed
 *  - Poster AsyncStorage cache (handled by invalidatePosterCache in the API layer)
 *  - Local drafts (the published document is no longer a draft)
 *
 * React Query caches are invalidated (not removed) so background refetch
 * keeps the current data visible while fresh data loads. The draft is
 * deleted from AsyncStorage so the drafts list doesn't show published
 * content.
 */
function invalidateCachesAfterPublish(documentId: string, creatorId: string | null): void {
  // React Query — profile and discovery
  if (creatorId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.user.looks(creatorId) }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(creatorId) }).catch(() => {});
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.discover.feed }).catch(() => {});

  // Local draft — the document is now published, remove it from drafts
  void CreatorDraftService.deleteDraft(documentId);
}

// ── Publish sheet ──────────────────────────────────────────────────
// Per Phase G anti-AI polish: the former 4-step "Preparing → Uploading
// → Processing → Publishing" progress theatre and confetti celebration
// have been replaced with a single "Sharing…" state and a quiet
// confirmation that transitions to the published object. Granular
// upload stages remain in telemetry/logs, not product chrome.

export function CreatorPublishSheet({ visible, onClose, editingLookId, onOpenPreview }: CreatorPublishSheetProps) {
  const { document, saveDraft } = useCreator();
  const currentUser = useStore((s) => s.currentUser);
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  // UploadManager hook — provides durable, resumable uploads with real
  // byte-level progress. When USE_UPLOAD_MANAGER is true, the publish flow
  // queues local media through this manager instead of the legacy
  // foreground pipeline.
  const uploadManager = useUploadManager(document.id);
  const [stage, setStage] = useState<'review' | 'saving' | 'uploading' | 'processing' | 'publishing' | 'scheduled' | 'success' | 'error' | 'unknown' | 'scheduleFailed' | 'scheduleUnknown' | 'conflict'>('review');
  const [errorMessage, setErrorMessage] = useState('');
  const [isCheckingResult, setIsCheckingResult] = useState(false);
  const [publishedId, setPublishedId] = useState('');
  const [scheduleError, setScheduleError] = useState('');
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
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Detect video layers in the composition so the processing stage can
  // show a truthful label: "Preparing video…" vs "Checking media…".
  const hasVideoMedia = document.pages.some((p) =>
    p.layers.some((l) => l.type === 'media' && l.payload.mediaType === 'video'));

  // ── Smooth progress bar (UI-thread animated) ────────────────────
  // During the upload stage, the bar reflects **real transmitted bytes**
  // (uploadManager.progress, 0–1) mapped into the 0.15–0.7 range of the
  // overall publish flow. No fake interpolation — the bar advances only
  // when actual bytes are confirmed sent by XMLHttpRequest.onprogress.
  const progressWidth = useSharedValue(0);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progressWidth.value * 100)}%` }));

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

  // On mount, reconcile any persisted publication attempts from previous
  // sessions. This resolves unknown outcomes (network dropped after the
  // publish request was sent but before the response arrived) by checking
  // the server's publication lookup endpoint.
  useEffect(() => {
    void reconcilePublicationAttempts();
  }, []);

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
    setStage('review');
    setErrorMessage('');
    setScheduleError('');
    progressWidth.value = 0;
    publishGuardRef.current.reset();
    setPublicationAttemptId('');
    setScheduleAttemptId('');
    onClose();
  }, [stage, haptic, onClose, progressWidth]);

  // Save draft with a visible "Saving draft…" state so the user knows
  // their work is being persisted, not silently swallowed.
  const handleSaveDraftWithState = useCallback(async () => {
    haptic.light();
    setStage('saving');
    try {
      await saveDraft();
    } finally {
      setStage('review');
    }
  }, [haptic, saveDraft]);

  // Cancel an in-progress upload: abort all active jobs for this document
  // and return to the review stage so the user can adjust and retry.
  const handleCancelUpload = useCallback(() => {
    haptic.medium();
    // Cancel every job the manager holds for this project.
    for (const job of uploadManager.jobs) {
      if (job.status === 'queued' || job.status === 'initiating' || job.status === 'uploading') {
        uploadManager.cancelJob(job.id);
      }
    }
    progressWidth.value = 0;
    publishGuardRef.current.reset();
    setPublicationAttemptId('');
    setScheduleAttemptId('');
    setStage('review');
  }, [haptic, uploadManager, progressWidth]);

  const handlePublish = useCallback(async () => {
    // Prevent duplicate submissions
    if (!publishGuardRef.current.begin(document.id)) {
      return;
    }
    haptic.medium();

    CreatorAnalytics.publishStart(document.type);
    let publicationRequestStarted = false;
    // Generate a unique attempt ID for this publish attempt. Used as the
    // idempotency key so retried requests replay safely, and for
    // unknown-outcome recovery lookup. A new retry generates a new ID.
    const attemptId = generatePublicationAttemptId();
    setPublicationAttemptId(attemptId);
    try {
      // 1. Validate document structure (allows local URIs — they will be uploaded next)
      const structureValidation = validateDocumentStructure(document);
      if (!structureValidation.valid) {
        throw new Error(structureValidation.errors.join('; '));
      }

      let workingDoc = document;

      // 2. Upload all local media URIs before publishing
      if (hasLocalUris(document)) {
        setStage('uploading');
        // The progress bar starts at 0.15 (upload range start). Real
        // byte progress is synced via the useEffect above — the bar
        // advances only when XMLHttpRequest confirms bytes sent.
        progressWidth.value = reduceMotion ? 0.15 : withSpring(0.15, spring.entrance);

        if (USE_UPLOAD_MANAGER) {
          // ── Durable UploadManager path ──
          // Queue each local URI as a persistent upload job, then wait
          // for all jobs to reach a terminal state. Jobs persist to
          // AsyncStorage and retry with exponential backoff on network
          // failures. The current transport is **retryable** (whole-file
          // re-upload on failure with real byte progress). Multipart
          // (resumable at the part level) is fully supported end-to-end:
          // the backend exposes initiate/parts/complete/abort endpoints
          // and multipart completion creates the same media_asset +
          // processing job + ingest pipeline as single-PUT — see
          // MultipartUploader.ts and uploads.ts.
          const localRefs = scanDocumentForLocalUris(document);
          const projectId = document.id;

          for (const ref of localRefs) {
            const assetId = `${ref.layerId}::${ref.field}`;
            // Detect the correct MIME type from the file extension +
            // asset-type hint. Never image/* for video.
            const mimeType = detectMimeType(ref.currentUri, ref.assetType);
            await uploadManager.queueUpload({
              projectId,
              assetId,
              localPath: ref.currentUri,
              mimeType,
              assetType: ref.assetType,
              maxRetries: 5,
              folder: document.type === 'look' ? 'looks' : 'posters' });
          }

          // Wait for all jobs to complete (or fail). Real progress is
          // reflected via uploadManager.progress (0–1).
          const finalJobs = await uploadManager.waitForCompletion();

          // Check for failures
          const failedJobs = finalJobs.filter((j) => j.status === 'failed');
          if (failedJobs.length > 0) {
            throw new Error(
              `Upload failed: ${failedJobs[0].error ?? 'Unknown error'}`,
            );
          }

          // Replace local URIs in the document with remote URLs
          workingDoc = document;
          for (const job of finalJobs) {
            if (job.status === 'completed' && job.remoteUrl) {
              // Parse layerId and field from assetId
              const sepIdx = job.assetId.lastIndexOf('::');
              const layerId = job.assetId.substring(0, sepIdx);
              const field = job.assetId.substring(sepIdx + 2);
              workingDoc = replaceUriInDoc(
                workingDoc,
                layerId,
                field,
                job.remoteUrl,
                job,
              );
            }
          }

          // Upload complete — advance to 0.7 (end of upload range).
          progressWidth.value = reduceMotion ? 0.7 : withSpring(0.7, spring.entrance);
        } else {
          // ── Legacy foreground pipeline path ──
          workingDoc = await uploadAllLocalMedia(document, (progress) => {
            if (progress.total > 0) {
              const fraction = (progress.completed + 1) / progress.total;
              // Map upload fraction into the 0.3–0.7 range
              const mappedFraction = 0.3 + fraction * 0.4;
              progressWidth.value = reduceMotion ? mappedFraction : withSpring(mappedFraction, spring.entrance);
            }
          });
        }
      }

      // 3. Re-validate after upload to ensure no local URIs remain
      // ── Processing stage: post-upload validation + document save ──
      // Truthful label: "Preparing video…" when the composition contains
      // video layers, "Checking media…" otherwise. This is the real work
      // of validating uploaded media and saving the canonical document.
      setStage('processing');
      progressWidth.value = reduceMotion ? 0.75 : withSpring(0.75, spring.entrance);

      const postUploadValidation = validateForPublish(workingDoc);
      if (!postUploadValidation.valid) {
        throw new Error(postUploadValidation.errors.join('; '));
      }

      // 4. Save the canonical document to the server before publishing.
      // The publication orchestrator reads document_json from the
      // creator_documents row to build the public projection. If the row
      // is missing or stale, the published content diverges from what the
      // creator authored. This step ensures the server has the exact
      // document we are about to publish.
      const currentHash = await computeDocumentHash(workingDoc);
      const existingMeta = serverDocMetaRef.current;
      if (!existingMeta || existingMeta.documentHash !== currentHash) {
        try {
          let saveResult: CreatorDocumentSaveResult;
          if (!existingMeta) {
            // First save in this session. Try create; if the document
            // already exists on the server (e.g. saved in a previous
            // session), fetch its lock version and update instead.
            try {
              saveResult = await createCreatorDocument({
                documentType: workingDoc.type,
                documentJson: workingDoc,
              });
            } catch (err) {
              // 428 = If-Match required → document already exists.
              // Fetch the current server state and update from there.
              if (err instanceof ApiRequestError && err.status === 428) {
                const fetched = await fetchCreatorDocument(workingDoc.id);
                saveResult = await updateCreatorDocument({
                  documentId: workingDoc.id,
                  documentJson: workingDoc,
                  expectedLockVersion: fetched.lockVersion,
                });
              } else {
                throw err;
              }
            }
          } else {
            saveResult = await updateCreatorDocument({
              documentId: workingDoc.id,
              documentJson: workingDoc,
              expectedLockVersion: existingMeta.lockVersion,
            });
          }
          serverDocMetaRef.current = saveResult;
        } catch (err) {
          if (err instanceof CreatorDocumentConflictError) {
            // Document was edited on another device. Show conflict UI
            // with reload / duplicate options instead of crashing.
            setStage('conflict');
            setErrorMessage(err.message);
            publishGuardRef.current.fail();
            return;
          }
          throw err;
        }
      }

      const serverMeta = serverDocMetaRef.current!;

      setStage('publishing');
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
        const schedAttemptId = generatePublicationAttemptId();
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
        setStage('scheduled');
        CreatorAnalytics.publishSuccess(workingDoc.type, `scheduled:${workingDoc.id}`);
      } else {
        // Publish now via the orchestrator.
        publicationRequestStarted = true;

        // Persist the attempt before sending so unknown-outcome recovery
        // can resolve it even if the process dies before the response.
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
          commandType: 'publish',
        });

        const pubResult = await publishCreatorDocument(
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
        setPublishedId(targetId);
        invalidateCachesAfterPublish(workingDoc.id, currentUser?.id ?? null);
        progressWidth.value = reduceMotion ? 1 : withSpring(1, spring.success);
        setStage('success');
        CreatorAnalytics.publishSuccess(workingDoc.type, targetId);
      }
    } catch (err: unknown) {
      publishGuardRef.current.fail();

      // Detect stale-document conflicts from the publication endpoint (409
      // with DOCUMENT_VERSION_CONFLICT or DOCUMENT_HASH_CONFLICT). The
      // server rejected the publish because the document was edited on
      // another device since the client last saved. Show the conflict UI
      // with reload/duplicate options instead of a generic error — the
      // user must choose how to reconcile before retrying.
      if (err instanceof ApiRequestError && err.status === 409) {
        const details = err.details as { code?: string; error?: string } | undefined;
        const conflictCode = details?.code;
        if (
          conflictCode === 'DOCUMENT_VERSION_CONFLICT'
          || conflictCode === 'DOCUMENT_HASH_CONFLICT'
        ) {
          setStage('conflict');
          setErrorMessage(
            details?.error
              ?? 'The document was edited on another device. Reload the latest version or duplicate your changes.',
          );
          if (publicationRequestStarted && attemptId) {
            void updatePublicationAttemptState(attemptId, {
              state: 'failed',
              failureCode: conflictCode,
              lastCheckedAt: new Date().toISOString(),
            });
          }
          // Clear the server doc meta so the next attempt re-fetches the
          // current server state instead of reusing stale lock_version/hash.
          serverDocMetaRef.current = null;
          CreatorAnalytics.publishError(document.type, `Conflict: ${conflictCode}`);
          return;
        }
      }

      const errorMessage = err instanceof Error ? err.message : 'Publishing failed';
      setErrorMessage(errorMessage);
      // Once a write has left the device, a dropped response is ambiguous:
      // the backend may have committed it. Never call that failure or success.
      const isUnknown = publicationRequestStarted && isNetworkError(errorMessage);
      // Distinguish schedule unknown from publish unknown so the UI
      // offers the correct reconciliation action ("Check schedule" vs
      // "Check publish result") and analytics can separate the two.
      const isSchedule = !!document.metadata.scheduledFor;
      if (isUnknown) {
        setStage(isSchedule ? 'scheduleUnknown' : 'unknown');
      } else {
        setStage('error');
      }
      // Update the persisted attempt: definitive failure → 'failed',
      // network error → leave as 'sending' (becomes 'unknown' after
      // the threshold in reconcilePublicationAttempts).
      if (publicationRequestStarted) {
        const failedAttemptId = isSchedule ? scheduleAttemptId : attemptId;
        if (failedAttemptId && !isUnknown) {
          void updatePublicationAttemptState(failedAttemptId, {
            state: 'failed',
            failureCode: err instanceof Error ? err.name : 'UNKNOWN',
            lastCheckedAt: new Date().toISOString(),
          });
        }
      }
      if (isUnknown) {
        if (isSchedule) {
          CreatorAnalytics.scheduleUnknown(document.type);
        } else {
          CreatorAnalytics.publishUnknown(document.type);
        }
      }
      CreatorAnalytics.publishError(document.type, err instanceof Error ? err.message : 'Unknown error');
    }
  }, [document, editingLookId, reduceMotion, spring.entrance, spring.success, uploadManager, currentUser]);

  const handleRetry = useCallback(() => {
    haptic.medium();
    setStage('review');
    setErrorMessage('');
    setScheduleError('');
    progressWidth.value = 0;
    publishGuardRef.current.reset();
    // Clear the attempt ID so handlePublish generates a fresh one.
    setPublicationAttemptId('');
    setScheduleAttemptId('');
    handlePublish();
  }, [haptic, progressWidth, handlePublish]);

  const handleCheckPublishResult = useCallback(async () => {
    const targetId = editingLookId ?? document.id;
    haptic.medium();
    setIsCheckingResult(true);
    setErrorMessage('');
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
        setPublishedId(publication.targetId);
        invalidateCachesAfterPublish(publication.targetId, currentUser?.id ?? null);
        // Update the persisted attempt to committed.
        void updatePublicationAttemptState(attemptId, {
          state: 'committed',
          targetId: publication.targetId,
          lastCheckedAt: new Date().toISOString(),
        });
        progressWidth.value = 1;
        setStage('success');
        CreatorAnalytics.publishSuccess(document.type, publication.targetId);
        return;
      }

      // The lookup returned null (404) — the publication was not found.
      // Update the persisted attempt to failed so the user can retry.
      void updatePublicationAttemptState(attemptId, {
        state: 'failed',
        failureCode: 'NOT_FOUND',
        lastCheckedAt: new Date().toISOString(),
      });

      // Fallback: check the public projection directly (legacy path for
      // documents published before the orchestrator existed).
      if (document.type === 'look') {
        const result = await fetchLookByIdFromApi(targetId);
        if (!result.ok || !result.look) throw new Error('No confirmed publication was found yet.');
      } else {
        await fetchPosterStoryById(targetId);
      }
      publishGuardRef.current.complete(targetId);
      setPublishedId(targetId);
      // Invalidate caches — the publication was confirmed via check-result.
      invalidateCachesAfterPublish(targetId, currentUser?.id ?? null);
      progressWidth.value = 1;
      setStage('success');
      CreatorAnalytics.publishSuccess(document.type, targetId);
    } catch {
      setErrorMessage('No confirmed result yet. It is safe to check again; the same publication key prevents duplicates.');
      setStage('unknown');
    } finally {
      setIsCheckingResult(false);
    }
  }, [document.id, document.type, editingLookId, haptic, progressWidth, currentUser, publicationAttemptId]);

  // Check schedule result — resolves an unknown schedule outcome by
  // looking up the schedule row by idempotency key. This is separate
  // from `handleCheckPublishResult` because schedule commands hit a
  // different server endpoint (GET /schedule/:key, not GET /publications/:key).
  const handleCheckSchedule = useCallback(async () => {
    haptic.medium();
    setIsCheckingResult(true);
    setErrorMessage('');
    try {
      // Use the in-memory schedule attempt ID, or fall back to the
      // persisted store (for recovery after unmount/process death).
      let attemptId = scheduleAttemptId;
      if (!attemptId) {
        const pending = await getPendingAttemptForDocument(document.id);
        // Only consider schedule-type attempts for schedule reconciliation.
        if (pending?.commandType !== 'schedule') {
          setErrorMessage('No schedule attempt found. It is safe to retry scheduling.');
          setStage('scheduleFailed');
          return;
        }
        attemptId = pending.attemptId;
      }
      const schedule = await lookupScheduleByKey(document.id, attemptId);
      if (schedule && schedule.ok) {
        // Schedule was committed on the server. Transition to the
        // scheduled confirmation state.
        publishGuardRef.current.complete(document.id);
        void updatePublicationAttemptState(attemptId, {
          state: 'committed',
          targetId: schedule.scheduleId,
          lastCheckedAt: new Date().toISOString(),
        });
        progressWidth.value = 1;
        setStage('scheduled');
        CreatorAnalytics.publishSuccess(document.type, `scheduled:${document.id}`);
        return;
      }

      // 404 — the schedule command didn't reach the server. Mark as
      // failed so the user can safely retry with a new attempt ID.
      void updatePublicationAttemptState(attemptId, {
        state: 'failed',
        failureCode: 'NOT_FOUND',
        lastCheckedAt: new Date().toISOString(),
      });
      setErrorMessage('No confirmed schedule yet. It is safe to retry scheduling.');
      setStage('scheduleFailed');
    } catch {
      setErrorMessage('Could not reach the server to check the schedule. Try again.');
      setStage('scheduleUnknown');
    } finally {
      setIsCheckingResult(false);
    }
  }, [document.id, document.type, haptic, progressWidth, scheduleAttemptId]);

  // Retry scheduling after a failure. With the new server-owned schedule,
  // this re-creates the schedule row (the old row was cancelled on retry).
  const handleRetrySchedule = useCallback(async () => {
    if (!document.metadata.scheduledFor) return;
    const serverMeta = serverDocMetaRef.current;
    if (!serverMeta) {
      setScheduleError('Document metadata is not available. Save the document first.');
      setStage('scheduleFailed');
      return;
    }
    haptic.medium();
    setStage('publishing');
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
      setScheduleError('');
      setStage('scheduled');
      CreatorAnalytics.publishSuccess(document.type, `scheduled:${document.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scheduling failed';
      const isUnknown = scheduleRequestStarted && isNetworkError(msg);
      if (isUnknown) {
        setScheduleError(msg);
        setStage('scheduleUnknown');
        CreatorAnalytics.scheduleUnknown(document.type);
      } else {
        setScheduleError(msg);
        setStage('scheduleFailed');
        void updatePublicationAttemptState(schedAttemptId, {
          state: 'failed',
          failureCode: err instanceof Error ? err.name : 'UNKNOWN',
          lastCheckedAt: new Date().toISOString(),
        });
      }
      CreatorAnalytics.publishError(document.type, `Schedule retry failed: ${msg}`);
    }
  }, [document, haptic, reduceMotion, spring.entrance, spring.success, progressWidth]);

  // Accept that the content was published immediately (skip scheduling).
  const handleAcceptImmediate = useCallback(() => {
    haptic.selection();
    setScheduleError('');
    setStage('success');
  }, [haptic]);

  if (!visible && stage === 'review') return null;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
        <View style={styles.header}>
          <Text style={styles.title}>Publish</Text>
          <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close publish" accessibilityHint="Closes the publish sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
          </PressScale>
        </View>

        {stage === 'review' && (
          <PublishReview document={document} onPublish={handlePublish} onSaveDraft={handleSaveDraftWithState} onOpenPreview={onOpenPreview} />
        )}

        {stage === 'saving' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={styles.centerStateTitle}>Saving draft…</Text>
          </View>
        )}

        {(stage === 'uploading' || stage === 'processing' || stage === 'publishing') && (
          <SharingStateView
            colors={colors}
            styles={styles}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            progressAnimatedStyle={progressAnimatedStyle}
            progressWidth={progressWidth}
            stage={stage}
            uploadedBytes={uploadManager.uploadedBytes}
            totalBytes={uploadManager.totalBytes}
            uploadedCount={uploadManager.jobs.filter((j) => j.status === 'completed').length}
            totalCount={uploadManager.jobs.length}
            processingLabel={hasVideoMedia ? 'Preparing video…' : 'Checking media…'}
            onCancel={stage === 'uploading' ? handleCancelUpload : undefined}
          />
        )}

        {stage === 'success' && (
          <QuietSuccessView
            colors={colors}
            reduceMotion={reduceMotion}
            springCfg={spring.success}
            publishedId={publishedId}
            documentType={document.type}
            onView={() => {
              haptic.selection();
              onClose();
              setStage('review');
              if (document.type === 'look') {
                navigation.replace('LookDetail', { lookId: publishedId });
              } else {
                navigation.replace('PosterViewer', { storyId: publishedId });
              }
            }}
            onCreateNew={() => {
              haptic.selection();
              onClose();
              setStage('review');
              navigation.navigate('CreatorStudio', { type: document.type });
            }}
          />
        )}

        {stage === 'scheduled' && (
          <ScheduledView
            colors={colors}
            reduceMotion={reduceMotion}
            springCfg={spring.success}
            scheduledFor={document.metadata.scheduledFor}
            documentType={document.type}
            onView={() => {
              haptic.selection();
              onClose();
              setStage('review');
              navigation.navigate('CreatorStudio', { type: document.type });
            }}
            onCreateNew={() => {
              haptic.selection();
              onClose();
              setStage('review');
              navigation.navigate('CreatorStudio', { type: document.type });
            }}
          />
        )}

        {stage === 'error' && (
          <ErrorStateView
            colors={colors}
            styles={styles}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            errorMessage={errorMessage}
            onRetry={handleRetry}
            haptic={haptic}
          />
        )}

        {stage === 'unknown' && (
          <UnknownOutcomeView
            colors={colors}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            detail={errorMessage}
            isChecking={isCheckingResult}
            onCheck={handleCheckPublishResult}
          />
        )}

        {stage === 'scheduleUnknown' && (
          <UnknownOutcomeView
            colors={colors}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            detail={errorMessage}
            isChecking={isCheckingResult}
            onCheck={handleCheckSchedule}
            checkLabel="Check schedule"
          />
        )}

        {stage === 'conflict' && (
          <ConflictStateView
            colors={colors}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            errorMessage={errorMessage}
            onReload={() => {
              haptic.selection();
              serverDocMetaRef.current = null;
              setStage('review');
              setErrorMessage('');
              progressWidth.value = 0;
              publishGuardRef.current.reset();
            }}
            onDuplicate={() => {
              haptic.selection();
              serverDocMetaRef.current = null;
              setStage('review');
              setErrorMessage('');
              progressWidth.value = 0;
              publishGuardRef.current.reset();
            }}
          />
        )}

        {stage === 'scheduleFailed' && (
          <ScheduleFailedView
            colors={colors}
            styles={styles}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            scheduleError={scheduleError}
            onRetrySchedule={handleRetrySchedule}
            onAcceptImmediate={handleAcceptImmediate}
            onView={() => {
              haptic.selection();
              onClose();
              setStage('review');
              if (document.type === 'look') {
                navigation.replace('LookDetail', { lookId: publishedId });
              } else {
                navigation.replace('PosterViewer', { storyId: publishedId });
              }
            }}
          />
        )}
    </SheetContainer>
  );
}

// ── Sharing state — single quiet progress indicator ───────────────
// Shows real byte progress during upload (actual transmitted bytes /
// total bytes via XMLHttpRequest.onprogress) and a quiet "Publishing…"
// label during the server publish step. No fake stage theatre.
interface SharingStateViewProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  progressAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  progressWidth: ReturnType<typeof useSharedValue<number>>;
  stage: 'saving' | 'uploading' | 'processing' | 'publishing';
  uploadedBytes: number;
  totalBytes: number;
  /** Completed upload job count for "Uploading X of Y…" label. */
  uploadedCount?: number;
  /** Total upload job count for "Uploading X of Y…" label. */
  totalCount?: number;
  /** Truthful label for the processing stage. */
  processingLabel?: string;
  onCancel?: () => void;
}

function SharingStateView({
  colors,
  styles,
  progressAnimatedStyle,
  stage,
  uploadedBytes,
  totalBytes,
  uploadedCount = 0,
  totalCount = 0,
  processingLabel = 'Checking media…',
  onCancel }: SharingStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const showByteProgress = stage === 'uploading' && totalBytes > 0;
  const showCancel = stage === 'uploading' && !!onCancel;
  const showItemCount = stage === 'uploading' && totalCount > 1;
  const current_item = Math.min(uploadedCount + 1, totalCount);
  return (
    <View style={localStyles.centerState}>
      <Text style={localStyles.centerStateTitle}>
        {stage === 'saving' ? 'Saving draft…'
          : stage === 'uploading' ? (showItemCount ? `Uploading ${current_item} of ${totalCount}…` : 'Uploading…')
          : stage === 'processing' ? processingLabel
          : 'Publishing…'}
      </Text>
      {stage !== 'saving' && (
        <View style={localStyles.progressBarTrack}>
          <Reanimated.View style={[localStyles.progressBarFill, progressAnimatedStyle]} />
        </View>
      )}
      {showByteProgress && (
        <Text style={localStyles.progressByteLabel}>
          {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
        </Text>
      )}
      {showCancel && (
        <Pressable
          onPress={onCancel}
          style={localStyles.cancelUploadBtn}
          accessibilityLabel="Cancel upload"
          accessibilityHint="Cancels the in-progress upload and returns to review"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close-circle-outline" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} />
          <Text style={localStyles.cancelUploadText}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Error State View with spring entrance and retry ────────────────
interface ErrorStateViewProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  errorMessage: string;
  onRetry: () => void;
  haptic: ReturnType<typeof useHaptic>;
}

function ErrorStateView({
  colors,
  reduceMotion,
  springCfg,
  errorMessage,
  onRetry }: ErrorStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
    } else {
      opacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
    }
  }, [reduceMotion, springCfg, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <View style={localStyles.errorCircle}>
        <Ionicons name="warning" size={IconGrammar.hero} color={colors.danger} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Couldn't publish</Text>
      <Text style={localStyles.centerStateText}>{errorMessage}</Text>
      <PressScale
        onPress={onRetry}
        style={localStyles.retryBtn}
        accessibilityLabel="Retry publish"
        accessibilityHint="Retries the failed publish attempt"
        scale={0.95}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="refresh-outline" size={IconGrammar.metadata} color={colors.textInverse} style={{ marginRight: 6 }} aria-hidden={true} />
        <Text style={localStyles.retryBtnText}>Retry</Text>
      </PressScale>
    </Reanimated.View>
  );
}

interface UnknownOutcomeViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  detail: string;
  isChecking: boolean;
  onCheck: () => void;
  /** Label for the check button (e.g. "Check publication" or "Check schedule"). */
  checkLabel?: string;
}

function UnknownOutcomeView({
  colors,
  reduceMotion,
  springCfg,
  detail,
  isChecking,
  onCheck,
  checkLabel = 'Check publication' }: UnknownOutcomeViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
  }, [opacity, reduceMotion, springCfg]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View
      style={[localStyles.centerState, animatedStyle]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={localStyles.unknownCircle}>
        <Ionicons name="help" size={IconGrammar.hero} color={colors.warning} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Result unknown</Text>
      <Text style={localStyles.centerStateText}>
        The connection dropped after publishing started. Your post may already be live.
      </Text>
      {detail ? <Text style={localStyles.unknownDetail}>{detail}</Text> : null}
      <PressScale
        onPress={onCheck}
        disabled={isChecking}
        style={isChecking
          ? [localStyles.retryBtn, localStyles.publishBtnDisabled]
          : localStyles.retryBtn}
        accessibilityLabel={isChecking ? 'Checking…' : checkLabel}
        accessibilityHint="Checks the server before attempting another action"
        accessibilityState={{ disabled: isChecking, busy: isChecking }}
        scale={0.97}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="refresh-outline" size={IconGrammar.metadata} color={colors.textInverse} style={{ marginRight: 6 }} aria-hidden={true} />
        <Text style={localStyles.retryBtnText}>{isChecking ? 'Checking…' : checkLabel}</Text>
      </PressScale>
    </Reanimated.View>
  );
}

// ── Conflict state — document was edited on another device ──────────
interface ConflictStateViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  errorMessage: string;
  onReload: () => void;
  onDuplicate: () => void;
}

function ConflictStateView({
  colors,
  reduceMotion,
  springCfg,
  errorMessage,
  onReload,
  onDuplicate }: ConflictStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
  }, [opacity, reduceMotion, springCfg]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <View style={localStyles.errorCircle}>
        <Ionicons name="sync-outline" size={IconGrammar.hero} color={colors.warning} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Document was edited elsewhere</Text>
      <Text style={localStyles.centerStateText}>
        {errorMessage || 'The document changed on another device. Reload the latest version or duplicate your changes.'}
      </Text>
      <View style={localStyles.successBtnGroup}>
        <PressScale
          onPress={onReload}
          style={localStyles.viewBtn}
          accessibilityLabel="Reload from server"
          accessibilityHint="Reloads the latest server version of the document"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.viewBtnText}>Reload</Text>
        </PressScale>
        <PressScale
          onPress={onDuplicate}
          style={localStyles.createBtn}
          accessibilityLabel="Duplicate as new draft"
          accessibilityHint="Creates a new document from your local changes"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.createBtnText}>Duplicate</Text>
        </PressScale>
      </View>
    </Reanimated.View>
  );
}

// ── Schedule failed — honest state after immediate publish ─────────
// Scheduling failed AFTER the content was already published immediately.
// We must NOT show a success state that implies it will appear later.
// Instead, surface an honest explanation and offer corrective actions:
// retry the schedule, or accept the immediate publication.
interface ScheduleFailedViewProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  scheduleError: string;
  onRetrySchedule: () => void;
  onAcceptImmediate: () => void;
  onView: () => void;
}

function ScheduleFailedView({
  colors,
  styles,
  reduceMotion,
  springCfg,
  scheduleError,
  onRetrySchedule,
  onAcceptImmediate,
  onView }: ScheduleFailedViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
    } else {
      opacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
    }
  }, [reduceMotion, springCfg, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <View style={localStyles.errorCircle}>
        <Ionicons name="time-outline" size={IconGrammar.hero} color={colors.danger} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Scheduling failed</Text>
      <Text style={localStyles.centerStateText}>
        Your content was published immediately.
      </Text>
      {scheduleError ? (
        <Text style={localStyles.scheduleFailedDetail}>{scheduleError}</Text>
      ) : null}
      <View style={localStyles.successBtnGroup}>
        <PressScale
          onPress={onRetrySchedule}
          style={localStyles.viewBtn}
          accessibilityLabel="Retry scheduling"
          accessibilityHint="Attempts to schedule the already-published content for the selected date"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.viewBtnText}>Retry schedule</Text>
        </PressScale>
        <PressScale
          onPress={onAcceptImmediate}
          style={localStyles.createBtn}
          accessibilityLabel="Keep immediate publication"
          accessibilityHint="Accepts that the content is already public and continues"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.createBtnText}>Keep it live now</Text>
        </PressScale>
        <PressScale
          onPress={onView}
          style={localStyles.scheduleFailedViewBtn}
          accessibilityLabel="View published content"
          accessibilityHint="Opens the published look or poster"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.scheduleFailedViewText}>View</Text>
        </PressScale>
      </View>
    </Reanimated.View>
  );
}

// ── Quiet success — continuity over ceremony ──────────────────────
// Replaces the former confetti celebration. A small check, a single
// line of confirmation, and a primary action that transitions to the
// published object. No confetti, no oversized icon, no multi-step
// entrance choreography.
interface QuietSuccessViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  publishedId: string;
  documentType: 'look' | 'poster';
  onView: () => void;
  onCreateNew: () => void;
}

function QuietSuccessView({
  colors,
  reduceMotion,
  springCfg,
  documentType,
  onView,
  onCreateNew }: QuietSuccessViewProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      contentOpacity.value = 1;
    } else {
      contentOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
    }
  }, [reduceMotion, contentOpacity, springCfg]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value }));

  return (
    <Reanimated.View style={[styles.centerState, contentStyle]}>
      <Ionicons name="checkmark-circle" size={IconGrammar.hero} color={colors.success} aria-hidden={true} />
      <Text style={styles.successTitle}>Published</Text>
      <Text style={styles.centerStateText}>
        {documentType === 'look' ? 'Your look is live' : 'Your story is live'}
      </Text>
      <View style={styles.successBtnGroup}>
        <PressScale
          onPress={onView}
          style={styles.viewBtn}
          accessibilityLabel="View published content"
          accessibilityHint="Opens the published look or poster"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.viewBtnText}>View</Text>
        </PressScale>
        <PressScale
          onPress={onCreateNew}
          style={styles.createBtn}
          accessibilityLabel="Create new post"
          accessibilityHint="Starts a new creation in the studio"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.createBtnText}>New</Text>
        </PressScale>
      </View>
    </Reanimated.View>
  );
}

// ── Scheduled confirmation — truthful date/time, not "Shared" ──────
// When content is scheduled (not published immediately), the confirmation
// must show the actual scheduled date/time with timezone so the creator
// knows exactly when it will go live. No generic "Shared" label.
function formatScheduledDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

interface ScheduledViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  scheduledFor?: string;
  documentType: 'look' | 'poster';
  onView: () => void;
  onCreateNew: () => void;
}

function ScheduledView({
  colors,
  reduceMotion,
  springCfg,
  scheduledFor,
  documentType,
  onView,
  onCreateNew }: ScheduledViewProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    contentOpacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
  }, [reduceMotion, contentOpacity, springCfg]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  const dateLabel = scheduledFor ? formatScheduledDate(scheduledFor) : '';

  return (
    <Reanimated.View style={[styles.centerState, contentStyle]}>
      <Ionicons name="time-outline" size={IconGrammar.hero} color={colors.brand} aria-hidden={true} />
      <Text style={styles.successTitle}>Scheduled</Text>
      {dateLabel ? (
        <Text style={styles.centerStateText}>
          {documentType === 'look' ? 'Your look will go live' : 'Your story will go live'}{'\n'}{dateLabel}
        </Text>
      ) : (
        <Text style={styles.centerStateText}>
          {documentType === 'look' ? 'Your look is scheduled' : 'Your story is scheduled'}
        </Text>
      )}
      <View style={styles.successBtnGroup}>
        <PressScale
          onPress={onCreateNew}
          style={styles.viewBtn}
          accessibilityLabel="Create new post"
          accessibilityHint="Starts a new creation in the studio"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.viewBtnText}>New</Text>
        </PressScale>
        <PressScale
          onPress={onView}
          style={styles.createBtn}
          accessibilityLabel="Back to studio"
          accessibilityHint="Returns to the creator studio"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.createBtnText}>Done</Text>
        </PressScale>
      </View>
    </Reanimated.View>
  );
}

function PublishReview({
  document,
  onPublish,
  onSaveDraft,
  onOpenPreview }: {
  document: ReturnType<typeof useCreator>['document'];
  onPublish: () => void;
  onSaveDraft: () => Promise<void>;
  onOpenPreview?: () => void;
}) {
  const { updateMetadata } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { isOffline } = useConnectivity();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isMultiPage = document.pages.length > 1;
  const coverThumbSize = 80;
  const coverThumbHeight = 100;
  const coverPage = document.pages[0];
  const [coverPageIndex, setCoverPageIndex] = useState(0);
  const [captionError, setCaptionError] = useState('');
  const [captionBlurred, setCaptionBlurred] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  // ── Audience selector segmented control ─────────────────────────
  // Close Friends is not shown until a real audience graph, authorization
  // query, delivery filter, and viewer behavior exist. Old drafts using
  // that value are silently closed to private by the serializers.
  const audienceOptions = [
    { key: 'public' as const, label: 'Public', icon: 'globe-outline' as const },
    { key: 'private' as const, label: 'Private', icon: 'lock-closed-outline' as const },
  ];
  const activeAudienceIndex = audienceOptions.findIndex((o) => o.key === document.metadata.visibility);

  // Segmented control spring slide indicator
  const segmentTranslateX = useSharedValue(activeAudienceIndex);
  const segmentWidth = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      segmentTranslateX.value = activeAudienceIndex;
    } else {
      segmentTranslateX.value = withSpring(activeAudienceIndex, Motion.spring.indicator);
    }
  }, [activeAudienceIndex, reduceMotion, segmentTranslateX]);

  const segmentIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: segmentTranslateX.value * segmentWidth.value }] }));

  // ── Caption validation ──────────────────────────────────────────
  // Caption is optional for looks but recommended; for posters with no media,
  // a caption helps. We show a soft warning, not a hard block.
  const captionErrorOpacity = useSharedValue(0);
  const captionErrorTranslateY = useSharedValue(-8);

  useEffect(() => {
    if (captionError) {
      if (reduceMotion) {
        captionErrorOpacity.value = 1;
        captionErrorTranslateY.value = 0;
      } else {
        captionErrorOpacity.value = withSpring(1, Motion.spring.entrance);
        captionErrorTranslateY.value = withSpring(0, Motion.spring.entrance);
      }
    } else {
      captionErrorOpacity.value = reduceMotion ? 0 : withTiming(0, { duration: Motion.duration.fast });
      captionErrorTranslateY.value = reduceMotion ? -8 : withTiming(-8, { duration: Motion.duration.fast });
    }
  }, [captionError, reduceMotion, spring.entrance, captionErrorOpacity, captionErrorTranslateY]);

  const captionErrorStyle = useAnimatedStyle(() => ({
    opacity: captionErrorOpacity.value,
    transform: [{ translateY: captionErrorTranslateY.value }] }));

  const handleCaptionBlur = useCallback(() => {
    setCaptionBlurred(true);
    // Validate after state update
    setTimeout(() => {
      if (document.metadata.caption.trim().length === 0 && document.type === 'poster') {
        setCaptionError('Add a caption to help your audience discover this poster');
        haptic.warning();
      } else {
        setCaptionError('');
      }
    }, 0);
  }, [document.metadata.caption, document.type, haptic]);

  const handlePublishWithValidation = useCallback(() => {
    if (document.type === 'poster' && document.metadata.caption.trim().length === 0) {
      setCaptionBlurred(true);
      setCaptionError('Add a caption to help your audience discover this poster');
      haptic.warning();
      return;
    }
    setCaptionError('');
    // Inject the selected cover page index into the document metadata
    // so the publish pipeline and backend can use it as the poster cover.
    if (coverPageIndex > 0 && document.pages.length > 1) {
      document.metadata.coverPageIndex = coverPageIndex;
    }
    onPublish();
  }, [document.type, document.metadata.caption, onPublish, haptic, coverPageIndex, document.pages.length, document.metadata]);

  // ── Save as draft with navigation ───────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    haptic.light();
    await onSaveDraft();
  }, [haptic, onSaveDraft]);

  const toggleMoreOptions = useCallback(() => {
    haptic.selection();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(200, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity),
    );
    setMoreOptionsOpen((v) => !v);
  }, [haptic]);

  const publishDisabled = isOffline || !!document.metadata.scheduledFor;

  return (
    <View style={styles.reviewBody}>
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ── Cover thumbnail + caption — the dominant object ──
            A single tappable cover sits at top-left; the caption fills
            the remaining width as the primary writing surface. No label
            needed — the placeholder is the label. */}
        <View style={styles.composerRow}>
          <Pressable
            onPress={onOpenPreview}
            disabled={!onOpenPreview}
            style={styles.coverThumb}
            accessibilityLabel="Preview composition"
            accessibilityHint="Opens the full-screen preview"
            accessibilityRole="button"
          >
            <CreatorCanvas
              document={document}
              page={coverPage}
              canvasWidth={coverThumbSize}
              canvasHeight={coverThumbHeight}
              mode="preview"
            />
            {isMultiPage && (
              <View style={styles.pageCountBadge}>
                <Text style={styles.pageCountText}>{document.pages.length}</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.captionColumn}>
            <TextInput
              style={styles.captionInput}
              placeholder="Write a caption..."
              placeholderTextColor={colors.textMuted}
              value={document.metadata.caption}
              onChangeText={(v) => {
                updateMetadata({ caption: v });
                if (captionError && v.trim().length > 0) {
                  setCaptionError('');
                }
              }}
              onBlur={handleCaptionBlur}
              multiline
              maxLength={2200}
              accessibilityLabel="Caption"
            />
            <Text style={styles.captionCount}>{document.metadata.caption.length}/2,200</Text>
          </View>
        </View>
        {/* Inline caption error with spring appearance */}
        {captionError !== '' && (
          <Reanimated.View style={[styles.captionErrorWrap, captionErrorStyle]}>
            <Ionicons name="alert-circle-outline" size={IconGrammar.metadata} color={colors.danger} aria-hidden={true} />
            <Text style={styles.captionErrorText}>{captionError}</Text>
          </Reanimated.View>
        )}

        {/* ── Audience segmented control — self-labeling via icons ── */}
        <View
          style={styles.audienceSegmented}
          onLayout={(e) => { segmentWidth.value = e.nativeEvent.layout.width / audienceOptions.length; }}
        >
          <Reanimated.View
            style={[
              styles.audienceSegmentIndicator,
              { width: `${100 / audienceOptions.length}%` },
              segmentIndicatorStyle,
            ]}
            pointerEvents="none"
          />
          {audienceOptions.map((opt) => {
            const isActive = document.metadata.visibility === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => { haptic.light(); updateMetadata({ visibility: opt.key }); }}
                style={styles.audienceSegmentItem}
                accessibilityLabel={`Audience ${opt.label}`}
                accessibilityHint={`Sets visibility to ${opt.label}`}
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name={opt.icon} size={IconGrammar.metadata} color={isActive ? colors.textInverse : colors.textSecondary} aria-hidden={true} />
                <Text style={[styles.audienceSegmentText, isActive && styles.audienceSegmentTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── More options disclosure — collapsed by default ──
            Contains interaction toggles, cover selection, and the
            schedule warning. Secondary concerns that should not
            clutter the publish decision. */}
        <Pressable
          onPress={toggleMoreOptions}
          style={styles.disclosureHeader}
          accessibilityLabel={moreOptionsOpen ? 'Collapse more options' : 'Expand more options'}
          accessibilityHint="Shows cover selection and interaction settings"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.disclosureHeaderText}>More options</Text>
          <Ionicons
            name={moreOptionsOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={IconGrammar.metadata}
            color={colors.textSecondary}
            aria-hidden={true}
          />
        </Pressable>
        {moreOptionsOpen && (
          <View style={styles.disclosureBody}>
            {/* Interaction toggles — poster only */}
            {document.type === 'poster' && (
              <>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Allow replies</Text>
                  <Switch
                    value={document.metadata.allowReplies}
                    onValueChange={(v) => { haptic.selection(); updateMetadata({ allowReplies: v }); }}
                    trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
                    thumbColor={document.metadata.allowReplies ? colors.textInverse : colors.textMuted}
                    accessibilityLabel="Allow replies"
                    accessibilityHint="Toggles whether viewers can reply to this poster"
                  />
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Allow reactions</Text>
                  <Switch
                    value={document.metadata.allowReactions}
                    onValueChange={(v) => { haptic.selection(); updateMetadata({ allowReactions: v }); }}
                    trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
                    thumbColor={document.metadata.allowReactions ? colors.textInverse : colors.textMuted}
                    accessibilityLabel="Allow reactions"
                    accessibilityHint="Toggles whether viewers can react to this poster"
                  />
                </View>
              </>
            )}

            {/* Cover selection — for multi-page stories */}
            {isMultiPage && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coverScroll} contentContainerStyle={styles.coverContainer}>
                {document.pages.map((page, i) => (
                  <Pressable
                    key={page.id}
                    onPress={() => { haptic.selection(); setCoverPageIndex(i); }}
                    style={[styles.coverThumbWrap, coverPageIndex === i && styles.coverThumbActive]}
                    accessibilityLabel={`Set page ${i + 1} as cover`}
                    accessibilityHint="Sets this page as the story cover"
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <CreatorCanvas
                      document={document}
                      page={page}
                      canvasWidth={coverThumbSize}
                      canvasHeight={coverThumbHeight}
                      mode="preview"
                    />
                    {coverPageIndex === i && (
                      <View style={styles.coverBadge}>
                        <Ionicons name="checkmark" size={IconGrammar.badge} color={colors.textInverse} aria-hidden={true} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* Scheduling remains fail-closed until publishing and scheduling are
                one atomic server operation. Old drafts can clear stale metadata;
                new drafts are not shown a control that publishes immediately. */}
            {document.metadata.scheduledFor && (
              <View style={styles.scheduleDateTime}>
                <Ionicons name="alert-circle-outline" size={IconGrammar.metadata} color={colors.warning} aria-hidden={true} />
                <Text style={styles.scheduleDateTimeText}>
                  Scheduling is unavailable. Clear it to publish now.
                </Text>
                <Pressable
                  onPress={() => { haptic.light(); updateMetadata({ scheduledFor: undefined }); }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Clear schedule"
                  accessibilityHint="Removes the scheduled date and switches to publish now"
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle" size={IconGrammar.standard} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Offline banner — prevents failed publish attempts. Save draft
            remains available because drafts are stored locally. */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={IconGrammar.metadata} color={colors.warning} aria-hidden={true} />
            <Text style={styles.offlineBannerText}>
              You're offline. Save as draft and publish when you're back online.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Sticky bottom: Publish (primary) + Save draft (quiet) ── */}
      <View style={styles.stickyFooter}>
        <PressScale
          onPress={handlePublishWithValidation}
          disabled={publishDisabled}
          style={[styles.publishBtn, publishDisabled ? styles.publishBtnDisabled : {}]}
          accessibilityLabel={document.metadata.scheduledFor ? 'Clear schedule to publish' : 'Publish now'}
          accessibilityHint={document.metadata.scheduledFor ? 'Scheduling is unavailable in this build' : 'Publishes the content immediately'}
          accessibilityState={{ disabled: publishDisabled }}
          scale={0.97}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.publishBtnText}>{document.metadata.scheduledFor ? 'Clear schedule first' : 'Publish now'}</Text>
        </PressScale>
        <Pressable
          onPress={handleSaveDraft}
          style={styles.draftBtn}
          accessibilityLabel="Save as draft"
          accessibilityHint="Saves the current creation as a draft"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.draftBtnText}>Save draft</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ThemeColorsType = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColorsType) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      color: colors.textPrimary },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm },
    scrollBody: {
      paddingHorizontal: Space.md },
    scrollContent: {
      paddingBottom: Space.xl,
      gap: Space.sm },
    // ── Subtle section labels ──
    // Small, muted, regular weight — NOT uppercase eyebrows. These help
    // the user scan the sheet without adding visual noise.
    sectionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginBottom: Space.xs },
    // ── Hairline separator between sections ──
    sectionSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.md },
    previewContainer: {
      alignItems: 'center',
      paddingVertical: Space.sm,
      gap: Space.md },
    previewScroll: {
      marginHorizontal: -Space.md },
    previewPageWrapper: {
      marginHorizontal: Space.md,
      borderRadius: Radius.lg,
      overflow: 'hidden' },
    textInput: {
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary,
      minHeight: 60 },
    captionField: {
      borderBottomWidth: Stroke.hairline,
      borderBottomColor: colors.border,
      paddingVertical: Space.sm },
    captionFieldError: {
      borderBottomColor: colors.danger },
    captionInput: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary,
      minHeight: 84,
      textAlignVertical: 'top',
      padding: 0 },
    captionCount: {
      alignSelf: 'flex-end',
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      marginTop: Space.xs },
    captionErrorWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.xs },
    captionErrorText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.danger },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.smMd },
    toggleLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary },
    toggleLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    cameraRollRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.smMd },
    // ── Audience segmented control ──
    audienceSegmented: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      padding: Space.xs,
      marginBottom: Space.sm,
      position: 'relative' },
    audienceSegmentIndicator: {
      position: 'absolute',
      top: Space.xs,
      bottom: Space.xs,
      left: Space.xs,
      width: `${100 / 3}%`,
      backgroundColor: colors.brand,
      borderRadius: Radius.md },
    audienceSegmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      zIndex: 1 },
    audienceSegmentText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary },
    audienceSegmentTextActive: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold },
    // ── Cover selection ──
    coverScroll: {
      marginHorizontal: -Space.md },
    coverContainer: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
      paddingBottom: Space.xs },
    coverThumbWrap: {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      borderWidth: Stroke.emphasis,
      borderColor: 'transparent' },
    coverThumbActive: {
      borderColor: colors.brand },
    coverBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center' },
    scheduleRow: {
      flexDirection: 'row',
      gap: Space.sm },
    schedulePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border },
    schedulePillActive: {
      borderColor: colors.brand },
    schedulePillText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    scheduleDateTime: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    scheduleDateTimeText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary },
    actionRow: {
      gap: Space.sm,
      marginTop: Space.lg },
    draftBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: 44,
      borderRadius: Radius.md },
    draftBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    publishBtn: {
      width: '100%',
      height: 50,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center' },
    publishBtnDisabled: {
      opacity: 0.4 },
    publishBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    // Offline banner — shown when device has no connectivity.
    // Uses warning color (amber) to signal caution without alarm.
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.warningSubtle,
      marginBottom: Space.sm },
    offlineBannerText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      lineHeight: TypographyV2.meta.lineHeight },
    centerState: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      gap: Space.sm },
    centerStateTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.screenTitle.size,
      color: colors.textPrimary },
    centerStateText: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      textAlign: 'center' },
    // ── Progress bar — calm, thin, full-width ──
    progressBarTrack: {
      width: '100%',
      height: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      marginTop: Space.sm },
    progressBarFillContainer: {
      height: '100%',
      borderRadius: Radius.full,
      overflow: 'hidden' },
    progressBarGradient: {
      flex: 1 },
    progressByteLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      marginTop: Space.xs },
    cancelUploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.md,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      alignSelf: 'center' },
    cancelUploadText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary },
    // ── Error state ──
    errorCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.dangerSubtle,
      justifyContent: 'center',
      alignItems: 'center' },
    unknownCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.warningSubtle,
      justifyContent: 'center',
      alignItems: 'center' },
    unknownDetail: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: Space.md },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.lg,
      height: 44,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      marginTop: Space.sm },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
    // ── Success state ──
    successTitle: {
      fontFamily: Typography.family.bold,
      fontSize: TypographyV2.sectionTitle.size,
      color: colors.textPrimary },
    successBtnGroup: {
      width: '100%',
      gap: Space.sm,
      marginTop: Space.md },
    viewBtn: {
      width: '100%',
      height: 50,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center' },
    viewBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      width: '100%',
      height: 44,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      borderColor: colors.brand },
    createBtnText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    // ── Schedule failed state ──
    scheduleFailedDetail: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: Space.md },
    scheduleFailedViewBtn: {
      width: '100%',
      height: 44,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center' },
    scheduleFailedViewText: {
      color: colors.textSecondary,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    // ── Re-authored PublishReview styles ──
    // Solid fill for progress bar (replaces gradient — a gradient on a
    // 4px bar is invisible decoration per AGENTS.md §4).
    progressBarFill: {
      height: '100%',
      borderRadius: Radius.full,
      backgroundColor: colors.brand },
    // Main review container — fills the sheet, column layout.
    reviewBody: {
      flex: 1 },
    // Row containing cover thumbnail + caption input side by side.
    composerRow: {
      flexDirection: 'row',
      gap: Space.md,
      alignItems: 'flex-start',
      paddingVertical: Space.sm },
    // Cover thumbnail — single tappable preview, 80×100px.
    coverThumb: {
      width: 80,
      height: 100,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    // Page count badge on cover — small, top-right.
    pageCountBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 20,
      height: 20,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6 },
    pageCountText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary },
    // Caption column — fills remaining width next to cover thumb.
    captionColumn: {
      flex: 1 },
    // More options disclosure header — quiet, pressable.
    disclosureHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.smMd },
    disclosureHeaderText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    // Disclosure body — expanded content for toggles, cover selection, schedule.
    disclosureBody: {
      paddingTop: Space.xs,
      paddingBottom: Space.sm,
      gap: Space.xs },
    // Sticky footer — publish + save draft at the bottom.
    stickyFooter: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: Space.xs } });
}
