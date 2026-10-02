'use client';

/**
 * useListingAutoFill — assisted listing autofill backed by POST /listing-intelligence/run.
 *
 * The run no longer writes to the draft. It produces a per-field review list
 * (mobile parity with AIPoweredListingScreen's SuggestionRow): each candidate
 * carries its display value and the wire evidence detail, and nothing reaches
 * the draft until the seller explicitly accepts that row — or accepts all.
 * Dismissed rows are dropped; informational candidates (colour — the draft
 * has no colour field) render dismiss-only.
 *
 * Decomposed into:
 * - useListingAutoFillModel.ts: Candidate parsing, evidence aggregation, condition mapping
 * - useListingAutoFill.ts: React hook workflow, accept/dismiss handlers, auto-dismiss effect
 */

import { useEffect, useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { parseApiError } from '@/lib/api/http';
import * as listingIntelligenceService from '@/lib/api/services/listingIntelligence';
import type { SignupAction } from '@/components/auth/SignupWall';
import type { TaxonomyCollection } from '@/lib/contracts/taxonomy';
import type { AutoFillSuggestion } from '@/components/sell/PhotosSection';
import type { SellDraft, SellErrors } from '@/components/sell/constants';
import { categoryNodeName } from '@/components/sell/taxonomy';
import type { PhotoMediaEntry } from './useSellMediaUpload';
import {
  type AutoFillState,
  fieldIsFilled,
  processRunCandidates,
  remoteFileName,
} from './useListingAutoFillModel';

export { remoteFileName } from './useListingAutoFillModel';
export type { AutoFillState } from './useListingAutoFillModel';

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

  /** Fold a resolved review list into the next phase: still-pending rows keep
   *  the panel open; all-resolved collapses to the quiet done line (or back
   *  to idle when nothing was actually applied). */
  const settle = (suggestions: AutoFillSuggestion[], basis?: string | null) => {
    if (suggestions.some((s) => s.status === 'pending')) {
      setAutoFill({ phase: 'review', suggestions, basis: basis ?? undefined });
      return;
    }
    const applied = suggestions
      .filter((s) => s.status === 'accepted' && s.patch)
      .map((s) => s.key);
    setAutoFill(
      applied.length
        ? { phase: 'done', applied, basis: basis ?? undefined }
        : { phase: 'idle' },
    );
  };

  const acceptSuggestion = (key: string) => {
    if (autoFill.phase !== 'review' || !autoFill.suggestions) return;
    const item = autoFill.suggestions.find(
      (s) => s.key === key && s.status === 'pending',
    );
    if (!item) return;
    // Explicit accept — apply even if the field filled since the run; the
    // seller reviewed the exact value shown. (The auto-dismiss effect below
    // normally retires stale rows before this can matter.)
    if (item.patch) {
      updateDraft(item.patch);
      item.clears?.forEach(clearError);
    }
    settle(
      autoFill.suggestions.map((s) =>
        s.key === key ? { ...s, status: 'accepted' as const } : s,
      ),
      autoFill.basis,
    );
  };

  const dismissSuggestion = (key: string) => {
    if (autoFill.phase !== 'review' || !autoFill.suggestions) return;
    settle(
      autoFill.suggestions.map((s) =>
        s.key === key && s.status === 'pending'
          ? { ...s, status: 'dismissed' as const }
          : s,
      ),
      autoFill.basis,
    );
  };

  const acceptAllSuggestions = () => {
    if (autoFill.phase !== 'review' || !autoFill.suggestions) return;
    const merged: Partial<SellDraft> = {};
    const clears = new Set<keyof SellErrors>();
    // Category's patch resets subcategory/size — it must merge before a
    // sibling size patch regardless of backend candidate order.
    const pending = autoFill.suggestions.filter(
      (s) => s.status === 'pending' && s.patch,
    );
    const ordered = [
      ...pending.filter((s) => s.key === 'category'),
      ...pending.filter((s) => s.key !== 'category'),
    ];
    for (const s of ordered) {
      Object.assign(merged, s.patch);
      s.clears?.forEach((k) => clears.add(k));
    }
    if (Object.keys(merged).length) updateDraft(merged);
    clears.forEach(clearError);
    settle(
      autoFill.suggestions.map((s) =>
        s.status === 'pending' ? { ...s, status: 'accepted' as const } : s,
      ),
      autoFill.basis,
    );
  };

  // Seller-typed input retires the matching pending row (mobile markDirty
  // parity) — a suggestion only ever targets a field that was empty at run
  // time, so a now-filled field means the seller overrode it themselves.
  useEffect(() => {
    setAutoFill((current) => {
      if (current.phase !== 'review' || !current.suggestions) return current;
      if (
        !current.suggestions.some(
          (s) => s.status === 'pending' && fieldIsFilled(s.key, draft),
        )
      ) {
        return current;
      }
      const next = current.suggestions.map((s) =>
        s.status === 'pending' && fieldIsFilled(s.key, draft)
          ? { ...s, status: 'dismissed' as const }
          : s,
      );
      if (next.some((s) => s.status === 'pending')) {
        return { ...current, suggestions: next };
      }
      const applied = next
        .filter((s) => s.status === 'accepted' && s.patch)
        .map((s) => s.key);
      return applied.length
        ? { phase: 'done', applied, basis: current.basis }
        : { phase: 'idle' };
    });
  }, [draft]);

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

      const { suggestions, suggested, basis } = processRunCandidates(
        run.candidates,
        draft,
        taxonomy,
      );

      setAutoFill(
        suggestions.length
          ? { phase: 'review', suggestions, basis }
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
    acceptSuggestion,
    dismissSuggestion,
    acceptAllSuggestions,
  };
}
