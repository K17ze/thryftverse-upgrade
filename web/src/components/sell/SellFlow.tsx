'use client';

/**
 * SellFlow — orchestrator for the guided listing flow.
 * One flat draft, one validation pass, flat sections: Photos → Details →
 * Price → Postage → Review. Review hands off to the preview surface —
 * the draft rendered as buyers will see it — and publish commits there.
 * Publish resolves to the success view.
 *
 * Mobile-parity layers on top of the guided flow:
 *  - drafts auto-save to localStorage (debounced) and are offered back via
 *    a Resume banner; "Save draft & exit" flushes immediately. Autosaves
 *    also upsert the seller-hub draft shelf, so composer drafts resume
 *    from /seller-hub/listings and vice versa
 *  - ?edit=<listingId> hydrates an own-listing into the same flow and
 *    publishes through updateListing instead of recordListing
 *  - ?draft=<draftId> hydrates a shelf draft (MY_DRAFT_LISTINGS) or an
 *    imported catalog draft into the composer; publish retires the draft
 *    from whichever store owns it
 *  - guests can compose but can't list — preview/publish raise the
 *    SignupWall's create_listing gate
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Listing, ListingCondition, ListingMediaRecord } from '@/lib/contracts/domain';
import { CURRENT_USER, MY_LISTINGS } from '@/lib/data/fixtures';
import { recordListing, updateListing } from '@/lib/data/fixtures-commerce';
import { removeSellerDraft, sellerDraftById, upsertSellerDraft } from '@/lib/data/fixtures-seller';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as listingsService from '@/lib/api/services/listings';
import * as listingIntelligenceService from '@/lib/api/services/listingIntelligence';
import * as uploadsService from '@/lib/api/services/uploads';
import {
  captureVideoPoster,
  isLocalMediaUri,
  probeImageDimensions,
} from '@/lib/utils/media';
import { useMyListings } from '@/lib/hooks/queries';
import { useTaxonomy } from '@/lib/hooks/sell/useTaxonomy';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import {
  draftRecordToListing,
  livePhotosOnly,
  useSellDraftPersistence,
  type PersistedSellDraft,
} from '@/lib/hooks/sell/useSellDraftPersistence';
import {
  useImportDraftActions,
  useImportDrafts,
} from '@/components/catalogimport/useImportDrafts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  draftFromListing,
  DESCRIPTION_MIN,
  EMPTY_DRAFT,
  isSizeRequiredCategory,
  MAX_PHOTOS,
  parsePriceInput,
  type SellDraft,
  type SellErrors,
} from './constants';
import { SellProgress, type SellStep } from './SellProgress';
import {
  PhotosSection,
  type AutoFillControl,
  type PhotoMediaState,
} from './PhotosSection';
import {
  SIZE_OPTIONS,
  canonicalCategoryId,
  categoryNodeName,
  conditionAllowedFor,
} from './taxonomy';
import { isCameraCaptureSupported } from '@/lib/media/cameraSupport';
import { DetailsSection } from './DetailsSection';
import { PriceSection } from './PriceSection';
import { PostageSection } from './PostageSection';
import { ReviewSection } from './ReviewSection';
import { SellPreview } from './SellPreview';
import { SellPreviewCard } from './SellPreviewCard';
import { SellSuccess } from './SellSuccess';
import { DraftResumeBanner } from './DraftResumeBanner';
import { EditListingPicker } from './EditListingPicker';

// Media studio surfaces — camera capture and the per-photo editor are
// action-gated (each renders only behind its open flag), so their chunks
// fetch on first use instead of riding the sell flow's entry bundle.
const CameraSheet = dynamic(
  () => import('@/components/media/CameraSheet').then((m) => m.CameraSheet),
  { ssr: false },
);
const PhotoEditSheet = dynamic(
  () => import('@/components/media/PhotoEditSheet').then((m) => m.PhotoEditSheet),
  { ssr: false },
);

/** Error key → the field to focus when validation fails. Order is the
 *  composer order so the first blocker scrolls first. */
const ERROR_FIELD_IDS: Record<string, string> = {
  photos: 'sell-photos',
  title: 'sell-field-title',
  category: 'sell-field-category',
  condition: 'sell-field-condition',
  size: 'sell-field-size',
  description: 'sell-field-description',
  price: 'sell-field-price',
  originalPrice: 'sell-field-original-price',
};

/**
 * Backend condition candidates → the composer's canonical conditions.
 * 'New' is deliberately unmapped — the notes evidence behind it
 * ("never worn", nwot) cannot attest to attached tags, and selecting
 * 'New with tags' would overstate the item. Mapping down never does.
 */
const CONDITION_CANDIDATE_MAP: Record<string, ListingCondition> = {
  'like new': 'Very good',
  'very good': 'Very good',
  good: 'Good',
  fair: 'Satisfactory',
};

/** Last path segment of a remote media URL — the filename evidence for
 *  edit-mode media that has no picked File behind it. blob:/data: refs
 *  carry no filename, so they return undefined honestly. */
function remoteFileName(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    const last = decodeURIComponent(
      parsed.pathname.split('/').filter(Boolean).pop() ?? '',
    );
    return last.includes('.') ? last : undefined;
  } catch {
    return undefined;
  }
}

export function SellFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const draftParam = searchParams.get('draft');
  const { user, sessionLoading } = useSession();
  const seller = user ?? CURRENT_USER;
  const { requireAuth, wall } = useSignupWall();
  // Canonical vocabulary for the autofill mapping — the seed until the
  // live taxonomy resolves (same source the Details pickers read).
  const { taxonomy } = useTaxonomy();
  const importDrafts = useImportDrafts();
  const { updateDraft: updateImportDraft, removeDraft: removeImportDraft } =
    useImportDraftActions();
  const myListings = useMyListings();

  /** Live edit target — resolves through GET /listings/:id so a real
   *  backend listing hydrates the composer (the fixture shelf only knows
   *  the demo closet). */
  const editQuery = useQuery({
    queryKey: ['sell-edit-listing', editId],
    queryFn: ({ signal }) => listingsService.fetchListingById(editId ?? '', signal),
    enabled: DATA_MODE === 'live' && Boolean(editId),
  });
  const liveEditing = useMemo(() => {
    const listing = editQuery.data;
    if (!listing) return null;
    // Only the seller's own listings are editable, and terminal rows
    // (sold/deleted) never re-enter the composer.
    const terminal =
      listing.status === 'sold' ||
      listing.status === 'deleted' ||
      listing.status === 'removed' ||
      listing.isSold === true;
    if (terminal) return null;
    return user && listing.sellerId === user.id ? listing : null;
  }, [editQuery.data, user]);

  // Only the seller's own listings are editable — fixture mode reads the
  // own-closet slice; live mode resolves the row against the backend.
  const editing = useMemo(() => {
    if (!editId) return null;
    if (DATA_MODE === 'live') return liveEditing;
    return (
      MY_LISTINGS.find((l) => l.id === editId && !l.isSold && l.status !== 'sold') ?? null
    );
  }, [editId, liveEditing]);
  // While the live fetch (or the session the ownership check needs) is in
  // flight, show the loading posture — never a premature not-found.
  const editLoading = Boolean(
    editId && DATA_MODE === 'live' && (editQuery.isLoading || sessionLoading),
  );
  const editNotFound = Boolean(editId && !editing && !editLoading);

  /**
   * ?draft=<id> — resume a draft from whichever store owns it: the hub
   * shelf (MY_DRAFT_LISTINGS) first, then the session import store. Both
   * are the same Listing shape; publish retires the record from its
   * source rather than leaving a ghost draft behind.
   */
  const draftListing = useMemo(() => {
    if (!draftParam || editId) return null;
    return (
      sellerDraftById(draftParam) ??
      (importDrafts.data ?? []).find((d) => d.id === draftParam) ??
      null
    );
  }, [draftParam, editId, importDrafts.data]);
  const draftLoading = Boolean(draftParam && !draftListing && importDrafts.isLoading);
  const draftNotFound = Boolean(draftParam && !draftListing && !importDrafts.isLoading);

  // The edit picker — the seller's real inventory in live mode; a failed
  // or pending read renders empty (the picker self-hides) rather than
  // fixture rows. Fixture mode keeps MY_LISTINGS for the demo surface.
  const ownListings = useMemo(
    () =>
      (DATA_MODE === 'live' ? (myListings.data ?? []) : (myListings.data ?? MY_LISTINGS)).filter(
        (l) => !l.isSold && l.status !== 'sold' && l.status !== 'deleted',
      ),
    [myListings.data],
  );

  const [draft, setDraft] = useState<SellDraft>(() =>
    editing ? draftFromListing(editing) : EMPTY_DRAFT,
  );
  const [errors, setErrors] = useState<SellErrors>({});
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  /** The backend's real publish failure — surfaced on the preview surface. */
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedListing, setPublishedListing] = useState<Listing | null>(null);
  /** The shelf/import draft this composer is bound to (?draft= or a
   *  resumed record). Null for free-standing composer drafts — the
   *  persistence hook mints a shelf id on first save. */
  const [draftSourceId, setDraftSourceId] = useState<string | null>(null);
  /** Photos lost on resume — blob: refs that didn't survive a reload. */
  const [lostPhotos, setLostPhotos] = useState(0);
  /** Assisted-autofill lifecycle — the PhotosSection affordance reads it;
   *  idle until the seller explicitly runs a pass. */
  const [autoFill, setAutoFill] = useState<
    Omit<AutoFillControl, 'onRun' | 'onDismiss'>
  >({ phase: 'idle' });

  // Object URLs are preview-only — revoke on removal and on unmount, unless
  // they've been committed to the published listing (which still renders them).
  const photosRef = useRef<string[]>([]);
  const committedRef = useRef(new Set<string>());
  photosRef.current = draft.photos;
  useEffect(
    () => () => {
      photosRef.current.forEach((url) => {
        if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
      });
    },
    [],
  );

  /* ── Media studio state ────────────────────────────────────────────────
   * Per-photo live-upload records keyed by the staged blob: URL. Photos
   * upload when they're staged (mobile's queue-on-stage model) so the
   * strip shows real progress; publish awaits whatever is still in flight.
   * Fixture mode never touches the network — entries stay absent and the
   * strip renders plain tiles. */
  /** A staged URI fully resolved for the publish contract — verified
   *  upload receipt for fresh media, pass-through for rows already
   *  attached to the listing under edit. */
  interface ResolvedMedia {
    sourceUrl: string;
    /** The verified object URL — the same publicUrl finalize returned. */
    publicUrl: string;
    /** Finalization receipt id — required by create cover + attach. */
    finalizationId?: string;
    kind: 'image' | 'video';
    width?: number | null;
    height?: number | null;
    blurhash?: string | null;
    /** Uploaded poster still for video media. */
    posterUrl?: string | null;
    /** True when the URI is a media row already attached to the listing
     *  being edited — publish must not re-upload or re-attach it. */
    alreadyAttached?: boolean;
  }

  interface PhotoMediaEntry extends PhotoMediaState {
    publicUrl?: string;
    finalizationId?: string;
    /** Media already attached to the listing under edit — never re-uploaded. */
    existingRemote?: boolean;
    /** The picked file's real name — the primary evidence input for the
     *  listing-intelligence run (the heuristic reads filenames, not pixels). */
    fileName?: string;
    /** The fully resolved publish record once the upload lands. */
    resolved?: ResolvedMedia;
    /** In-flight upload — publish dedupes onto it rather than re-PUTting. */
    promise?: Promise<ResolvedMedia>;
    /** The backend's real failure text — the tile retry affordance and
     *  publish error surface read it, never a paraphrase. */
    failure?: string;
  }
  const [mediaByUrl, setMediaByUrl] = useState<Record<string, PhotoMediaEntry>>({});
  // Mirror for async readers (publish runs outside render scope).
  const mediaRef = useRef<Record<string, PhotoMediaEntry>>({});
  const updateMedia = useCallback((url: string, patch: Partial<PhotoMediaEntry> | null) => {
    const next = { ...mediaRef.current };
    if (patch == null) delete next[url];
    else next[url] = { ...(next[url] as PhotoMediaEntry | undefined), ...patch } as PhotoMediaEntry;
    mediaRef.current = next;
    setMediaByUrl(next);
  }, []);
  /** Staged-media lookup the preview surfaces read (kind + poster). */
  const mediaOf = useCallback(
    (src: string) => mediaRef.current[src],
    [],
  );

  /** The listing id minted for this publish attempt — stable across
   *  retries so a replayed create is a byte-identical idempotent upsert,
   *  never a duplicate listing. Re-armed on every fresh compose. */
  const publishIdRef = useRef<string | null>(null);

  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Feature-detected — the capture entry never renders where the browser
  // can't do it (non-secure context, no MediaDevices API).
  const hydrated = useHydrated();
  const cameraSupported = hydrated && isCameraCaptureSupported();

  /**
   * Resolve one staged URI for publish:
   *  - media already attached to the listing under edit passes through
   *    untouched (re-uploading it would mint a second asset),
   *  - fixture mode resolves the local URI as-is,
   *  - everything else (blob:/data: picks, imported remote stills) fetches
   *    the bytes and runs the verified presign→PUT→finalize pipeline.
   *
   * Dedupes onto the resolved record / in-flight promise already recorded
   * for the URL — staging, retry and publish all funnel through here.
   */
  const ensureMediaUpload = useCallback(
    (url: string): Promise<ResolvedMedia> => {
      const existing = mediaRef.current[url];
      if (existing?.resolved) return Promise.resolve(existing.resolved);
      if (existing?.promise) return existing.promise;
      // Remote URI already attached to the listing under edit — the row
      // stays, it just contributes ordering.
      if (!isLocalMediaUri(url) && existing?.existingRemote) {
        const resolved: ResolvedMedia = {
          sourceUrl: url,
          publicUrl: url,
          kind: existing.kind ?? 'image',
          posterUrl: existing.poster ?? null,
          alreadyAttached: true,
        };
        updateMedia(url, { resolved });
        return Promise.resolve(resolved);
      }
      if (DATA_MODE !== 'live') {
        const resolved: ResolvedMedia = {
          sourceUrl: url,
          publicUrl: url,
          kind: existing?.kind ?? 'image',
          posterUrl: existing?.poster ?? null,
        };
        return Promise.resolve(resolved);
      }
      const promise = (async (): Promise<ResolvedMedia> => {
        const blob = await (await fetch(url)).blob();
        const contentType = blob.type || 'image/jpeg';
        const kind: 'image' | 'video' = contentType.startsWith('video/')
          ? 'video'
          : 'image';
        const ext =
          contentType === 'image/png'
            ? 'png'
            : contentType === 'image/webp'
              ? 'webp'
              : kind === 'video'
                ? (contentType.split('/')[1] ?? 'mp4')
                : 'jpg';
        const file = new File([blob], `listing-media.${ext}`, { type: contentType });
        const uploaded = await uploadsService.uploadMediaFile(file, 'listing', (ratio) => {
          updateMedia(url, { status: 'uploading', progress: ratio });
        });
        // Verified receipt — the finalize response may already carry
        // pipeline dims/blurhash; the probe backfills what it doesn't.
        let width = uploaded.width ?? null;
        let height = uploaded.height ?? null;
        let posterUrl: string | null = null;
        if (kind === 'video') {
          const poster = await captureVideoPoster(blob);
          if (poster) {
            width = width ?? poster.width;
            height = height ?? poster.height;
            updateMedia(url, { poster: URL.createObjectURL(poster.blob) });
            try {
              const posterUpload = await uploadsService.uploadMediaFile(
                new File([poster.blob], 'listing-poster.jpg', { type: 'image/jpeg' }),
                'poster',
              );
              posterUrl = posterUpload.publicUrl;
            } catch {
              // Poster is a best-effort affordance — the media pipeline
              // generates one during processing; a failed still must not
              // sink the whole publish.
              posterUrl = null;
            }
          }
        } else if (width == null || height == null) {
          const dims = await probeImageDimensions(blob);
          width = width ?? dims?.width ?? null;
          height = height ?? dims?.height ?? null;
        }
        return {
          sourceUrl: url,
          publicUrl: uploaded.publicUrl,
          finalizationId: uploaded.finalizationId,
          kind,
          width,
          height,
          blurhash: uploaded.blurhash ?? null,
          posterUrl,
        };
      })();
      updateMedia(url, { status: 'uploading', progress: 0, promise });
      promise
        .then((resolved) =>
          updateMedia(url, {
            status: 'uploaded',
            progress: 1,
            publicUrl: resolved.publicUrl,
            finalizationId: resolved.finalizationId,
            kind: resolved.kind,
            resolved,
          }),
        )
        .catch((err) =>
          updateMedia(url, {
            status: 'failed',
            progress: null,
            promise: undefined,
            failure: parseApiError(err, 'Upload failed').message,
          }),
        );
      return promise;
    },
    [updateMedia],
  );

  /**
   * Draft-store reconciliation — every autosave writes the draft back to
   * the store it came from (import cache for imported drafts, the hub
   * shelf for everything else); clears and publishes remove it. This is
   * what makes drafts first-class across surfaces instead of a
   * localStorage orphan only /sell can see.
   */
  const syncDraftShelf = useCallback(
    (record: PersistedSellDraft | null, recordDraftId: string | null) => {
      if (!recordDraftId) return;
      // Shelf rows belong to a real seller — a guest's draft stays in
      // localStorage (still resumable in-session), never stamped with the
      // fixture 'me' identity.
      if (!user) return;
      if (!record) {
        removeSellerDraft(recordDraftId);
        removeImportDraft(recordDraftId);
        return;
      }
      const listing = draftRecordToListing(record, seller);
      if ((importDrafts.data ?? []).some((d) => d.id === recordDraftId)) {
        const patch: Partial<Listing> = { ...listing };
        // Never overwrite a real imported condition with the shelf
        // placeholder when the composer record hasn't picked one.
        if (!record.condition) delete patch.condition;
        updateImportDraft(recordDraftId, patch);
      } else {
        upsertSellerDraft(listing);
      }
    },
    [user, seller, importDrafts.data, updateImportDraft, removeImportDraft],
  );

  const {
    pendingDraft,
    draftSavedVisible,
    resumeDraft,
    discardDraft,
    flushDraft,
    clearPersistedDraft,
  } = useSellDraftPersistence({
    draft,
    editId: editing?.id ?? null,
    draftId: draftSourceId,
    dirty,
    onWriteRecord: syncDraftShelf,
  });

  /* Re-hydrate when the edit target changes on an already-mounted flow
   * (e.g. picking another row from the own-listings disclosure), and reset
   * when leaving edit mode entirely. */
  const hydratedEditIdRef = useRef<string | null>(editing?.id ?? null);
  useEffect(() => {
    const current = editing?.id ?? null;
    if (hydratedEditIdRef.current === current) return;
    hydratedEditIdRef.current = current;
    // Revoke uncommitted preview URLs before swapping the draft out.
    photosRef.current.forEach((url) => {
      if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
    });
    setDraft(editing ? draftFromListing(editing) : EMPTY_DRAFT);
    // Existing attached media is server-owned — mark it so publish never
    // re-uploads/re-attaches it and video slots render as video.
    editing?.media?.forEach((m: ListingMediaRecord) => {
      if (m.uri) {
        updateMedia(m.uri, {
          kind: m.kind === 'video' ? 'video' : 'image',
          poster: m.poster ?? null,
          existingRemote: true,
        });
      }
    });
    setErrors({});
    setDirty(false);
    setAutoFill({ phase: 'idle' });
    publishIdRef.current = null;
    window.scrollTo({ top: 0 });
  }, [editing, updateMedia]);

  /* Hydrate a ?draft=<id> target once it resolves — the hub shelf hits
   * synchronously, imported drafts arrive after the session-store tick.
   * Cleared/published drafts resolving to null intentionally do NOT reset
   * the composer (the publish path owns that handoff). */
  const hydratedDraftIdRef = useRef<string | null>(null);
  useEffect(() => {
    const current = draftListing?.id ?? null;
    if (hydratedDraftIdRef.current === current) return;
    hydratedDraftIdRef.current = current;
    if (!current || !draftListing) return;
    photosRef.current.forEach((url) => {
      if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
    });
    setDraft(draftFromListing(draftListing));
    setDraftSourceId(current);
    setErrors({});
    setDirty(false);
    setAutoFill({ phase: 'idle' });
    publishIdRef.current = null;
    window.scrollTo({ top: 0 });
  }, [draftListing]);

  const update = (patch: Partial<SellDraft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const clearError = (key: keyof SellErrors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const addPhotos = (files: File[] | null) => {
    if (!files?.length) return;
    const mediaFiles = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    );
    if (!mediaFiles.length) return;
    const room = Math.max(0, MAX_PHOTOS - draft.photos.length);
    // Overflow past the cap never stages — only `room` files get refs.
    const staged = mediaFiles.slice(0, room);
    const kept = staged.map((f) => URL.createObjectURL(f));
    if (!kept.length) return;
    // Stamp each slot's kind before it renders — kind drives the tile,
    // the cover rule and the attach contract's mediaType. The real file
    // name rides along: it's the evidence input for listing intelligence.
    kept.forEach((url, i) => {
      updateMedia(url, {
        kind: staged[i].type.startsWith('video/') ? 'video' : 'image',
        fileName: staged[i].name,
      });
    });
    update({ photos: [...draft.photos, ...kept] });
    // Live mode stages the upload immediately — real progress rings on the
    // tiles, publish just awaits them (mobile's queue-on-stage model).
    kept.forEach((url) => void ensureMediaUpload(url));
    clearError('photos');
  };

  const removePhoto = (index: number) => {
    const url = draft.photos[index];
    if (url) {
      URL.revokeObjectURL(url);
      updateMedia(url, null);
    }
    update({ photos: draft.photos.filter((_, i) => i !== index) });
    // No photos left → the affordance unmounts; reset so the next staged
    // set doesn't inherit a stale result line.
    if (draft.photos.length <= 1) setAutoFill({ phase: 'idle' });
  };

  /* ── Assisted autofill — POST /listing-intelligence/run ────────────────
   * Advisory candidates only (the same endpoint mobile's AI listing flow
   * consumes). They fill EMPTY fields — a value the seller typed is their
   * decision and is never overwritten — and the section reports exactly
   * what landed, what it was derived from, or that nothing readable was
   * found. The wire has no price/description/tag candidates and no
   * confidence scores; none are fabricated here. */
  const runAutoFill = async () => {
    // Account-bound endpoint (401 for guests) — the same wall publish uses.
    if (!requireAuth('create_listing')) return;
    if (autoFill.phase === 'running' || !draft.photos.length) return;
    setAutoFill({ phase: 'running' });
    try {
      const photos = draft.photos.slice(0, 20).map((url, i) => {
        const m = mediaRef.current[url];
        return {
          id: `photo_${i}`,
          // The verified upload URL when the staged upload has landed —
          // the still-in-flight local ref otherwise.
          url: m?.resolved?.publicUrl ?? m?.publicUrl ?? url,
          ...(m?.resolved?.width ? { width: m.resolved.width } : {}),
          ...(m?.resolved?.height ? { height: m.resolved.height } : {}),
        };
      });
      const cover = draft.photos[0];
      const filename =
        mediaRef.current[cover]?.fileName ?? remoteFileName(cover);
      const notes = draft.description.trim();
      const run = await listingIntelligenceService.runListingIntelligence({
        photos,
        filename: filename || undefined,
        sellerNotes: notes || undefined,
        categoryHint:
          categoryNodeName(taxonomy.categories, draft.category) ?? undefined,
        listingId: editing?.id,
      });

      const patch: Partial<SellDraft> = {};
      const applied: string[] = [];
      const errorKeys = new Set<keyof SellErrors>();
      const basisSources = new Set<string>();
      let suggested = 0;

      for (const c of run.candidates) {
        // Abstained means "no evidence found" — honest, never a failure.
        if (c.abstained) continue;
        const value = c.value?.trim();
        if (!value) continue;
        switch (c.field) {
          case 'title':
            suggested++;
            if (!draft.title.trim()) {
              patch.title = value.slice(0, 80);
              applied.push('title');
              errorKeys.add('title');
              basisSources.add(c.evidence.source);
            }
            break;
          case 'brand':
            suggested++;
            if (!draft.brand.trim()) {
              patch.brand = value.slice(0, 50);
              applied.push('brand');
              basisSources.add(c.evidence.source);
            }
            break;
          case 'category': {
            suggested++;
            if (draft.category) break;
            const canonical =
              canonicalCategoryId(value) ||
              taxonomy.categories.find(
                (n) =>
                  n.parentId === null &&
                  n.name.toLowerCase() === value.toLowerCase(),
              )?.id ||
              '';
            if (canonical) {
              // Same semantics as the picker: a new category retires the
              // leaf and size choices that belonged to the old one.
              patch.category = canonical;
              patch.subcategory = '';
              patch.size = '';
              applied.push('category');
              errorKeys.add('category');
              basisSources.add(c.evidence.source);
            }
            break;
          }
          case 'size': {
            suggested++;
            if (draft.size || patch.size) break;
            // Only apply a size the picker vocabulary can represent — a
            // value outside SIZE_OPTIONS would be invisible stored state.
            const match = SIZE_OPTIONS.find(
              (s) => s.toLowerCase() === value.toLowerCase(),
            );
            if (match) {
              patch.size = match;
              applied.push('size');
              errorKeys.add('size');
              basisSources.add(c.evidence.source);
            }
            break;
          }
          case 'condition': {
            suggested++;
            // Condition is a seller attestation — only evidence from the
            // seller's own description can pre-select it, and only where
            // the value maps without overstating.
            const mapped = CONDITION_CANDIDATE_MAP[value.toLowerCase()];
            if (
              !draft.condition &&
              c.evidence.source === 'seller_notes' &&
              mapped &&
              conditionAllowedFor(
                patch.category ?? draft.category,
                patch.subcategory ?? draft.subcategory,
                mapped,
              )
            ) {
              patch.condition = mapped;
              applied.push('condition');
              errorKeys.add('condition');
              basisSources.add(c.evidence.source);
            }
            break;
          }
          default:
            // 'color' and any future field the draft can't hold stay
            // informational — never stored silently.
            break;
        }
      }

      if (applied.length) {
        update(patch);
        errorKeys.forEach(clearError);
      }
      const basis = [...basisSources]
        .map((s) =>
          s === 'filename'
            ? 'the photo filename'
            : s === 'seller_notes'
              ? 'your description'
              : s === 'category_hint'
                ? 'your category'
                : 'the photos',
        )
        .join(' and ');
      setAutoFill(
        applied.length
          ? { phase: 'done', applied, basis }
          : {
              phase: 'empty',
              message: suggested
                ? 'Everything it found is already filled in — edit anything below.'
                : 'Nothing readable to suggest — fill the details below.',
            },
      );
    } catch (error) {
      // The backend's own message reaches the seller; the manual form is
      // the always-available path right below.
      const parsed = parseApiError(error, 'Couldn’t read the photo details.');
      setAutoFill({
        phase: 'error',
        message: parsed.isNetworkError
          ? 'No connection — check it and try again.'
          : parsed.message,
      });
    }
  };

  /**
   * Apply the edit sheet's exported pixels: the staged file is replaced by
   * the transformed one — new object URL, fresh upload in live mode. The
   * old preview ref is revoked unless it was committed to a published
   * listing.
   */
  const applyEditedPhoto = (blob: Blob) => {
    if (editIndex == null) return;
    const index = editIndex;
    const old = draft.photos[index];
    const file = new File([blob], `photo-${index + 1}.jpg`, { type: blob.type });
    const nextUrl = URL.createObjectURL(file);
    if (old && !committedRef.current.has(old)) URL.revokeObjectURL(old);
    if (old) updateMedia(old, null);
    // A canvas export is always a still — the slot's kind resets to image.
    updateMedia(nextUrl, { kind: 'image', fileName: file.name });
    update({ photos: draft.photos.map((p, i) => (i === index ? nextUrl : p)) });
    void ensureMediaUpload(nextUrl);
    setEditIndex(null);
  };

  const retryPhotoUpload = (index: number) => {
    const url = draft.photos[index];
    if (!url) return;
    updateMedia(url, null);
    void ensureMediaUpload(url);
  };

  const reorderPhotos = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= draft.photos.length || to >= draft.photos.length)
      return;
    const next = [...draft.photos];
    const [moved] = next.splice(from, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    update({ photos: next });
  };

  /* The banner only surfaces a draft that belongs to this context: in edit
   * mode unsaved changes to the same listing; in draft mode the snapshot
   * of THIS draft; in create mode any saved draft can be offered. */
  const bannerDraft =
    pendingDraft &&
    (editId
      ? pendingDraft.editId === editId
      : draftParam
        ? pendingDraft.draftId === draftParam
        : !pendingDraft.editId)
      ? pendingDraft
      : null;

  const handleResume = () => {
    const record = pendingDraft;
    const restored = resumeDraft();
    if (!restored) return;
    const targetEditId = record?.editId ?? null;
    const targetDraftId = record?.draftId ?? null;
    if (targetEditId && targetEditId !== editId) {
      // The draft belongs to another listing — move the route with it so
      // publish updates the right record.
      hydratedEditIdRef.current = targetEditId;
      router.replace(`/sell?edit=${targetEditId}`);
    } else if (targetDraftId) {
      // A shelf/import draft — bind the composer and (when the route
      // doesn't already name it) move the URL so refresh resumes the
      // same draft rather than offering the banner again.
      setDraftSourceId(targetDraftId);
      hydratedDraftIdRef.current = targetDraftId;
      if (draftParam !== targetDraftId) router.replace(`/sell?draft=${targetDraftId}`);
    }
    photosRef.current.forEach((url) => {
      if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
    });
    setErrors({});
    setDirty(true);
    setAutoFill({ phase: 'idle' });
    // Verify blob: refs before restoring — ones that died with the last
    // reload are filtered out and reported, never silently dropped.
    void (async () => {
      const { kept, dropped } = await livePhotosOnly(restored.photos);
      setDraft({ ...restored, photos: kept });
      if (dropped > 0) setLostPhotos(dropped);
    })();
  };

  const saveAndExit = () => {
    flushDraft();
    // Land where the saved draft actually lives — the hub's Drafts view
    // shows it immediately, rather than leaving the seller to hunt.
    router.push('/seller-hub/listings');
  };

  const validate = (): SellErrors => {
    const e: SellErrors = {};
    if (!draft.photos.length) e.photos = 'Add at least one photo';
    const title = draft.title.trim();
    if (!title) e.title = 'Add a title for your item';
    else if (title.length < 3) e.title = 'Give the title at least 3 characters';
    if (!draft.category) e.category = 'Choose a category';
    // Condition is an explicit seller claim — never silently defaulted.
    if (!draft.condition) e.condition = 'Choose a condition';
    // Size is required only where the category policy says so (the shoes
    // policy — resolved from the canonical category/subcategory ids);
    // elsewhere it stays recommended, not blocking.
    if (isSizeRequiredCategory(draft.category, draft.subcategory) && !draft.size) {
      e.size = 'Choose a size';
    }
    // Description is a hard requirement on the mobile completeness model —
    // buyers read it for material/fit/flaws; under the floor it blocks.
    if (draft.description.trim().length < DESCRIPTION_MIN) {
      e.description = `Describe the item — at least ${DESCRIPTION_MIN} characters`;
    }
    const price = parsePriceInput(draft.price);
    if (price == null) e.price = 'Set a price';
    else if (price < 1) e.price = 'Minimum price is £1';
    else if (price > 50_000) e.price = 'Maximum price is £50,000';
    // RRP is optional, but when set it has to be an honest "was" price —
    // a figure at or under the ask would render as a fake discount, and
    // a non-numeric one can't be stored at all.
    const originalPrice = parsePriceInput(draft.originalPrice);
    if (draft.originalPrice.trim() !== '') {
      if (originalPrice == null) {
        e.originalPrice = 'Enter a valid original price';
      } else if (price != null && originalPrice <= price) {
        e.originalPrice =
          'Original price should be higher than your price — it shows as the "was" price';
      }
    }
    return e;
  };

  const openPreview = () => {
    // Listing creation is account-bound — guests hit the wall here rather
    // than composing a listing they can't publish.
    if (!requireAuth('create_listing')) return;
    setPreviewOpen(true);
    window.scrollTo({ top: 0 });
  };

  const publish = () => {
    if (!requireAuth('create_listing')) return;
    const next = validate();
    setErrors(next);
    const firstError = Object.keys(ERROR_FIELD_IDS).find((k) => next[k as keyof SellErrors]);
    if (firstError) {
      const id = ERROR_FIELD_IDS[firstError];
      // Publishing from the preview surface — the fields live on the
      // editor, so return there first, then land on the problem.
      if (previewOpen) {
        setPreviewOpen(false);
        window.setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
      } else {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    // validate() guaranteed these — narrowed once for the commit payload;
    // condition is never silently defaulted to 'Good'.
    const condition = draft.condition as ListingCondition;
    setPublishing(true);
    setPublishError(null);
    if (DATA_MODE === 'live') {
      /* Live publish — the native staged contract
       * (frontend/src/services/listingPublication.ts):
       *   1. resolve every staged URI through the verified
       *      presign→PUT→finalize pipeline,
       *   2. cover = the first image-kind slot (a video can lead the
       *      order but never serves as the still cover),
       *   3. POST /listings with the client-minted stable id — a retry
       *      replays a byte-identical idempotent upsert,
       *   4. attach every verified item through POST /listing-images
       *      (deterministic per-slot ids, so retries upsert).
       * Edit mode keeps the same media stage then PATCHes the
       * whitelisted fields with the optimistic expectedUpdatedAt token. */
      void (async () => {
        try {
          const resolved = await Promise.all(draft.photos.map(ensureMediaUpload));
          const missingVerification = resolved.find(
            (m) => !m.alreadyAttached && !m.finalizationId,
          );
          if (missingVerification) {
            throw new Error(
              'One media item could not be verified — remove it and try again.',
            );
          }

          const originalPrice = parsePriceInput(draft.originalPrice);
          // Fields shared by create + PATCH — only the whitelisted keys
          // the backend schemas accept. `subcategory` is create-only (the
          // patch schema strips it, so it never rides the edit body).
          const fields = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            priceGbp: parsePriceInput(draft.price) ?? 0,
            // originalPriceGbp is a real listing column (create + PATCH
            // accept it). Omitted when unset — the contract has no
            // explicit clear, so an emptied field simply isn't sent.
            originalPriceGbp: originalPrice != null && originalPrice > 0 ? originalPrice : undefined,
            category: draft.category,
            brand: draft.brand.trim() || undefined,
            size: draft.size || undefined,
            condition,
            shippingMethod: draft.shippingMethod || undefined,
            shippingPayer: draft.shippingPayer || undefined,
          };

          /** Attach one resolved media item — deterministic slot id keeps
           *  a retried publish an upsert rather than a duplicate row. */
          const attachMedia = async (listingId: string) => {
            for (let i = 0; i < resolved.length; i++) {
              const m = resolved[i];
              if (!m.finalizationId || m.alreadyAttached) continue;
              await listingsService.attachListingImage({
                id: `${listingId}_att_${i}`,
                listingId,
                imageUrl: m.publicUrl,
                sortOrder: i,
                mediaType: m.kind,
                finalizationId: m.finalizationId,
                mediaWidth: m.width ?? undefined,
                mediaHeight: m.height ?? undefined,
                posterUrl: m.posterUrl ?? null,
                blurhash: m.blurhash ?? null,
              });
            }
          };

          let publishedId: string;
          let publishedStatus: string | undefined;
          let publishedUpdatedAt: string | undefined;

          if (editing) {
            // Attach fresh media first (native order) — /listing-images is
            // owner-verified and only accepts rows on draft/active
            // listings; a paused or held row reports that honestly.
            await attachMedia(editing.id);
            // The cover only travels with a fresh verified upload — an
            // already-attached image's finalization isn't re-derivable, so
            // reordering to an existing photo leaves image_url untouched
            // (the single-PATCH schema has no attachment-order channel).
            const cover = resolved.find(
              (m) => m.kind === 'image' && m.finalizationId && !m.alreadyAttached,
            );
            const patch: listingsService.ListingPatchInput = {
              ...fields,
              ...(cover
                ? { imageUrl: cover.publicUrl, coverFinalizationId: cover.finalizationId }
                : {}),
              // Publishing a draft edit activates it — any other status
              // stays whatever it is (a transition we didn't mean is never
              // sent, and a held row answers LISTING_STATUS_HELD).
              ...(editing.status === 'draft' ? { status: 'active' } : {}),
              expectedUpdatedAt: editing.updatedAt,
            };
            const res = await listingsService.patchListing(editing.id, patch);
            publishedId = res.listingId;
            publishedStatus = res.status;
            publishedUpdatedAt = res.updatedAt;
          } else {
            const sellerId = user?.id;
            if (!sellerId) throw new Error('Sign in to publish this listing.');
            const cover = resolved.find((m) => m.kind === 'image');
            if (!cover?.publicUrl || !cover.finalizationId) {
              throw new Error(
                'Add a photo for the cover — a video can’t be the listing cover.',
              );
            }
            publishIdRef.current ??= crypto.randomUUID();
            const { listingId, status } = await listingsService.createListing({
              id: publishIdRef.current,
              sellerId,
              ...fields,
              subcategory: draft.subcategory || undefined,
              imageUrl: cover.publicUrl,
              coverFinalizationId: cover.finalizationId,
              status: 'active',
            });
            publishedId = listingId;
            publishedStatus = status;
            // The publish gate may hold the row at risk_pending — media
            // writes are rejected outside draft/active, so a held listing
            // keeps its cover (already set on create) and the status is
            // reported truthfully rather than failing the whole publish.
            if (status !== 'risk_pending') {
              await attachMedia(listingId);
            }
          }

          draft.photos.forEach((url) => committedRef.current.add(url));
          clearPersistedDraft();
          // Success view renders a Listing — project the server outcome
          // onto the contract the success card reads, status included
          // (never claim 'active' when the gate held the row).
          const published: Listing = editing
            ? {
                ...editing,
                title: fields.title,
                brand: fields.brand ?? null,
                size: fields.size ?? null,
                condition: fields.condition as Listing['condition'],
                price: fields.priceGbp,
                originalPrice: fields.originalPriceGbp,
                description: fields.description,
                category: fields.category,
                status: (publishedStatus as Listing['status']) ?? editing.status,
                updatedAt: publishedUpdatedAt ?? editing.updatedAt,
              }
            : {
                id: publishedId,
                title: fields.title,
                brand: fields.brand ?? null,
                size: fields.size ?? null,
                condition: fields.condition as Listing['condition'],
                price: fields.priceGbp,
                originalPrice: fields.originalPriceGbp,
                images: resolved.map((m) =>
                  m.kind === 'video' ? (m.posterUrl ?? m.publicUrl) : m.publicUrl,
                ),
                media: resolved.map((m) => ({
                  kind: m.kind,
                  uri: m.publicUrl,
                  poster: m.posterUrl ?? null,
                  width: m.width ?? null,
                  height: m.height ?? null,
                  blurhash: m.blurhash ?? null,
                })),
                likes: 0,
                sellerId: seller.id,
                category: fields.category,
                subcategory: draft.subcategory || null,
                description: fields.description,
                createdAt: new Date().toISOString(),
                status: (publishedStatus as Listing['status']) ?? 'active',
                shippingMethod: fields.shippingMethod ?? null,
                shippingPayer: fields.shippingPayer ?? null,
              };
          // Seller-asserted sustainability claims — no live write path
          // exists for them, so they stay on the success/preview
          // projection honestly marked as seller-provided.
          if (draft.sustainabilityTags.length) {
            (published as Listing & { sustainabilityTags?: string[] }).sustainabilityTags = [
              ...draft.sustainabilityTags,
            ];
          }
          publishIdRef.current = null;
          setPublishedListing(published);
          setPreviewOpen(false);
          window.scrollTo({ top: 0 });
        } catch (error) {
          // Honest failure — the backend's own message (validation, stale
          // edit, media still processing, moderation) reaches the seller;
          // only a genuine transport failure says "connection".
          const parsed = parseApiError(
            error,
            'Could not publish — try again.',
          );
          setPublishError(
            parsed.isNetworkError
              ? 'Could not publish — check your connection and try again.'
              : parsed.message,
          );
        } finally {
          setPublishing(false);
        }
      })();
      return;
    }
    // Fixture publish — brief commit state, then the success view.
    window.setTimeout(() => {
      draft.photos.forEach((url) => committedRef.current.add(url));
      const input = {
        title: draft.title.trim(),
        brand: draft.brand.trim() || null,
        size: draft.size || null,
        condition,
        price: parsePriceInput(draft.price) ?? 0,
        images: draft.photos,
        category: draft.category,
        subcategory: draft.subcategory || null,
        description: draft.description.trim(),
        tags: draft.tags,
      };
      const listing = editing
        ? updateListing(editing.id, input)
        : recordListing(input, seller);
      if (!listing) {
        setPublishing(false);
        return;
      }
      // recordListing/updateListing own the base record; the delivery
      // choices live on the Listing contract, so stamp them here —
      // the PDP's shipping strip reads them verbatim.
      listing.shippingMethod = draft.shippingMethod || null;
      listing.shippingPayer = draft.shippingPayer || null;
      // Contract field — the RRP/"was" price. Cleared honestly when the
      // seller empties the field on an edit (undefined, not a stale keep).
      listing.originalPrice = parsePriceInput(draft.originalPrice) ?? undefined;
      // Seller-asserted claims — same extension-field pattern as `tags`.
      (listing as Listing & { sustainabilityTags?: string[] }).sustainabilityTags =
        draft.sustainabilityTags.length ? [...draft.sustainabilityTags] : undefined;
      clearPersistedDraft();
      setPublishedListing(listing);
      setPreviewOpen(false);
      setPublishing(false);
      window.scrollTo({ top: 0 });
    }, 700);
  };

  if (editLoading) {
    return (
      <div
        className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6"
        aria-busy
        aria-label="Loading listing"
      >
        <Skeleton className="mt-8 h-9 w-56" />
        <Skeleton className="mt-8 h-44 w-full rounded-lg" />
        <div className="mt-10 space-y-4">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (editNotFound) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-24 text-center sm:px-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-text-muted">
          <Icon name="edit" size={22} />
        </span>
        <h1 className="mt-5 text-screen-title text-text-primary">
          That listing isn&apos;t editable
        </h1>
        <p className="mt-2 max-w-sm text-body text-text-secondary">
          It may have sold, been removed, or it isn&apos;t one of yours.
        </p>
        <Link
          href="/sell"
          className="pressable mt-6 text-body font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          Start a new listing
        </Link>
      </div>
    );
  }

  if (publishedListing) {
    return (
      <SellSuccess
        listing={publishedListing}
        edited={Boolean(editing)}
        onListAnother={() => {
          draft.photos.forEach((url) => {
            if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
          });
          setDraft(EMPTY_DRAFT);
          setErrors({});
          setDirty(false);
          setDraftSourceId(null);
          setPublishError(null);
          setAutoFill({ phase: 'idle' });
          publishIdRef.current = null;
          setPublishedListing(null);
          window.scrollTo({ top: 0 });
          if (editing || draftParam) router.push('/sell');
        }}
      />
    );
  }

  if (draftLoading) {
    return (
      <div
        className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6"
        aria-busy
        aria-label="Loading draft"
      >
        <Skeleton className="mt-8 h-9 w-56" />
        <Skeleton className="mt-8 h-44 w-full rounded-lg" />
        <div className="mt-10 space-y-4">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (draftNotFound) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-24 text-center sm:px-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-text-muted">
          <Icon name="edit" size={22} />
        </span>
        <h1 className="mt-5 text-screen-title text-text-primary">
          That draft isn&apos;t here anymore
        </h1>
        <p className="mt-2 max-w-sm text-body text-text-secondary">
          It may have been published or removed already.
        </p>
        <Link
          href="/sell"
          className="pressable mt-6 text-body font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          Start a new listing
        </Link>
      </div>
    );
  }

  if (previewOpen) {
    return (
      <>
        <SellPreview
          draft={draft}
          seller={seller}
          publishing={publishing}
          editing={editing != null}
          error={publishError}
          mediaOf={mediaOf}
          onBack={() => {
            setPreviewOpen(false);
            window.scrollTo({ top: 0 });
          }}
          onPublish={publish}
        />
        {wall}
      </>
    );
  }

  const price = parsePriceInput(draft.price);
  const steps: SellStep[] = [
    { id: 'sell-photos', label: 'Photos', done: draft.photos.length > 0 },
    {
      id: 'sell-details',
      label: 'Details',
      done:
        draft.title.trim().length >= 3 &&
        !!draft.category &&
        !!draft.condition &&
        !(isSizeRequiredCategory(draft.category, draft.subcategory) && !draft.size) &&
        draft.description.trim().length >= DESCRIPTION_MIN,
    },
    { id: 'sell-price', label: 'Price', done: price != null },
    {
      id: 'sell-postage',
      label: 'Postage',
      done: !!draft.shippingMethod && !!draft.shippingPayer,
    },
    { id: 'sell-review', label: 'Review', done: false },
  ];

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6 lg:max-w-[1200px]">
      <header className="flex items-start justify-between gap-4 pb-2 pt-8">
        <div className="min-w-0">
          <h1 className="text-screen-title text-text-primary">
            {editing ? 'Edit listing' : 'Sell an item'}
          </h1>
          {editing ? (
            <p className="clamp-1 mt-1 text-caption text-text-muted">
              “{editing.title}” — changes go live when you save.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1.5">
          {draftSavedVisible ? (
            <span className="flex items-center gap-1 text-caption text-text-muted">
              <Icon name="check" size={12} />
              Draft saved
            </span>
          ) : null}
          {editing ? (
            <button
              type="button"
              onClick={() => router.back()}
              className="pressable rounded-md px-2 py-1.5 text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
          ) : null}
          {/* Shelf save needs a real seller — guests compose against
              localStorage only and can't publish anyway. */}
          {user ? (
            <button
              type="button"
              onClick={saveAndExit}
              className="pressable rounded-md px-2 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Save draft &amp; exit
            </button>
          ) : null}
        </div>
      </header>

      {bannerDraft ? (
        <DraftResumeBanner
          record={bannerDraft}
          onResume={handleResume}
          onDiscard={discardDraft}
        />
      ) : null}

      {lostPhotos > 0 ? (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3"
        >
          <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning-text" />
          <p className="min-w-0 flex-1 text-caption text-text-secondary">
            {lostPhotos} photo{lostPhotos === 1 ? '' : 's'} couldn&apos;t be restored —
            photos added from this device don&apos;t survive a reload. Add them again
            before publishing.
          </p>
          <IconButton
            name="close"
            size={16}
            aria-label="Dismiss"
            onClick={() => setLostPhotos(0)}
            className="-mr-2 -my-1.5 shrink-0"
          />
        </div>
      ) : null}

      {!editing ? <EditListingPicker listings={ownListings} /> : null}

      {/* Form column + live-preview rail at lg — the Vinted/eBay sell
          grammar: the draft rendered as its real feed tile stays pinned
          while the sections scroll. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <SellProgress steps={steps} />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              openPreview();
            }}
            noValidate
          >
            <PhotosSection
              photos={draft.photos}
              media={mediaByUrl}
              error={errors.photos}
              cameraSupported={cameraSupported}
              autoFill={
                // Live mode only — fixture mode has no backend to run the
                // extraction against, and a dead control would be dishonest.
                DATA_MODE === 'live'
                  ? {
                      ...autoFill,
                      onRun: () => void runAutoFill(),
                      onDismiss: () => setAutoFill({ phase: 'idle' }),
                    }
                  : undefined
              }
              onAdd={addPhotos}
              onRemove={removePhoto}
              onReorder={reorderPhotos}
              onEdit={setEditIndex}
              onRetryUpload={retryPhotoUpload}
              onTakePhoto={() => setCameraOpen(true)}
            />
            <DetailsSection draft={draft} errors={errors} update={update} clearError={clearError} />
            <PriceSection draft={draft} errors={errors} update={update} clearError={clearError} />
            <PostageSection draft={draft} update={update} />
            <ReviewSection draft={draft} editing={editing != null} onPreview={openPreview} />
          </form>
        </div>

        <aside className="sticky top-20 hidden lg:block" aria-label="Listing preview">
          <p className="text-label text-text-muted">
            In the feed
          </p>
          <div className="mt-3">
            <SellPreviewCard draft={draft} seller={seller} mediaOf={mediaOf} />
          </div>
          <p className="mt-3 max-w-[300px] text-caption leading-relaxed text-text-muted">
            Updates as you edit — this is the tile buyers see in discovery.
          </p>
          <Button
            variant="secondary"
            size="md"
            className="mt-4 w-full max-w-[300px]"
            onClick={openPreview}
          >
            Preview the full listing
          </Button>
        </aside>
      </div>

      {/* Media studio surfaces — camera capture + per-photo edit, both
          writing real pixels back into the staged set. */}
      {cameraSupported ? (
        <CameraSheet
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(files) => {
            addPhotos(files);
            setCameraOpen(false);
          }}
          remainingSlots={Math.max(0, MAX_PHOTOS - draft.photos.length)}
        />
      ) : null}
      <PhotoEditSheet
        open={editIndex != null && editIndex < draft.photos.length}
        src={editIndex != null ? (draft.photos[editIndex] ?? null) : null}
        photoLabel={editIndex != null ? `Photo ${editIndex + 1}` : 'photo'}
        onClose={() => setEditIndex(null)}
        onApply={applyEditedPhoto}
      />
      {wall}
    </div>
  );
}
