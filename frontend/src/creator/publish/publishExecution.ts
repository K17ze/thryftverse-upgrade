// ── Publish execution steps ────────────────────────────────────────
// The heavy async steps of the publish pipeline, extracted verbatim
// from useCreatorPublishWorkflow.ts's handlePublish:
//   uploadLocalMediaForPublish — queue + await local media uploads
//   saveWorkingDocumentToServer — canonical document save (404 self-heal)
//   mapPublishErrorToState — publish-attempt error → sheet state mapping
// No behavior changes; the caller keeps the same sequencing and the
// scheduleAttemptId local-variable contract.
import type { MutableRefObject } from 'react';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import {
  PublishAsyncFailedError,
  PublishAsyncTimeoutError } from '../../services/creatorPublicationsApi';
import {
  createCreatorDocument,
  updateCreatorDocument,
  fetchCreatorDocument,
  computeDocumentHash } from '../../services/creatorDocumentsApi';
import type { CreatorDocumentSaveResult } from '../../services/creatorDocumentsApi';
import { ApiRequestError } from '../../lib/apiClient';
import { updatePublicationAttemptState } from './publicationAttemptStore';
import { CreatorAnalytics } from '../shared/creatorAnalytics';
import { uploadAllLocalMedia } from '../core/upload/mediaUploadPipeline';
import { detectMimeType } from '../core/upload';
import type { UseUploadManagerResult } from '../core/upload/useUploadManager';
import type { CreatorDocument } from '../core/projectStore/composition';
import type { useMotionConfig } from '../../hooks/useMotionConfig';
import {
  REVIEW_STATE,
  USE_UPLOAD_MANAGER,
  scanDocumentForLocalUris,
  replaceUriInDoc,
  isNetworkError,
  humanizeUploadError,
  type PublishState } from './publishWorkflowShared';

export interface UploadLocalMediaParams {
  document: CreatorDocument;
  uploadManager: UseUploadManagerResult;
  signal: AbortSignal;
  progressWidth: SharedValue<number>;
  reduceMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  setPublishState: (state: PublishState) => void;
}

/**
 * Upload every local media URI in the document and return the document
 * with remote URLs substituted in. Returns null when the wait was
 * aborted — the caller's cancel path already reset the sheet, so it
 * must bail without throwing.
 */
export async function uploadLocalMediaForPublish({
  document,
  uploadManager,
  signal,
  progressWidth,
  reduceMotion,
  spring,
  setPublishState }: UploadLocalMediaParams): Promise<CreatorDocument | null> {
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
    // reflected via uploadManager.progress (0–1). The wait is
    // bounded by the publish abort controller — without it a
    // connectivity drop re-queues in-flight jobs and the wait
    // never settles, pinning the sheet in 'uploading' forever.
    const finalJobs = await uploadManager.waitForCompletion({
      signal,
    });

    // An aborted wait resolves with whatever jobs existed — the
    // cancel path already reset the sheet; bail without throwing.
    if (signal.aborted) {
      return null;
    }

    // Check for failures
    const failedJobs = finalJobs.filter((j) => j.status === 'failed');
    if (failedJobs.length > 0) {
      throw new Error(
        humanizeUploadError(failedJobs[0].error),
      );
    }

    // A wait that resolved without failures but with unsettled
    // jobs (paused mid-publish, or parked offline) must not slip
    // through — the doc still holds local URIs the server cannot
    // read, and proceeding would publish a broken projection.
    const unsettled = finalJobs.filter((j) => j.status !== 'completed');
    if (unsettled.length > 0) {
      throw new Error(
        unsettled.some((j) => j.status === 'paused')
          ? 'An upload was paused. Resume it and try publishing again.'
          : 'Uploads did not finish. Check your connection and try again.',
      );
    }

    // Replace local URIs in the document with remote URLs
    let workingDoc = document;
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
    return workingDoc;
  }

  // ── Legacy foreground pipeline path ──
  return uploadAllLocalMedia(document, (progress) => {
    if (progress.total > 0) {
      const fraction = (progress.completed + 1) / progress.total;
      // Map upload fraction into the 0.3–0.7 range
      const mappedFraction = 0.3 + fraction * 0.4;
      progressWidth.value = reduceMotion ? mappedFraction : withSpring(mappedFraction, spring.entrance);
    }
  });
}

/**
 * Save the canonical document to the server before publishing.
 * The publication orchestrator reads document_json from the
 * creator_documents row to build the public projection. If the row
 * is missing or stale, the published content diverges from what the
 * creator authored. This step ensures the server has the exact
 * document we are about to publish.
 *
 * Self-heals on 404 (the server row was deleted since the last save —
 * re-create instead of dead-ending) and on 428 (If-Match required —
 * the document already exists server-side, so fetch its lock version
 * and update from there). Throws CreatorDocumentConflictError on a
 * real conflict so the caller can surface the conflict UI.
 */
export async function saveWorkingDocumentToServer(
  workingDoc: CreatorDocument,
  serverDocMetaRef: MutableRefObject<CreatorDocumentSaveResult | null>,
): Promise<void> {
  const currentHash = await computeDocumentHash(workingDoc);
  const existingMeta = serverDocMetaRef.current;
  if (!existingMeta || existingMeta.documentHash !== currentHash) {
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
      try {
        saveResult = await updateCreatorDocument({
          documentId: workingDoc.id,
          documentJson: workingDoc,
          expectedLockVersion: existingMeta.lockVersion,
        });
      } catch (updateErr) {
        // 404 = the server row was deleted since the last save.
        // Re-create the document instead of dead-ending — every
        // subsequent update would 404 forever.
        if (updateErr instanceof ApiRequestError && updateErr.status === 404) {
          serverDocMetaRef.current = null;
          saveResult = await createCreatorDocument({
            documentType: workingDoc.type,
            documentJson: workingDoc,
          });
        } else {
          throw updateErr;
        }
      }
    }
    serverDocMetaRef.current = saveResult;
  }
}

export interface PublishErrorContext {
  document: CreatorDocument;
  abortController: AbortController;
  /** True once a publish/schedule request has actually been sent — a
   *  dropped response after this point is an unknown outcome, never a
   *  definitive failure. */
  publicationRequestStarted: boolean;
  /** True when this publish went through the async (immediate-schedule)
   *  path — routes unknown-outcome reconciliation to the schedule lookup
   *  rather than the publication lookup. */
  usedAsyncPublish: boolean;
  /** This attempt's publish idempotency key. */
  attemptId: string;
  /** This attempt's schedule idempotency key — the LOCAL variable
   *  captured at send time (not the stale-closure state), so failure
   *  bookkeeping always records the current attempt's ID. */
  schedAttemptId: string;
  setPublishState: (state: PublishState) => void;
  serverDocMetaRef: MutableRefObject<CreatorDocumentSaveResult | null>;
}

/**
 * Map a publish-attempt error to the sheet's finite state and update
 * the persisted attempt record. Extracted verbatim from the
 * handlePublish catch block — ordering and conditions are unchanged:
 * abort → review, 409 document conflict → conflict UI, async-failed →
 * error, async-timeout → scheduleUnknown, network-after-send →
 * unknown/scheduleUnknown, everything else → retriable error.
 */
export function mapPublishErrorToState(err: unknown, ctx: PublishErrorContext): void {
  const {
    document,
    abortController,
    publicationRequestStarted,
    usedAsyncPublish,
    attemptId,
    schedAttemptId,
    setPublishState,
    serverDocMetaRef } = ctx;

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

  // Async publish terminal failure — the worker reported the
  // publication failed. Surface the server's reason; a retry creates
  // a fresh immediate schedule (the schedule endpoint cancels any
  // superseded pending row, so this can't double-publish).
  if (err instanceof PublishAsyncFailedError) {
    setPublishState({
      tag: 'error',
      message: err.failureReason ?? 'The post could not be published.',
      canRetry: true,
      canSaveDraft: true,
    });
    if (publicationRequestStarted && attemptId) {
      void updatePublicationAttemptState(attemptId, {
        state: 'failed',
        failureCode: 'PUBLISH_FAILED',
        lastCheckedAt: new Date().toISOString(),
      });
    }
    CreatorAnalytics.publishError(document.type, err.failureReason ?? 'publish_failed');
    return;
  }

  // Async publish timeout — the schedule row exists on the server and
  // may still complete. This is an unknown outcome, not a failure:
  // surface the schedule-check reconciliation and let the server's
  // push notification cover late completion.
  if (err instanceof PublishAsyncTimeoutError) {
    setPublishState({
      tag: 'scheduleUnknown',
      detail: 'Still processing on the server — check the result in a moment.',
    });
    CreatorAnalytics.publishUnknown(document.type);
    return;
  }

  const errorMessage = err instanceof Error ? err.message : 'Publishing failed';
  // Once a write has left the device, a dropped response is ambiguous:
  // the backend may have committed it. Never call that failure or success.
  const isUnknown = publicationRequestStarted && isNetworkError(errorMessage);
  // Distinguish schedule unknown from publish unknown so the UI
  // offers the correct reconciliation action ("Check schedule" vs
  // "Check publish result") and analytics can separate the two.
  // The async publish-now path reconciles through the schedule
  // endpoint (its attempt is stored with commandType 'schedule').
  const isSchedule = !!document.metadata.scheduledFor || usedAsyncPublish;
  if (isUnknown) {
    setPublishState({ tag: isSchedule ? 'scheduleUnknown' : 'unknown', detail: errorMessage });
  } else {
    setPublishState({ tag: 'error', message: errorMessage, canRetry: true, canSaveDraft: true });
  }
  // Update the persisted attempt: definitive failure → 'failed',
  // network error → leave as 'sending' (becomes 'unknown' after
  // the threshold in reconcilePublicationAttempts).
  if (publicationRequestStarted) {
    // Async publish-now persists its attempt under `attemptId` (with
    // commandType 'schedule') — schedAttemptId is only populated on
    // the scheduled-for path. Fall back so failures are recorded.
    const failedAttemptId = isSchedule ? (schedAttemptId || attemptId) : attemptId;
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
