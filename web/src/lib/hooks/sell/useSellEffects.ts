'use client';

/**
 * useSellEffects — handles re-hydration side-effects when edit or draft route targets
 * change, and handles restoring pending drafts via the resume banner.
 */

import { useEffect, useRef } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Listing, ListingMediaRecord } from '@/lib/contracts/domain';
import {
  draftFromListing,
  EMPTY_DRAFT,
  type SellDraft,
  type SellErrors,
} from '@/components/sell/constants';
import {
  livePhotosOnly,
  type PersistedSellDraft,
} from '@/lib/hooks/sell/useSellDraftPersistence';
import type { PhotoMediaEntry } from './useSellMediaUpload';

interface UseSellEffectsOptions {
  editing: Listing | null;
  draftListing: Listing | null;
  pendingDraft: PersistedSellDraft | null;
  editId: string | null;
  draftParam: string | null;
  router: AppRouterInstance;
  revokeAllUncommitted: () => void;
  updateMedia: (url: string, patch: Partial<PhotoMediaEntry> | null) => void;
  resetAutoFill: () => void;
  resetPublishState: () => void;
  resumeDraft: () => SellDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<SellDraft>>;
  setErrors: React.Dispatch<React.SetStateAction<SellErrors>>;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setDraftSourceId: React.Dispatch<React.SetStateAction<string | null>>;
  setLostPhotos: React.Dispatch<React.SetStateAction<number>>;
}

export function useSellEffects({
  editing,
  draftListing,
  pendingDraft,
  editId,
  draftParam,
  router,
  revokeAllUncommitted,
  updateMedia,
  resetAutoFill,
  resetPublishState,
  resumeDraft,
  setDraft,
  setErrors,
  setDirty,
  setDraftSourceId,
  setLostPhotos,
}: UseSellEffectsOptions) {
  // Re-hydrate on edit target change
  const hydratedEditIdRef = useRef<string | null>(editing?.id ?? null);
  useEffect(() => {
    const current = editing?.id ?? null;
    if (hydratedEditIdRef.current === current) return;
    hydratedEditIdRef.current = current;
    revokeAllUncommitted();
    setDraft(editing ? draftFromListing(editing) : EMPTY_DRAFT);
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
    resetAutoFill();
    resetPublishState();
    window.scrollTo({ top: 0 });
  }, [editing, updateMedia, revokeAllUncommitted, resetAutoFill, resetPublishState, setDraft, setErrors, setDirty]);

  // Hydrate on draft param change
  const hydratedDraftIdRef = useRef<string | null>(null);
  useEffect(() => {
    const current = draftListing?.id ?? null;
    if (hydratedDraftIdRef.current === current) return;
    hydratedDraftIdRef.current = current;
    if (!current || !draftListing) return;
    revokeAllUncommitted();
    setDraft(draftFromListing(draftListing));
    setDraftSourceId(current);
    setErrors({});
    setDirty(false);
    resetAutoFill();
    resetPublishState();
    window.scrollTo({ top: 0 });
  }, [draftListing, revokeAllUncommitted, resetAutoFill, resetPublishState, setDraft, setDraftSourceId, setErrors, setDirty]);

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
      hydratedEditIdRef.current = targetEditId;
      router.replace(`/sell?edit=${targetEditId}`);
    } else if (targetDraftId) {
      setDraftSourceId(targetDraftId);
      hydratedDraftIdRef.current = targetDraftId;
      if (draftParam !== targetDraftId) router.replace(`/sell?draft=${targetDraftId}`);
    }
    revokeAllUncommitted();
    setErrors({});
    setDirty(true);
    resetAutoFill();
    void (async () => {
      const { kept, dropped } = await livePhotosOnly(restored.photos);
      setDraft({ ...restored, photos: kept });
      if (dropped > 0) setLostPhotos(dropped);
    })();
  };

  return {
    bannerDraft,
    handleResume,
  };
}
