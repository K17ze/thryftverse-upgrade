'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { CURRENT_USER } from '@/lib/data/fixtures';
import { removeSellerDraft, upsertSellerDraft } from '@/lib/data/fixtures-seller';
import { DATA_MODE } from '@/lib/api/client';
import { useTaxonomy } from '@/lib/hooks/sell/useTaxonomy';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import {
  draftRecordToListing,
  useSellDraftPersistence,
  type PersistedSellDraft,
} from '@/lib/hooks/sell/useSellDraftPersistence';
import { useImportDraftActions } from '@/components/catalogimport/useImportDrafts';
import {
  draftFromListing,
  EMPTY_DRAFT,
  type SellDraft,
  type SellErrors,
} from './constants';
import { computeSellSteps } from './SellProgress';
import { isCameraCaptureSupported } from '@/lib/media/cameraSupport';
import { useSellMediaUpload } from '@/lib/hooks/sell/useSellMediaUpload';
import { useListingAutoFill } from '@/lib/hooks/sell/useListingAutoFill';
import { aiFeatureOn, useAIPrefs } from '@/lib/store/aiPrefs';
import { useSellPublish } from '@/lib/hooks/sell/useSellPublish';
import { useSellHydration } from '@/lib/hooks/sell/useSellHydration';
import { useSellEffects } from '@/lib/hooks/sell/useSellEffects';

export function useSellFlowWorkflow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const draftParam = searchParams.get('draft');
  const { user, sessionLoading } = useSession();
  const seller = user ?? CURRENT_USER;
  const { requireAuth, wall } = useSignupWall();
  const { taxonomy } = useTaxonomy();
  const { updateDraft: updateImportDraft, removeDraft: removeImportDraft } =
    useImportDraftActions();

  const {
    editing,
    editLoading,
    editNotFound,
    draftListing,
    draftLoading,
    draftNotFound,
    ownListings,
    importDrafts,
  } = useSellHydration({
    editId,
    draftParam,
    user,
    sessionLoading,
  });

  const [draft, setDraft] = useState<SellDraft>(() =>
    editing ? draftFromListing(editing) : EMPTY_DRAFT,
  );
  const [errors, setErrors] = useState<SellErrors>({});
  const [dirty, setDirty] = useState(false);
  const [draftSourceId, setDraftSourceId] = useState<string | null>(null);
  const [lostPhotos, setLostPhotos] = useState(0);

  const update = useCallback((patch: Partial<SellDraft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const clearError = useCallback((key: keyof SellErrors) => {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  // Media upload orchestration
  const {
    mediaByUrl,
    mediaRef,
    committedRef,
    mediaOf,
    updateMedia,
    ensureMediaUpload,
    addPhotos,
    removePhoto,
    retryPhotoUpload,
    reorderPhotos,
    applyEditedPhoto,
    editIndex,
    setEditIndex,
    cameraOpen,
    setCameraOpen,
    revokeAllUncommitted,
  } = useSellMediaUpload({
    photos: draft.photos,
    onPhotosChange: (photos) => update({ photos }),
    onClearPhotoError: () => clearError('photos'),
    onResetAutoFill: () => resetAutoFill(),
  });

  // Assisted AI autofill — per-field suggestion review, nothing auto-applies
  const {
    autoFill,
    runAutoFill,
    resetAutoFill,
    acceptSuggestion,
    dismissSuggestion,
    acceptAllSuggestions,
  } = useListingAutoFill({
    draft,
    editing,
    taxonomy,
    mediaRef,
    requireAuth,
    updateDraft: update,
    clearError,
  });

  // Draft shelf persistence
  const syncDraftShelf = useCallback(
    (record: PersistedSellDraft | null, recordDraftId: string | null) => {
      if (!recordDraftId) return;
      if (!user) return;
      if (!record) {
        removeSellerDraft(recordDraftId);
        removeImportDraft(recordDraftId);
        return;
      }
      const listing = draftRecordToListing(record, seller);
      if ((importDrafts.data ?? []).some((d) => d.id === recordDraftId)) {
        const patch: Partial<Listing> = { ...listing };
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

  // Publish & Preview orchestration
  const {
    previewOpen,
    setPreviewOpen,
    openPreview,
    publishing,
    publishError,
    publishedListing,
    publish,
    resetPublishState,
  } = useSellPublish({
    draft,
    editing,
    user,
    seller,
    requireAuth,
    ensureMediaUpload,
    committedRef,
    clearPersistedDraft,
    errors,
    setErrors,
  });

  const { bannerDraft, handleResume } = useSellEffects({
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
  });

  const saveAndExit = () => {
    flushDraft();
    router.push('/seller-hub/listings');
  };

  const hydrated = useHydrated();
  const cameraSupported = hydrated && isCameraCaptureSupported();
  const listingSuggestionsOn = useAIPrefs((s) =>
    aiFeatureOn(s, 'listingSuggestions'),
  );

  const handleListAnother = () => {
    revokeAllUncommitted();
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setDirty(false);
    setDraftSourceId(null);
    resetAutoFill();
    resetPublishState();
    window.scrollTo({ top: 0 });
    if (editing || draftParam) router.push('/sell');
  };

  const steps = computeSellSteps(draft);

  const autoFillProp =
    DATA_MODE === 'live' && hydrated && listingSuggestionsOn
      ? {
          ...autoFill,
          onRun: () => void runAutoFill(),
          onDismiss: () => resetAutoFill(),
          onAccept: acceptSuggestion,
          onDismissField: dismissSuggestion,
          onAcceptAll: acceptAllSuggestions,
        }
      : undefined;

  return {
    router,
    user,
    seller,
    wall,
    editing,
    editLoading,
    editNotFound,
    draftLoading,
    draftNotFound,
    publishedListing,
    handleListAnother,
    previewOpen,
    setPreviewOpen,
    openPreview,
    publishing,
    publishError,
    publish,
    ownListings,
    draft,
    update,
    errors,
    clearError,
    draftSavedVisible,
    saveAndExit,
    bannerDraft,
    handleResume,
    discardDraft,
    lostPhotos,
    setLostPhotos,
    steps,
    cameraSupported,
    cameraOpen,
    setCameraOpen,
    mediaByUrl,
    mediaOf,
    addPhotos,
    removePhoto,
    reorderPhotos,
    retryPhotoUpload,
    applyEditedPhoto,
    editIndex,
    setEditIndex,
    autoFillProp,
  };
}
