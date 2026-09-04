import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  AppState,
  ActivityIndicator,
  Alert,
  type AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, RootStackParamList } from '../navigation/types';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  type SharedValue } from 'react-native-reanimated';
import { Space, Radius, Typography, Stroke, IconGrammar, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
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
import type { UploadJob } from './core/upload';
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
import { isExportAvailable, exportDocumentImage } from './export/mediaExportService';

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

function isNetworkError(error: string | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes('network') || lower.includes('fetch') || lower.includes('abort') || lower.includes('timeout') || lower.includes('connection');
}

/**
 * Map a raw upload error string to a short, human-friendly message.
 * Raw errors from the upload pipeline (XHR status codes, abort reasons,
 * network stack messages) are not useful to surface verbatim — they read
 * as developer diagnostics. This translates the common failure modes
 * into plain language a user can act on.
 */
function humanizeUploadError(error: string | undefined): string {
  if (!error) return 'Something went wrong. Try again.';
  const e = error.toLowerCase();
  if (e.includes('network') || e.includes('fetch')) return 'Check your connection and try again.';
  if (e.includes('403')) return 'Permission denied. Try again.';
  if (e.includes('413') || e.includes('too large')) return 'File too large.';
  if (e.includes('aborted') || e.includes('cancel')) return 'Upload cancelled.';
  if (e.includes('timeout')) return 'Upload timed out. Try again.';
  return 'Something went wrong. Try again.';
}

/**
 * Generate a unique publication attempt ID. This is persisted locally
 * before the publish request and used as the idempotency key. A new
 * attempt (retry, re-publish after edit) generates a new ID so the
 * server can distinguish replay from a genuinely new publication.
 */
function humanizePublishError(error: string): string {
  if (!error) return 'Something went wrong. Try again.';
  if (/\b[45]\d{2}\b/.test(error)) return 'Something went wrong. Try again.';
  if (/error[: ]|exception|abort|failed to fetch|network request failed/i.test(error)) return 'Something went wrong. Try again.';
  return error;
}

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

/**
 * Discriminated union for the publish sheet's finite state machine.
 * Each tag carries exactly the data it needs — impossible states (e.g.
 * "success" without a publishedId, "error" without a message) are
 * unrepresentable at the type level.
 */
type PublishState =
  | { tag: 'review' }
  | { tag: 'saving' }
  | { tag: 'uploading'; progress: number }
  | { tag: 'processing' }
  | { tag: 'publishing' }
  | { tag: 'error'; message: string; canRetry: boolean; canSaveDraft: boolean }
  | { tag: 'success'; publishedId: string }
  | { tag: 'scheduled'; dueAt: string }
  | { tag: 'unknown'; detail: string }
  | { tag: 'scheduleUnknown'; detail: string }
  | { tag: 'scheduleFailed'; error: string }
  | { tag: 'conflict'; message: string };

const REVIEW_STATE: PublishState = { tag: 'review' };

export function CreatorPublishSheet({ visible, onClose, editingLookId, onOpenPreview }: CreatorPublishSheetProps) {
  const { document, saveDraft } = useCreator();
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
  const [isCheckingResult, setIsCheckingResult] = useState(false);
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
  const styles = useMemo(() => createStyles(colors), [colors]);

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
  }, [stage, onClose]);

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
          showToast('Paused — keep app open', 'info');
        }
      }
    });
    return () => subscription.remove();
  }, [stage, showToast]);

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
  }, [haptic, saveDraft]);

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
  }, [haptic, saveDraft, onClose, progressWidth]);

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
                if (job.status === 'queued' || job.status === 'initiating' || job.status === 'uploading') {
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
  }, [haptic, uploadManager, progressWidth]);

  const handlePublish = useCallback(async () => {
    // Prevent duplicate submissions
    if (!publishGuardRef.current.begin(document.id)) {
      return;
    }
    haptic.medium();

    CreatorAnalytics.publishStart(document.type);
    let publicationRequestStarted = false;
    const abortController = new AbortController();
    publishAbortRef.current = abortController;
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
        setPublishState({ tag: 'uploading', progress: uploadManager.progress });
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
              humanizeUploadError(failedJobs[0].error),
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
      setPublishState({ tag: 'processing' });
      progressWidth.value = reduceMotion ? 0.75 : withSpring(0.75, spring.entrance);

      // ── Export pipeline: render composition to a canonical image ──
      // When the native export module is linked, render the first page
      // to a PNG via Skia offscreen surface and upload it as the
      // canonical published asset. This produces a faithful render of
      // the authored composition (overlays, filters, layers burned in)
      // rather than relying on the source media alone.
      if (isExportAvailable() && workingDoc.pages.length > 0) {
        try {
          const firstPage = workingDoc.pages[0];
          const exported = await exportDocumentImage(workingDoc, firstPage.id, {
            quality: 'feed',
            onProgress: (p) => {
              // Map export progress into the 0.75–0.85 range
              const mapped = 0.75 + p * 0.1;
              progressWidth.value = reduceMotion ? mapped : withSpring(mapped, spring.entrance);
            },
          });
          if (exported) {
            // Upload the rendered image through the upload manager so
            // it follows the same durable retry path as source media.
            const exportAssetId = `export::${firstPage.id}`;
            await uploadManager.queueUpload({
              projectId: workingDoc.id,
              assetId: exportAssetId,
              localPath: exported.uri,
              mimeType: 'image/png',
              assetType: 'image',
              maxRetries: 3,
              folder: workingDoc.type === 'look' ? 'looks' : 'posters',
            });
            const exportJobs = await uploadManager.waitForCompletion();
            const exportJob = exportJobs.find((j) => j.assetId === exportAssetId);
            if (exportJob?.status === 'completed' && exportJob.remoteUrl) {
              // Store the exported render URL in the document metadata
              // so the publication orchestrator can use it as the
              // canonical published image.
              workingDoc = {
                ...workingDoc,
                metadata: {
                  ...workingDoc.metadata,
                  exportedRenderUrl: exportJob.remoteUrl,
                  exportedRenderWidth: exported.width,
                  exportedRenderHeight: exported.height,
                },
              };
            }
          }
        } catch (exportErr) {
          // Export failure is non-fatal — fall back to source media.
          console.warn('Skia export failed, falling back to source media:', exportErr);
        }
      }

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
            setPublishState({ tag: 'conflict', message: err.message });
            publishGuardRef.current.fail();
            return;
          }
          throw err;
        }
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
        setPublishState({ tag: 'scheduled', dueAt: workingDoc.metadata.scheduledFor });
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
        invalidateCachesAfterPublish(workingDoc.id, currentUser?.id ?? null);
        progressWidth.value = reduceMotion ? 1 : withSpring(1, spring.success);
        setPublishState({ tag: 'success', publishedId: targetId });
        CreatorAnalytics.publishSuccess(workingDoc.type, targetId);
      }
    } catch (err: unknown) {
      publishGuardRef.current.fail();

      if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setPublishState(REVIEW_STATE);
        return;
      }

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
          setPublishState({
            tag: 'conflict',
            message: details?.error
              ?? 'The document was edited on another device. Reload the latest version or duplicate your changes.',
          });
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
      // Once a write has left the device, a dropped response is ambiguous:
      // the backend may have committed it. Never call that failure or success.
      const isUnknown = publicationRequestStarted && isNetworkError(errorMessage);
      // Distinguish schedule unknown from publish unknown so the UI
      // offers the correct reconciliation action ("Check schedule" vs
      // "Check publish result") and analytics can separate the two.
      const isSchedule = !!document.metadata.scheduledFor;
      if (isUnknown) {
        setPublishState({ tag: isSchedule ? 'scheduleUnknown' : 'unknown', detail: errorMessage });
      } else {
        setPublishState({ tag: 'error', message: errorMessage, canRetry: true, canSaveDraft: true });
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
  }, [document, editingLookId, reduceMotion, spring.entrance, spring.success, uploadManager, currentUser, haptic]);

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

  const handleCheckPublishResult = useCallback(async () => {
    const targetId = editingLookId ?? document.id;
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
        invalidateCachesAfterPublish(publication.targetId, currentUser?.id ?? null);
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
      // Invalidate caches — the publication was confirmed via check-result.
      invalidateCachesAfterPublish(targetId, currentUser?.id ?? null);
      progressWidth.value = 1;
      setPublishState({ tag: 'success', publishedId: targetId });
      CreatorAnalytics.publishSuccess(document.type, targetId);
    } catch {
      setPublishState({ tag: 'unknown', detail: 'No result yet. Check again.' });
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
  }, [document.id, document.type, haptic, progressWidth, scheduleAttemptId, document.metadata.scheduledFor]);

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
  }, [document, haptic, reduceMotion, spring.entrance, spring.success, progressWidth]);

  // Accept that the content was published immediately (skip scheduling).
  const handleAcceptImmediate = useCallback(() => {
    haptic.selection();
    setPublishState({ tag: 'success', publishedId: '' });
  }, [haptic]);

  if (!visible && stage === 'review') return null;

  // Extract state-specific data for the render.
  const errorMessage = publishState.tag === 'error' ? publishState.message
    : publishState.tag === 'conflict' ? publishState.message
    : publishState.tag === 'unknown' ? publishState.detail
    : publishState.tag === 'scheduleUnknown' ? publishState.detail
    : '';
  const publishedId = publishState.tag === 'success' ? publishState.publishedId : '';
  const scheduleError = publishState.tag === 'scheduleFailed' ? publishState.error : '';

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
        <View style={styles.header}>
          <Text style={styles.title}>Share</Text>
          <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close share" accessibilityHint="Closes the share sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textPrimary} aria-hidden={true} />
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
            stage={stage}
            progressAnimatedStyle={progressAnimatedStyle}
            progressWidth={progressWidth}
            onCancel={stage === 'uploading' ? handleCancelUpload : undefined}
            isConfirming={stage === 'uploading' && uploadManager.isConfirming}
            isStalled={stage === 'uploading' && uploadManager.isStalled}
          />
        )}

        {stage === 'success' && (
          <SuccessView
            colors={colors}
            reduceMotion={reduceMotion}
            onDone={() => {
              haptic.selection();
              onClose();
              setPublishState(REVIEW_STATE);
            }}
            onView={publishedId ? () => {
              haptic.selection();
              onClose();
              setPublishState(REVIEW_STATE);
              if (document.type === 'look') {
                navigation.replace('LookDetail', { lookId: publishedId });
              } else {
                navigation.replace('PosterViewer', { storyId: publishedId });
              }
            } : undefined}
          />
        )}

        {stage === 'scheduled' && (
          <ConfirmationView
            colors={colors}
            reduceMotion={reduceMotion}
            icon="time-outline"
            iconColor={colors.brand}
            title="Scheduled"
            body={publishState.dueAt
              ? `${document.type === 'look' ? 'Your look will go live' : 'Your story will go live'}\n${formatScheduledDate(publishState.dueAt)}`
              : (document.type === 'look' ? 'Your look is scheduled' : 'Your story is scheduled')}
            primaryAction={{
              label: 'New',
              onPress: () => {
                haptic.selection();
                onClose();
                setPublishState(REVIEW_STATE);
                navigation.navigate('CreatorStudio', { type: document.type });
              },
              accessibilityLabel: 'Create new post',
              accessibilityHint: 'Starts a new creation in the studio',
            }}
            secondaryAction={{
              label: 'Done',
              onPress: () => {
                haptic.selection();
                onClose();
                setPublishState(REVIEW_STATE);
                navigation.navigate('CreatorStudio', { type: document.type });
              },
              accessibilityLabel: 'Back to studio',
              accessibilityHint: 'Returns to the creator studio',
            }}
          />
        )}

        {stage === 'error' && (
          <ErrorStateView
            colors={colors}
            reduceMotion={reduceMotion}
            errorMessage={errorMessage}
            onRetry={handleRetry}
            onSaveDraft={handleSaveDraftFromError}
            haptic={haptic}
          />
        )}

        {stage === 'unknown' && (
          <UnknownOutcomeView
            colors={colors}
            reduceMotion={reduceMotion}
            detail={errorMessage}
            isChecking={isCheckingResult}
            onCheck={handleCheckPublishResult}
          />
        )}

        {stage === 'scheduleUnknown' && (
          <UnknownOutcomeView
            colors={colors}
            reduceMotion={reduceMotion}
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
            errorMessage={errorMessage}
            onReload={() => {
              haptic.selection();
              serverDocMetaRef.current = null;
              setPublishState(REVIEW_STATE);
              progressWidth.value = 0;
              publishGuardRef.current.reset();
            }}
            onDuplicate={() => {
              haptic.selection();
              serverDocMetaRef.current = null;
              setPublishState(REVIEW_STATE);
              progressWidth.value = 0;
              publishGuardRef.current.reset();
            }}
          />
        )}

        {stage === 'scheduleFailed' && (
          <ScheduleFailedView
            colors={colors}
            reduceMotion={reduceMotion}
            scheduleError={scheduleError}
            onRetrySchedule={handleRetrySchedule}
            onAcceptImmediate={handleAcceptImmediate}
            onView={() => {
              haptic.selection();
              onClose();
              setPublishState(REVIEW_STATE);
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

// ── Sharing state — real progress bar with percentage ──────────────
// During upload, a Reanimated progress bar reflects real transmitted
// bytes. During processing/publishing, the bar holds at its last
// position. A percentage label sits alongside so the user has a numeric
// anchor without a web-style "50%" theatre.
interface SharingStateViewProps {
  colors: ThemeColors;
  stage: 'uploading' | 'processing' | 'publishing';
  progressAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  progressWidth: SharedValue<number>;
  onCancel?: () => void;
  /** True when uploads are in the server-confirmation phase (bytes done, awaiting DB row + moderation). */
  isConfirming?: boolean;
  /** True when an upload has stalled (no progress for an extended period). */
  isStalled?: boolean;
}

function SharingStateView({
  colors,
  stage,
  progressAnimatedStyle,
  progressWidth,
  onCancel,
  isConfirming,
  isStalled }: SharingStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const showCancel = stage === 'uploading' && !!onCancel;
  const percentLabel = useMemo(() => {
    const pct = Math.round(progressWidth.value * 100);
    return `${Math.min(100, Math.max(0, pct))}%`;
  }, [progressWidth.value]);

  // Truthful phase label — distinguishes "bytes transferring" from
  // "server confirming" from "stalled". Never shows 100% until the
  // server has confirmed the DB row + moderation (AGENTS.md §11).
  const phaseLabel = useMemo(() => {
    if (stage !== 'uploading') return 'Sharing…';
    if (isStalled) return 'Taking longer than usual…';
    if (isConfirming) return 'Confirming…';
    return `Uploading… ${percentLabel}`;
  }, [stage, isStalled, isConfirming, percentLabel]);

  return (
    <View style={localStyles.progressState}>
      <View style={localStyles.progressBarTrack} accessibilityRole="progressbar">
        <Reanimated.View style={[localStyles.progressBarFill, progressAnimatedStyle]} />
      </View>
      <Text style={localStyles.progressLabel}>
        {phaseLabel}
      </Text>
      {showCancel && (
        <Pressable
          onPress={onCancel}
          style={localStyles.cancelUploadBtn}
          accessibilityLabel="Cancel upload"
          accessibilityHint="Cancels the in-progress upload and returns to review"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.cancelUploadText}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Error State View with spring entrance and retry ────────────────
interface ErrorStateViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  errorMessage: string;
  onRetry: () => void;
  onSaveDraft: () => void;
  haptic: ReturnType<typeof useHaptic>;
}

function ErrorStateView({
  colors,
  reduceMotion,
  errorMessage,
  onRetry,
  onSaveDraft }: ErrorStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
    } else {
      opacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
    }
  }, [reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <Ionicons name="alert-circle-outline" size={24} color={colors.danger} aria-hidden={true} />
      <Text style={localStyles.errorTitle}>Couldn't publish</Text>
      <Text style={localStyles.errorDetail}>{humanizePublishError(errorMessage)}</Text>
      <PressScale
        onPress={onRetry}
        style={localStyles.retryBtn}
        accessibilityLabel="Retry publish"
        accessibilityHint="Retries the failed publish attempt"
        scale={0.95}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={localStyles.retryBtnText}>Retry</Text>
      </PressScale>
      <Pressable
        onPress={onSaveDraft}
        style={localStyles.saveDraftLink}
        accessibilityLabel="Save as draft"
        accessibilityHint="Saves the current creation as a draft and closes the sheet"
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={localStyles.saveDraftLinkText}>Save as draft</Text>
      </Pressable>
    </Reanimated.View>
  );
}

// ── Success state — minimal and confident ──────────────────────────
// A checkmark inside a 72pt success-tinted circle with a spring scale
// entrance, "Shared" in 17pt semibold, and one full-width "Done" button.
interface SuccessViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  onDone: () => void;
  onView?: () => void;
}

function SuccessView({
  colors,
  reduceMotion,
  onDone,
  onView }: SuccessViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const iconScale = useSharedValue(reduceMotion ? 1 : 0.7);

  useEffect(() => {
    contentOpacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
    iconScale.value = reduceMotion
      ? 1
      : withSpring(1, Motion.spring.settle);
  }, [reduceMotion, contentOpacity, iconScale]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  return (
    <Reanimated.View style={[localStyles.centerState, contentStyle]}>
      <Reanimated.View style={[localStyles.successCircle, iconStyle]}>
        <Ionicons name="checkmark" size={IconGrammar.hero} color={colors.success} aria-hidden={true} />
      </Reanimated.View>
      <Text style={localStyles.successTitle}>Shared</Text>
      <PressScale
        onPress={onDone}
        style={localStyles.doneBtn}
        accessibilityLabel="Done"
        accessibilityHint="Closes the publish sheet"
        scale={0.97}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={localStyles.doneBtnText}>Done</Text>
      </PressScale>
      {onView && (
        <Pressable
          onPress={onView}
          style={localStyles.viewLink}
          accessibilityRole="button"
          accessibilityLabel="View post"
          accessibilityHint="Opens the published content"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.viewLinkText}>View</Text>
        </Pressable>
      )}
    </Reanimated.View>
  );
}

interface UnknownOutcomeViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  detail: string;
  isChecking: boolean;
  onCheck: () => void;
  /** Label for the check button (e.g. "Check publication" or "Check schedule"). */
  checkLabel?: string;
}

function UnknownOutcomeView({
  colors,
  reduceMotion,
  detail,
  isChecking,
  onCheck,
  checkLabel = 'Check publication' }: UnknownOutcomeViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
  }, [opacity, reduceMotion]);

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
        Connection lost. Your post may be live.
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
  errorMessage: string;
  onReload: () => void;
  onDuplicate: () => void;
}

function ConflictStateView({
  colors,
  reduceMotion,
  errorMessage,
  onReload,
  onDuplicate }: ConflictStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <View style={localStyles.errorCircle}>
        <Ionicons name="sync-outline" size={IconGrammar.hero} color={colors.warning} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Document was edited elsewhere</Text>
      <Text style={localStyles.centerStateText}>
        {errorMessage || 'Changed on another device. Reload or duplicate.'}
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
  reduceMotion: boolean;
  scheduleError: string;
  onRetrySchedule: () => void;
  onAcceptImmediate: () => void;
  onView: () => void;
}

function ScheduleFailedView({
  colors,
  reduceMotion,
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
      opacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
    }
  }, [reduceMotion, opacity]);

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

// ── Confirmation — shared success & scheduled states ──────────────
// One quiet confirmation surface for both "Published" and "Scheduled"
// outcomes. A single hero icon, a one-line body, and a primary +
// secondary action. No confetti, no oversized icon, no multi-step
// entrance choreography.
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

interface ConfirmationAction {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
}

interface ConfirmationViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  primaryAction: ConfirmationAction;
  secondaryAction: ConfirmationAction;
}

function ConfirmationView({
  colors,
  reduceMotion,
  icon,
  iconColor,
  title,
  body,
  primaryAction,
  secondaryAction }: ConfirmationViewProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    contentOpacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
  }, [reduceMotion, contentOpacity]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  return (
    <Reanimated.View style={[styles.centerState, contentStyle]}>
      <Ionicons name={icon} size={IconGrammar.hero} color={iconColor} aria-hidden={true} />
      <Text style={styles.successTitle}>{title}</Text>
      <Text style={styles.centerStateText}>{body}</Text>
      <View style={styles.successBtnGroup}>
        <PressScale
          onPress={primaryAction.onPress}
          style={styles.viewBtn}
          accessibilityLabel={primaryAction.accessibilityLabel}
          accessibilityHint={primaryAction.accessibilityHint}
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.viewBtnText}>{primaryAction.label}</Text>
        </PressScale>
        <PressScale
          onPress={secondaryAction.onPress}
          style={styles.createBtn}
          accessibilityLabel={secondaryAction.accessibilityLabel}
          accessibilityHint={secondaryAction.accessibilityHint}
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.createBtnText}>{secondaryAction.label}</Text>
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
  const coverThumbSize = 96;
  const coverThumbHeight = 120;
  const coverPreviewWidth = 160;
  const coverPreviewHeight = 200;
  const [coverPageIndex, setCoverPageIndex] = useState(0);
  const coverPage = document.pages[coverPageIndex] ?? document.pages[0];
  const [captionError, setCaptionError] = useState('');
  const [captionBlurred, setCaptionBlurred] = useState(false);

  const audienceOptions = [
    { key: 'public' as const, label: 'Public' },
    { key: 'private' as const, label: 'Private' },
  ];

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
    setTimeout(() => {
      if (document.metadata.caption.trim().length === 0 && document.type === 'poster') {
        setCaptionError('Add a caption');
        haptic.warning();
      } else {
        setCaptionError('');
      }
    }, 0);
  }, [document.metadata.caption, document.type, haptic]);

  const handlePublishWithValidation = useCallback(() => {
    if (document.type === 'poster' && document.metadata.caption.trim().length === 0) {
      setCaptionBlurred(true);
      setCaptionError('Add a caption');
      haptic.warning();
      return;
    }
    setCaptionError('');
    if (coverPageIndex > 0 && document.pages.length > 1) {
      updateMetadata({ coverPageIndex });
    }
    onPublish();
  }, [document.type, document.metadata.caption, onPublish, haptic, coverPageIndex, document.pages.length, updateMetadata]);

  const handleSaveDraft = useCallback(async () => {
    haptic.light();
    await onSaveDraft();
  }, [haptic, onSaveDraft]);

  const publishDisabled = isOffline;

  return (
    <View style={styles.reviewBody}>
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Preview</Text>
        <Pressable
          onPress={onOpenPreview}
          disabled={!onOpenPreview}
          style={styles.coverPreview}
          accessibilityLabel="Preview composition"
          accessibilityHint="Opens the full-screen preview"
          accessibilityRole="button"
        >
          <CreatorCanvas
            document={document}
            page={coverPage}
            canvasWidth={coverPreviewWidth}
            canvasHeight={coverPreviewHeight}
            mode="preview"
          />
          {isMultiPage && (
            <View style={styles.pageCountBadge}>
              <Text style={styles.pageCountText}>{document.pages.length}</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.sectionLabel}>Caption</Text>
        <TextInput
          style={styles.captionInput}
          placeholder="Write a caption…"
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
        {captionError !== '' && (
          <Reanimated.View style={[styles.captionErrorWrap, captionErrorStyle]}>
            <Ionicons name="alert-circle-outline" size={IconGrammar.metadata} color={colors.danger} aria-hidden={true} />
            <Text style={styles.captionErrorText}>{captionError}</Text>
          </Reanimated.View>
        )}

        <Text style={styles.sectionLabel}>Audience</Text>
        <View style={styles.audienceSegment} accessibilityRole="radiogroup" accessibilityLabel="Audience visibility">
          {audienceOptions.map((opt) => {
            const isActive = document.metadata.visibility === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => { haptic.light(); updateMetadata({ visibility: opt.key }); }}
                style={[styles.audienceSegmentBtn, isActive && styles.audienceSegmentBtnActive]}
                accessibilityLabel={`Audience ${opt.label}`}
                accessibilityHint={`Sets visibility to ${opt.label}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
              >
                {isActive && (
                  <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.textInverse} aria-hidden={true} />
                )}
                <Text style={[styles.audienceSegmentText, isActive && styles.audienceSegmentTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {document.type === 'poster' && (
          <View style={styles.interactionRow}>
            <Pressable
              onPress={() => { haptic.selection(); updateMetadata({ allowReplies: !document.metadata.allowReplies }); }}
              style={[styles.interactionPill, document.metadata.allowReplies && styles.interactionPillActive]}
              accessibilityLabel="Allow replies"
              accessibilityHint="Toggles whether viewers can reply to this poster"
              accessibilityRole="switch"
              accessibilityState={{ checked: document.metadata.allowReplies }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons name={document.metadata.allowReplies ? 'chatbubble' : 'chatbubble-outline'} size={IconGrammar.metadata} color={document.metadata.allowReplies ? colors.textInverse : colors.textSecondary} aria-hidden={true} />
              <Text style={[styles.interactionPillText, document.metadata.allowReplies && styles.interactionPillTextActive]}>Replies</Text>
            </Pressable>
            <Pressable
              onPress={() => { haptic.selection(); updateMetadata({ allowReactions: !document.metadata.allowReactions }); }}
              style={[styles.interactionPill, document.metadata.allowReactions && styles.interactionPillActive]}
              accessibilityLabel="Allow reactions"
              accessibilityHint="Toggles whether viewers can react to this poster"
              accessibilityRole="switch"
              accessibilityState={{ checked: document.metadata.allowReactions }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons name={document.metadata.allowReactions ? 'heart' : 'heart-outline'} size={IconGrammar.metadata} color={document.metadata.allowReactions ? colors.textInverse : colors.textSecondary} aria-hidden={true} />
              <Text style={[styles.interactionPillText, document.metadata.allowReactions && styles.interactionPillTextActive]}>Reactions</Text>
            </Pressable>
          </View>
        )}

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

        {isOffline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={IconGrammar.metadata} color={colors.warning} aria-hidden={true} />
            <Text style={styles.offlineBannerText}>
              Offline — save as draft
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.stickyFooter}>
        <PressScale
          onPress={handlePublishWithValidation}
          disabled={publishDisabled}
          style={[styles.publishBtn, publishDisabled ? styles.publishBtnDisabled : {}]}
          accessibilityLabel="Share"
          accessibilityHint="Shares the content immediately"
          accessibilityState={{ disabled: publishDisabled }}
          scale={0.97}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.publishBtnText}>Share</Text>
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
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm },
    scrollBody: {
      paddingHorizontal: Space.md },
    scrollContent: {
      paddingBottom: Space.xl,
      gap: Space.sm },
    sectionLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      letterSpacing: 0.2,
      marginTop: Space.xs,
      textTransform: 'uppercase' },
    captionInput: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary,
      minHeight: 80,
      textAlignVertical: 'top',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.hairline,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surfaceAlt },
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
    audienceSegment: {
      flexDirection: 'row',
      alignSelf: 'center',
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      padding: 2 },
    audienceSegmentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      justifyContent: 'center' },
    audienceSegmentBtnActive: {
      backgroundColor: colors.brand },
    audienceSegmentText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    audienceSegmentTextActive: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold },
    interactionRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingVertical: Space.xs },
    interactionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border },
    interactionPillActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand },
    interactionPillText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary },
    interactionPillTextActive: {
      color: colors.textInverse },
    // ── Cover selection ──
    coverScroll: {
      marginHorizontal: -Space.md },
    coverContainer: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
      paddingBottom: Space.xs },
    coverThumbWrap: {
      borderRadius: Radius.md,
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
    draftBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: 44,
      borderRadius: Radius.full },
    draftBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    publishBtn: {
      width: '100%',
      height: 50,
      borderRadius: Radius.full,
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
    // ── Upload progress state ──
    progressState: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xl,
      gap: Space.sm },
    progressLabel: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      color: colors.textPrimary },
    progressBarTrack: {
      width: '100%',
      height: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden' },
    progressBarFill: {
      height: '100%',
      borderRadius: Radius.full,
      backgroundColor: colors.brand },
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
    errorTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      color: colors.textPrimary },
    errorDetail: {
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: Space.md },
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
      justifyContent: 'center',
      width: '100%',
      height: 50,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      marginTop: Space.sm },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    saveDraftLink: {
      paddingVertical: Space.sm,
      marginTop: Space.xs,
      alignItems: 'center',
      justifyContent: 'center' },
    saveDraftLinkText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary },
    // ── Success state ──
    successCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.successSubtle,
      justifyContent: 'center',
      alignItems: 'center' },
    successTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      color: colors.textPrimary },
    doneBtn: {
      width: '100%',
      height: 52,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.md },
    doneBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    viewLink: {
      marginTop: Space.sm,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
    },
    viewLinkText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.brand,
    },
    successBtnGroup: {
      width: '100%',
      gap: Space.sm,
      marginTop: Space.md },
    viewBtn: {
      width: '100%',
      height: 50,
      borderRadius: Radius.full,
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
      borderRadius: Radius.full,
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
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    scheduleFailedViewText: {
      color: colors.textSecondary,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    reviewBody: {
      flex: 1 },
    coverPreview: {
      alignSelf: 'center',
      width: 160,
      height: 200,
      borderRadius: Radius.md,
      overflow: 'hidden' },
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
    stickyFooter: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: Space.xs } });
}
