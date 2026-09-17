// ── Publish workflow shared module ─────────────────────────────────
// Pure helpers + shared types for the publish sheet workflow.
// Extracted verbatim from useCreatorPublishWorkflow.ts — no behavior
// changes. The publish-command contract, local-URI scanning, error
// humanisation, attempt-ID generation, and cache invalidation all live
// here so the workflow hook and its sub-hooks share one source of truth.
import type { PublishCommand, ExpectedMediaEntry } from '../../services/creatorPublicationsApi';
import type { CreatorDocumentSaveResult } from '../../services/creatorDocumentsApi';
import type { UploadJob } from '../core/upload';
import type { CreatorDocument, CreatorLayer } from '../core/projectStore/composition';
import {
  serialiseToLookPayload,
  serialiseToPosterPayload } from '../core/projectStore/compositionContract';
import { walkMediaReferences, isLocalUri as isLocalUriWalker, CANVAS_LAYER_ID } from '../core/projectStore/mediaReferenceWalker';
import { queryClient, queryKeys } from '../../platform/server';
import { CreatorDraftService } from '../core/projectStore/drafts';

/**
 * Discriminated union for the publish sheet's finite state machine.
 * Each tag carries exactly the data it needs — impossible states (e.g.
 * "success" without a publishedId, "error" without a message) are
 * unrepresentable at the type level.
 */
export type PublishState =
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

export const REVIEW_STATE: PublishState = { tag: 'review' };

export interface CreatorPublishSheetProps {
  visible: boolean;
  onClose: () => void;
  editingLookId?: string;
  /** Opens the full-screen CreatorPreviewOverlay from the host screen. */
  onOpenPreview?: () => void;
}

// ── Feature flag ───────────────────────────────────────────────────
// When true, uploads flow through the durable UploadManager (resumable,
// persisted, auto-retry). When false, falls back to the sequential
// foreground `mediaUploadPipeline`.
export const USE_UPLOAD_MANAGER = true;

// ── Local URI scanning (mirrors mediaUploadPipeline for UploadManager path) ──
// Derived from walkMediaReferences so the upload gate can never drift from
// the coverage contract — any media-bearing field the server walks is
// uploaded here.

export interface LocalMediaRef {
  layerId: string;
  field: string;
  currentUri: string;
  /** Asset type hint for MIME detection: "image" or "video". */
  assetType: string;
}

export function scanDocumentForLocalUris(doc: CreatorDocument): LocalMediaRef[] {
  return walkMediaReferences(doc)
    .filter((ref) => ref.uri !== '' && isLocalUriWalker(ref.uri))
    .map((ref) => ({
      layerId: ref.layerId,
      field: ref.field,
      currentUri: ref.uri,
      assetType: ref.mediaType,
    }));
}

/**
 * Heuristic for choosing the async publish transport: documents whose
 * publication requires a server-side media render (any video layer, or a
 * multi-page poster where frames render in sequence) block the sync
 * publish request for tens of seconds. Those go through the immediate
 * schedule row + worker path so the request returns instantly and the
 * client polls for the terminal state — the Instagram "posting"
 * contract. Trivial single-image docs stay on the sync fast path.
 * This only selects the transport; the server's own classifier still
 * decides whether a render is actually needed.
 */
export function documentMayRequireRender(doc: CreatorDocument): boolean {
  if (doc.pages.length > 1) return true;
  for (const page of doc.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media' && layer.payload.mediaType === 'video') {
        return true;
      }
    }
  }
  return false;
}

export function replaceUriInDoc(
  doc: CreatorDocument,
  layerId: string,
  field: string,
  newUri: string,
  receipt?: Pick<UploadJob, 'finalizationId' | 'mediaAssetId'>,
): CreatorDocument {
  if (layerId === CANVAS_LAYER_ID && field === 'backgroundValue') {
    return {
      ...doc,
      canvas: {
        ...doc.canvas,
        background: {
          ...doc.canvas.background,
          value: newUri,
          mediaFinalizationId: receipt?.finalizationId,
          mediaAssetId: receipt?.mediaAssetId,
        },
      },
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer): CreatorLayer => {
        if (layer.id !== layerId) return layer;
        if (field === 'maskRef') {
          return {
            ...layer,
            maskRef: newUri,
            maskFinalizationId: receipt?.finalizationId,
            maskMediaAssetId: receipt?.mediaAssetId };
        }
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

export function isNetworkError(error: string | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes('network') || lower.includes('fetch') || lower.includes('abort') || lower.includes('timeout') || lower.includes('connection') || lower.includes('offline');
}

/**
 * Map a raw upload error string to a short, human-friendly message.
 * Raw errors from the upload pipeline (XHR status codes, abort reasons,
 * network stack messages) are not useful to surface verbatim — they read
 * as developer diagnostics. This translates the common failure modes
 * into plain language a user can act on.
 */
export function humanizeUploadError(error: string | undefined): string {
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
export function generatePublicationAttemptId(): string {
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
export function invalidateCachesAfterPublish(documentId: string, creatorId: string | null): void {
  // React Query — profile and discovery
  if (creatorId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.user.looks(creatorId) }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(creatorId) }).catch(() => {});
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.discover.feed }).catch(() => {});

  // Local draft — the document is now published, remove it from drafts
  void CreatorDraftService.deleteDraft(documentId);
}

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
export function buildPublishCommand(
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
