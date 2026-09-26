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
 *    a Resume banner; "Save draft & exit" flushes immediately
 *  - ?edit=<listingId> hydrates an own-listing into the same flow and
 *    publishes through updateListing instead of recordListing
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { CURRENT_USER, MY_LISTINGS } from '@/lib/data/fixtures';
import { recordListing, updateListing } from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import { fetchJson } from '@/lib/api/http';
import * as uploadsService from '@/lib/api/services/uploads';
import { useSession } from '@/lib/session/SessionProvider';
import { useSellDraftPersistence } from '@/lib/hooks/sell/useSellDraftPersistence';
import { Icon } from '@/components/ui/Icon';
import {
  draftFromListing,
  EMPTY_DRAFT,
  MAX_PHOTOS,
  parsePriceInput,
  type SellDraft,
  type SellErrors,
} from './constants';
import { SellProgress, type SellStep } from './SellProgress';
import { PhotosSection } from './PhotosSection';
import { DetailsSection } from './DetailsSection';
import { PriceSection } from './PriceSection';
import { PostageSection } from './PostageSection';
import { ReviewSection } from './ReviewSection';
import { SellPreview } from './SellPreview';
import { SellSuccess } from './SellSuccess';
import { DraftResumeBanner } from './DraftResumeBanner';
import { EditListingPicker } from './EditListingPicker';

/** Error key → the field to focus when validation fails. */
const ERROR_FIELD_IDS: Record<string, string> = {
  photos: 'sell-photos',
  title: 'sell-field-title',
  category: 'sell-field-category',
  price: 'sell-field-price',
};

export function SellFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const { user } = useSession();
  const seller = user ?? CURRENT_USER;

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

  const {
    pendingDraft,
    draftSavedVisible,
    resumeDraft,
    discardDraft,
    flushDraft,
    clearPersistedDraft,
  } = useSellDraftPersistence({ draft, editId: editing?.id ?? null, dirty });

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

  const update = (patch: Partial<SellDraft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const clearError = (key: keyof SellErrors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const urls = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => URL.createObjectURL(f));
    if (!urls.length) return;
    update({ photos: [...draft.photos, ...urls].slice(0, MAX_PHOTOS) });
    clearError('photos');
  };

  const removePhoto = (index: number) => {
    const url = draft.photos[index];
    if (url) URL.revokeObjectURL(url);
    update({ photos: draft.photos.filter((_, i) => i !== index) });
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
   * mode that's unsaved changes to the same listing; in create mode any
   * saved draft can be offered. */
  const bannerDraft =
    pendingDraft && (!editId || pendingDraft.editId === editId) ? pendingDraft : null;

  const handleResume = () => {
    const restored = resumeDraft();
    if (!restored) return;
    const targetEditId = pendingDraft?.editId ?? null;
    if (targetEditId && targetEditId !== editId) {
      // The draft belongs to another listing — move the route with it so
      // publish updates the right record.
      hydratedEditIdRef.current = targetEditId;
      router.replace(`/sell?edit=${targetEditId}`);
    }
    photosRef.current.forEach((url) => {
      if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
    });
    setDraft(restored);
    setErrors({});
    setDirty(true);
  };

  const saveAndExit = () => {
    flushDraft();
    router.push('/profile');
  };

  const validate = (): SellErrors => {
    const e: SellErrors = {};
    if (!draft.photos.length) e.photos = 'Add at least one photo';
    const title = draft.title.trim();
    if (!title) e.title = 'Add a title for your item';
    else if (title.length < 3) e.title = 'Give the title at least 3 characters';
    if (!draft.category) e.category = 'Choose a category';
    const price = parsePriceInput(draft.price);
    if (price == null) e.price = 'Set a price';
    else if (price < 1) e.price = 'Minimum price is £1';
    else if (price > 50_000) e.price = 'Maximum price is £50,000';
    return e;
  };

  const openPreview = () => {
    setPreviewOpen(true);
    window.scrollTo({ top: 0 });
  };

  const publish = () => {
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
    setPublishing(true);
    if (DATA_MODE === 'live') {
      // Live publish — upload blob:// photos through the presign flow, then
      // POST/PATCH /listings on the shared backend.
      void (async () => {
        try {
          const imageUrls: string[] = [];
          for (const photo of draft.photos) {
            if (photo.startsWith('blob:')) {
              const blob = await (await fetch(photo)).blob();
              const file = new File([blob], `photo-${imageUrls.length}.jpg`, {
                type: blob.type || 'image/jpeg',
              });
              imageUrls.push(await uploadsService.uploadImageFile(file, 'listing'));
            } else {
              imageUrls.push(photo);
            }
          }

          const body = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            priceGbp: parsePriceInput(draft.price) ?? 0,
            category: draft.category,
            subcategory: draft.subcategory || undefined,
            brand: draft.brand.trim() || undefined,
            size: draft.size || undefined,
            condition: draft.condition || 'Good',
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
        condition: draft.condition || 'Good',
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
          setPublishedListing(null);
          window.scrollTo({ top: 0 });
          if (editing) router.push('/sell');
        }}
      />
    );
  }

  if (previewOpen) {
    return (
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
    );
  }

  const price = parsePriceInput(draft.price);
  const steps: SellStep[] = [
    { id: 'sell-photos', label: 'Photos', done: draft.photos.length > 0 },
    {
      id: 'sell-details',
      label: 'Details',
      done: draft.title.trim().length >= 3 && !!draft.category && !!draft.condition,
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
          <button
            type="button"
            onClick={saveAndExit}
            className="pressable rounded-md px-2 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Save draft &amp; exit
          </button>
        </div>
      </header>

      {bannerDraft ? (
        <DraftResumeBanner
          record={bannerDraft}
          onResume={handleResume}
          onDiscard={discardDraft}
        />
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
          error={errors.photos}
          onAdd={addPhotos}
          onRemove={removePhoto}
          onReorder={reorderPhotos}
        />
        <DetailsSection draft={draft} errors={errors} update={update} clearError={clearError} />
        <PriceSection draft={draft} errors={errors} update={update} clearError={clearError} />
        <PostageSection draft={draft} update={update} />
        <ReviewSection draft={draft} editing={editing != null} onPreview={openPreview} />
      </form>
    </div>
  );
}
