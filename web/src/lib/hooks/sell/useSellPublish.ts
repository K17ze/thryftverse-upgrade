'use client';

/**
 * useSellPublish — handles validation, preview toggle, and the atomic publish
 * pipeline for listing creation and editing (both live API and fixture modes).
 */

import { useRef, useState } from 'react';
import type { Listing, ListingCondition, User } from '@/lib/contracts/domain';
import type { SignupAction } from '@/components/auth/SignupWall';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as listingsService from '@/lib/api/services/listings';
import { recordListing, updateListing } from '@/lib/data/fixtures-commerce';
import {
  DESCRIPTION_MIN,
  isSizeRequiredCategory,
  parsePriceInput,
  type SellDraft,
  type SellErrors,
} from '@/components/sell/constants';
import type { ResolvedMedia } from './useSellMediaUpload';

/** Error key → the field to focus when validation fails. Order is the
 *  composer order so the first blocker scrolls first. */
export const ERROR_FIELD_IDS: Record<string, string> = {
  photos: 'sell-photos',
  title: 'sell-field-title',
  category: 'sell-field-category',
  condition: 'sell-field-condition',
  size: 'sell-field-size',
  description: 'sell-field-description',
  price: 'sell-field-price',
  originalPrice: 'sell-field-original-price',
};

interface UseSellPublishOptions {
  draft: SellDraft;
  editing: Listing | null;
  user: User | null;
  seller: User;
  requireAuth: (action: SignupAction) => boolean;
  ensureMediaUpload: (url: string) => Promise<ResolvedMedia>;
  committedRef: React.MutableRefObject<Set<string>>;
  clearPersistedDraft: () => void;
  errors: SellErrors;
  setErrors: React.Dispatch<React.SetStateAction<SellErrors>>;
}

export function useSellPublish({
  draft,
  editing,
  user,
  seller,
  requireAuth,
  ensureMediaUpload,
  committedRef,
  clearPersistedDraft,
  setErrors,
}: UseSellPublishOptions) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedListing, setPublishedListing] = useState<Listing | null>(null);

  /** The listing id minted for this publish attempt — stable across
   *  retries so a replayed create is a byte-identical idempotent upsert,
   *  never a duplicate listing. Re-armed on every fresh compose. */
  const publishIdRef = useRef<string | null>(null);

  const validate = (): SellErrors => {
    const e: SellErrors = {};
    if (!draft.photos.length) e.photos = 'Add at least one photo';
    const title = draft.title.trim();
    if (!title) e.title = 'Add a title for your item';
    else if (title.length < 3) e.title = 'Give the title at least 3 characters';
    if (!draft.category) e.category = 'Choose a category';
    if (!draft.condition) e.condition = 'Choose a condition';
    if (isSizeRequiredCategory(draft.category, draft.subcategory) && !draft.size) {
      e.size = 'Choose a size';
    }
    if (draft.description.trim().length < DESCRIPTION_MIN) {
      e.description = `Describe the item — at least ${DESCRIPTION_MIN} characters`;
    }
    const price = parsePriceInput(draft.price);
    if (price == null) e.price = 'Set a price';
    else if (price < 1) e.price = 'Minimum price is £1';
    else if (price > 50_000) e.price = 'Maximum price is £50,000';

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
    if (!requireAuth('create_listing')) return;
    setPreviewOpen(true);
    window.scrollTo({ top: 0 });
  };

  const closePreview = () => {
    setPreviewOpen(false);
    window.scrollTo({ top: 0 });
  };

  const publish = () => {
    if (!requireAuth('create_listing')) return;
    const next = validate();
    setErrors(next);
    const firstError = Object.keys(ERROR_FIELD_IDS).find((k) => next[k as keyof SellErrors]);
    if (firstError) {
      const id = ERROR_FIELD_IDS[firstError];
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

    const condition = draft.condition as ListingCondition;
    setPublishing(true);
    setPublishError(null);

    if (DATA_MODE === 'live') {
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
          const fields = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            priceGbp: parsePriceInput(draft.price) ?? 0,
            originalPriceGbp: originalPrice != null && originalPrice > 0 ? originalPrice : undefined,
            category: draft.category,
            brand: draft.brand.trim() || undefined,
            size: draft.size || undefined,
            condition,
            shippingMethod: draft.shippingMethod || undefined,
            shippingPayer: draft.shippingPayer || undefined,
          };

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
            await attachMedia(editing.id);
            const cover = resolved.find(
              (m) => m.kind === 'image' && m.finalizationId && !m.alreadyAttached,
            );
            const patch: listingsService.ListingPatchInput = {
              ...fields,
              ...(cover
                ? { imageUrl: cover.publicUrl, coverFinalizationId: cover.finalizationId }
                : {}),
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
            if (status !== 'risk_pending') {
              await attachMedia(listingId);
            }
          }

          draft.photos.forEach((url) => committedRef.current.add(url));
          clearPersistedDraft();

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

    // Fixture publish
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
      listing.shippingMethod = draft.shippingMethod || null;
      listing.shippingPayer = draft.shippingPayer || null;
      listing.originalPrice = parsePriceInput(draft.originalPrice) ?? undefined;
      (listing as Listing & { sustainabilityTags?: string[] }).sustainabilityTags =
        draft.sustainabilityTags.length ? [...draft.sustainabilityTags] : undefined;
      clearPersistedDraft();
      setPublishedListing(listing);
      setPreviewOpen(false);
      setPublishing(false);
      window.scrollTo({ top: 0 });
    }, 700);
  };

  const resetPublishState = () => {
    publishIdRef.current = null;
    setPublishedListing(null);
    setPublishError(null);
  };

  return {
    previewOpen,
    setPreviewOpen,
    openPreview,
    closePreview,
    publishing,
    publishError,
    publishedListing,
    publishIdRef,
    publish,
    resetPublishState,
    validate,
  };
}
