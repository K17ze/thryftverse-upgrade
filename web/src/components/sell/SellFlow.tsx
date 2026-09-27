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
import { useRouter, useSearchParams } from 'next/navigation';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import { CURRENT_USER, MY_LISTINGS } from '@/lib/data/fixtures';
import { recordListing, updateListing } from '@/lib/data/fixtures-commerce';
import { removeSellerDraft, sellerDraftById, upsertSellerDraft } from '@/lib/data/fixtures-seller';
import { DATA_MODE } from '@/lib/api/client';
import { fetchJson } from '@/lib/api/http';
import * as uploadsService from '@/lib/api/services/uploads';
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
import { PhotosSection, type PhotoMediaState } from './PhotosSection';
import { CameraSheet, isCameraCaptureSupported } from '@/components/media/CameraSheet';
import { PhotoEditSheet } from '@/components/media/PhotoEditSheet';
import { DetailsSection } from './DetailsSection';
import { PriceSection } from './PriceSection';
import { PostageSection } from './PostageSection';
import { ReviewSection } from './ReviewSection';
import { SellPreview } from './SellPreview';
import { SellSuccess } from './SellSuccess';
import { DraftResumeBanner } from './DraftResumeBanner';
import { EditListingPicker } from './EditListingPicker';

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

export function SellFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const draftParam = searchParams.get('draft');
  const { user } = useSession();
  const seller = user ?? CURRENT_USER;
  const { requireAuth, wall } = useSignupWall();
  const importDrafts = useImportDrafts();
  const { updateDraft: updateImportDraft, removeDraft: removeImportDraft } =
    useImportDraftActions();

  // Only the seller's own listings are editable — MY_LISTINGS is the own
  // closet slice; anything else resolves to a quiet not-found state.
  const editing = useMemo(
    () =>
      editId
        ? MY_LISTINGS.find((l) => l.id === editId && !l.isSold && l.status !== 'sold') ?? null
        : null,
    [editId],
  );
  const editNotFound = Boolean(editId && !editing);

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

  const ownListings = useMemo(
    () => MY_LISTINGS.filter((l) => !l.isSold && l.status !== 'sold'),
    [],
  );

  const [draft, setDraft] = useState<SellDraft>(() =>
    editing ? draftFromListing(editing) : EMPTY_DRAFT,
  );
  const [errors, setErrors] = useState<SellErrors>({});
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedListing, setPublishedListing] = useState<Listing | null>(null);
  /** The shelf/import draft this composer is bound to (?draft= or a
   *  resumed record). Null for free-standing composer drafts — the
   *  persistence hook mints a shelf id on first save. */
  const [draftSourceId, setDraftSourceId] = useState<string | null>(null);
  /** Photos lost on resume — blob: refs that didn't survive a reload. */
  const [lostPhotos, setLostPhotos] = useState(0);

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
  interface PhotoMediaEntry extends PhotoMediaState {
    publicUrl?: string;
    /** In-flight upload — publish dedupes onto it rather than re-PUTting. */
    promise?: Promise<string>;
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

  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Feature-detected — the capture entry never renders where the browser
  // can't do it (non-secure context, no MediaDevices API).
  const hydrated = useHydrated();
  const cameraSupported = hydrated && isCameraCaptureSupported();

  /**
   * Upload one staged photo, or return the URL as-is for remote refs.
   * Dedupes onto the publicUrl / in-flight promise already recorded for
   * the URL — staging, retry and publish all funnel through here.
   */
  const ensurePhotoUpload = useCallback(
    (url: string): Promise<string> => {
      if (!url.startsWith('blob:')) return Promise.resolve(url);
      if (DATA_MODE !== 'live') return Promise.resolve(url);
      const existing = mediaRef.current[url];
      if (existing?.publicUrl) return Promise.resolve(existing.publicUrl);
      if (existing?.promise) return existing.promise;
      const promise = (async () => {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], 'listing-photo.jpg', {
          type: blob.type === 'image/png' ? 'image/png' : 'image/jpeg',
        });
        return uploadsService.uploadImageFile(file, 'listing', (ratio) => {
          updateMedia(url, { status: 'uploading', progress: ratio });
        });
      })();
      updateMedia(url, { status: 'uploading', progress: 0, promise });
      promise
        .then((publicUrl) =>
          updateMedia(url, { status: 'uploaded', progress: 1, publicUrl }),
        )
        .catch(() =>
          updateMedia(url, { status: 'failed', progress: null, promise: undefined }),
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
    setErrors({});
    setDirty(false);
    window.scrollTo({ top: 0 });
  }, [editing]);

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
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    const room = Math.max(0, MAX_PHOTOS - draft.photos.length);
    // Overflow past the cap never stages — only `room` files get refs.
    const kept = imageFiles.slice(0, room).map((f) => URL.createObjectURL(f));
    if (!kept.length) return;
    update({ photos: [...draft.photos, ...kept] });
    // Live mode stages the upload immediately — real progress rings on the
    // tiles, publish just awaits them (mobile's queue-on-stage model).
    kept.forEach((url) => void ensurePhotoUpload(url));
    clearError('photos');
  };

  const removePhoto = (index: number) => {
    const url = draft.photos[index];
    if (url) {
      URL.revokeObjectURL(url);
      updateMedia(url, null);
    }
    update({ photos: draft.photos.filter((_, i) => i !== index) });
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
    update({ photos: draft.photos.map((p, i) => (i === index ? nextUrl : p)) });
    void ensurePhotoUpload(nextUrl);
    setEditIndex(null);
  };

  const retryPhotoUpload = (index: number) => {
    const url = draft.photos[index];
    if (!url) return;
    updateMedia(url, null);
    void ensurePhotoUpload(url);
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
    // Size is required only where the category policy says so (sneakers =
    // mobile's shoes policy); elsewhere it stays recommended, not blocking.
    if (isSizeRequiredCategory(draft.category) && !draft.size) {
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
    if (DATA_MODE === 'live') {
      // Live publish — upload blob:// photos through the presign flow, then
      // POST/PATCH /listings on the shared backend.
      void (async () => {
        try {
          // Staged uploads already ran (or are in flight) — ensurePhotoUpload
          // dedupes onto their publicUrl/promise and retries failures, so a
          // photo that failed to stage gets one more honest attempt here.
          const imageUrls = await Promise.all(draft.photos.map(ensurePhotoUpload));

          const originalPrice = parsePriceInput(draft.originalPrice);
          const body = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            priceGbp: parsePriceInput(draft.price) ?? 0,
            // originalPriceGbp is a real listing column (create + PATCH
            // accept it). Omitted when unset — the contract has no
            // explicit clear, so an emptied field simply isn't sent.
            originalPriceGbp: originalPrice != null && originalPrice > 0 ? originalPrice : undefined,
            category: draft.category,
            subcategory: draft.subcategory || undefined,
            brand: draft.brand.trim() || undefined,
            size: draft.size || undefined,
            condition,
            images: imageUrls,
            shippingMethod: draft.shippingMethod || undefined,
            shippingPayer: draft.shippingPayer || undefined,
          };

          const res = editing
            ? await fetchJson<{ ok: boolean; listing?: { id: string }; id?: string }>(
                `/listings/${encodeURIComponent(editing.id)}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                },
              )
            : await fetchJson<{ ok: boolean; listing?: { id: string }; id?: string }>(
                '/listings',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                },
              );

          const id = editing?.id ?? res.listing?.id ?? res.id;
          if (!id) throw new Error('No listing id returned');

          draft.photos.forEach((url) => committedRef.current.add(url));
          clearPersistedDraft();
          // Success view renders a Listing — project the server response
          // onto the contract the success card reads.
          const published: Listing = editing ?? {
            id,
            title: body.title,
            brand: body.brand ?? null,
            size: body.size ?? null,
            condition: body.condition as Listing['condition'],
            price: body.priceGbp,
            originalPrice: body.originalPriceGbp,
            images: imageUrls,
            likes: 0,
            sellerId: seller.id,
            category: body.category,
            subcategory: body.subcategory ?? null,
            description: body.description,
            createdAt: new Date().toISOString(),
            shippingMethod: body.shippingMethod ?? null,
            shippingPayer: body.shippingPayer ?? null,
          };
          // Seller-asserted sustainability claims — no live write path
          // exists for them, so they stay on the success/preview
          // projection honestly marked as seller-provided.
          if (draft.sustainabilityTags.length) {
            (published as Listing & { sustainabilityTags?: string[] }).sustainabilityTags = [
              ...draft.sustainabilityTags,
            ];
          }
          setPublishedListing(published);
          setPreviewOpen(false);
          window.scrollTo({ top: 0 });
        } catch {
          // Honest failure — the publish button is re-enabled with the
          // field-level error so the seller can retry without losing state.
          setErrors((e) => ({
            ...e,
            title: e.title ?? 'Could not publish — check your connection and try again.',
          }));
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

  if (editNotFound) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-24 text-center sm:px-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-text-muted">
          <Icon name="edit" size={22} />
        </span>
        <h1 className="mt-5 text-screen-title font-bold text-text-primary">
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
        <h1 className="mt-5 text-screen-title font-bold text-text-primary">
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
        !(isSizeRequiredCategory(draft.category) && !draft.size) &&
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
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6">
      <header className="flex items-start justify-between gap-4 pb-2 pt-8">
        <div className="min-w-0">
          <h1 className="text-screen-title font-bold text-text-primary">
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
