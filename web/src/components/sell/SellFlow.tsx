'use client';

/**
 * SellFlow — orchestrator for the guided listing flow.
 * Flat draft, atomic validation, cohesive sections: Photos → Details → Price → Postage → Review.
 *
 * Factored according to the Flagship Anti-AI Charter:
 *  - useSellMediaUpload: media staging, verification, video poster, camera & photo editor
 *  - useListingAutoFill: AI listing intelligence candidate mapping
 *  - useSellPublish: validation, preview mode, idempotent publish pipeline
 *  - SellHeader: top-level title, draft status, and exit actions
 */

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
  MAX_PHOTOS,
  type SellDraft,
  type SellErrors,
} from './constants';
import { SellProgress, computeSellSteps } from './SellProgress';
import { PhotosSection } from './PhotosSection';
import { isCameraCaptureSupported } from '@/lib/media/cameraSupport';
import { DetailsSection } from './DetailsSection';
import { PriceSection } from './PriceSection';
import { PostageSection } from './PostageSection';
import { ReviewSection } from './ReviewSection';
import { SellPreview } from './SellPreview';
import { SellSuccess } from './SellSuccess';
import { DraftResumeBanner } from './DraftResumeBanner';
import { EditListingPicker } from './EditListingPicker';
import { SellHeader } from './SellHeader';
import {
  SellLoadingSkeleton,
  SellLostPhotosAlert,
  SellTargetNotFound,
} from './SellStatusStates';
import { SellFeedPreviewAside } from './SellFeedPreviewAside';
import { SellMediaSheets } from './SellMediaSheets';
import { useSellMediaUpload } from '@/lib/hooks/sell/useSellMediaUpload';
import { useListingAutoFill } from '@/lib/hooks/sell/useListingAutoFill';
import { useSellPublish } from '@/lib/hooks/sell/useSellPublish';
import { useSellHydration } from '@/lib/hooks/sell/useSellHydration';
import { useSellEffects } from '@/lib/hooks/sell/useSellEffects';

export function SellFlow() {
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

  // Assisted AI autofill
  const {
    autoFill,
    runAutoFill,
    resetAutoFill,
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

  if (editLoading) {
    return <SellLoadingSkeleton label="Loading listing" />;
  }

  if (editNotFound) {
    return (
      <SellTargetNotFound
        title="That listing isn’t editable"
        description="It may have sold, been removed, or it isn’t one of yours."
      />
    );
  }

  if (publishedListing) {
    return (
      <SellSuccess
        listing={publishedListing}
        edited={Boolean(editing)}
        onListAnother={() => {
          revokeAllUncommitted();
          setDraft(EMPTY_DRAFT);
          setErrors({});
          setDirty(false);
          setDraftSourceId(null);
          resetAutoFill();
          resetPublishState();
          window.scrollTo({ top: 0 });
          if (editing || draftParam) router.push('/sell');
        }}
      />
    );
  }

  if (draftLoading) {
    return <SellLoadingSkeleton label="Loading draft" />;
  }

  if (draftNotFound) {
    return (
      <SellTargetNotFound
        title="That draft isn’t here anymore"
        description="It may have been published or removed already."
      />
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

  const steps = computeSellSteps(draft);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6 lg:max-w-[1200px]">
      <SellHeader
        editing={editing}
        draftSavedVisible={draftSavedVisible}
        canSaveDraftToShelf={Boolean(user)}
        onSaveAndExit={saveAndExit}
      />

      {bannerDraft ? (
        <DraftResumeBanner
          record={bannerDraft}
          onResume={handleResume}
          onDiscard={discardDraft}
        />
      ) : null}

      <SellLostPhotosAlert
        lostPhotos={lostPhotos}
        onDismiss={() => setLostPhotos(0)}
      />

      {!editing ? <EditListingPicker listings={ownListings} /> : null}

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
                DATA_MODE === 'live'
                  ? {
                      ...autoFill,
                      onRun: () => void runAutoFill(),
                      onDismiss: () => resetAutoFill(),
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

        <SellFeedPreviewAside
          draft={draft}
          seller={seller}
          mediaOf={mediaOf}
          onPreview={openPreview}
        />
      </div>

      <SellMediaSheets
        cameraSupported={cameraSupported}
        cameraOpen={cameraOpen}
        onCloseCamera={() => setCameraOpen(false)}
        onCapture={(files) => {
          addPhotos(files);
          setCameraOpen(false);
        }}
        remainingSlots={Math.max(0, MAX_PHOTOS - draft.photos.length)}
        editIndex={editIndex}
        photos={draft.photos}
        onCloseEditor={() => setEditIndex(null)}
        onApplyEditedPhoto={applyEditedPhoto}
      />
      {wall}
    </div>
  );
}
