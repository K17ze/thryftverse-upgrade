'use client';

/**
 * SellFlow — orchestrator for the guided listing flow.
 * Flat draft, atomic validation, cohesive sections: Photos → Details → Price → Postage → Review.
 *
 * Factored according to the Flagship Anti-AI Charter:
 *  - useSellFlowWorkflow: media staging, persistence, intelligence, and publish orchestration
 *  - SellHeader: top-level title, draft status, and exit actions
 *  - Section subcomponents: PhotosSection, DetailsSection, PriceSection, PostageSection, ReviewSection
 */

import { MAX_PHOTOS } from './constants';
import { SellProgress } from './SellProgress';
import { PhotosSection } from './PhotosSection';
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
import { useSellFlowWorkflow } from './useSellFlowWorkflow';

export function SellFlow() {
  const {
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
  } = useSellFlowWorkflow();

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
        onListAnother={handleListAnother}
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
              autoFill={autoFillProp}
              onAdd={addPhotos}
              onRemove={removePhoto}
              onReorder={reorderPhotos}
              onEdit={setEditIndex}
              onRetryUpload={retryPhotoUpload}
              onTakePhoto={() => setCameraOpen(true)}
            />
            <DetailsSection
              draft={draft}
              errors={errors}
              update={update}
              clearError={clearError}
            />
            <PriceSection
              draft={draft}
              errors={errors}
              update={update}
              clearError={clearError}
            />
            <PostageSection draft={draft} update={update} />
            <ReviewSection
              draft={draft}
              editing={editing != null}
              onPreview={openPreview}
            />
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
