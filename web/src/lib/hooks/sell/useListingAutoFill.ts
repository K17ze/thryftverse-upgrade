'use client';

/**
 * useListingAutoFill — assisted listing autofill backed by POST /listing-intelligence/run.
 * Fills EMPTY draft fields only with non-abstained candidates derived from photo analysis,
 * filename heuristics, and seller notes.
 */

import { useState } from 'react';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import { parseApiError } from '@/lib/api/http';
import * as listingIntelligenceService from '@/lib/api/services/listingIntelligence';
import type { SignupAction } from '@/components/auth/SignupWall';
import type { TaxonomyCollection, TaxonomyNode } from '@/lib/contracts/taxonomy';
import type { AutoFillControl } from '@/components/sell/PhotosSection';
import type { SellDraft, SellErrors } from '@/components/sell/constants';
import {
  SIZE_OPTIONS,
  canonicalCategoryId,
  categoryNodeName,
  conditionAllowedFor,
} from '@/components/sell/taxonomy';
import type { PhotoMediaEntry } from './useSellMediaUpload';

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
export function remoteFileName(url: string): string | undefined {
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

export type AutoFillState = Omit<AutoFillControl, 'onRun' | 'onDismiss'>;

interface UseListingAutoFillOptions {
  draft: SellDraft;
  editing: Listing | null;
  taxonomy: TaxonomyCollection;
  mediaRef: React.MutableRefObject<Record<string, PhotoMediaEntry>>;
  requireAuth: (action: SignupAction) => boolean;
  updateDraft: (patch: Partial<SellDraft>) => void;
  clearError: (key: keyof SellErrors) => void;
}

export function useListingAutoFill({
  draft,
  editing,
  taxonomy,
  mediaRef,
  requireAuth,
  updateDraft,
  clearError,
}: UseListingAutoFillOptions) {
  const [autoFill, setAutoFill] = useState<AutoFillState>({ phase: 'idle' });

  const runAutoFill = async () => {
    if (!requireAuth('create_listing')) return;
    if (autoFill.phase === 'running' || !draft.photos.length) return;
    setAutoFill({ phase: 'running' });

    try {
      const photos = draft.photos.slice(0, 20).map((url, i) => {
        const m = mediaRef.current[url];
        return {
          id: `photo_${i}`,
          url: m?.resolved?.publicUrl ?? m?.publicUrl ?? url,
          ...(m?.resolved?.width ? { width: m.resolved.width } : {}),
          ...(m?.resolved?.height ? { height: m.resolved.height } : {}),
        };
      });

      const cover = draft.photos[0];
      const filename = mediaRef.current[cover]?.fileName ?? remoteFileName(cover);
      const notes = draft.description.trim();

      const run = await listingIntelligenceService.runListingIntelligence({
        photos,
        filename: filename || undefined,
        sellerNotes: notes || undefined,
        categoryHint: categoryNodeName(taxonomy.categories, draft.category) ?? undefined,
        listingId: editing?.id,
      });

      const patch: Partial<SellDraft> = {};
      const applied: string[] = [];
      const errorKeys = new Set<keyof SellErrors>();
      const basisSources = new Set<string>();
      let suggested = 0;

      for (const c of run.candidates) {
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
                (n: TaxonomyNode) => n.parentId === null && n.name.toLowerCase() === value.toLowerCase(),
              )?.id ||
              '';
            if (canonical) {
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
            break;
        }
      }

      if (applied.length) {
        updateDraft(patch);
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
      const parsed = parseApiError(error, 'Couldn’t read the photo details.');
      setAutoFill({
        phase: 'error',
        message: parsed.isNetworkError
          ? 'No connection — check it and try again.'
          : parsed.message,
      });
    }
  };

  const resetAutoFill = () => setAutoFill({ phase: 'idle' });

  return {
    autoFill,
    setAutoFill,
    runAutoFill,
    resetAutoFill,
  };
}
