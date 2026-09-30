'use client';

/**
 * SellMediaSheets — encapsulates dynamically imported CameraSheet and
 * PhotoEditSheet modal studio workflows for SellFlow.
 */

import dynamic from 'next/dynamic';

const CameraSheet = dynamic(
  () => import('@/components/media/CameraSheet').then((m) => m.CameraSheet),
  { ssr: false },
);
const PhotoEditSheet = dynamic(
  () => import('@/components/media/PhotoEditSheet').then((m) => m.PhotoEditSheet),
  { ssr: false },
);

interface SellMediaSheetsProps {
  cameraSupported: boolean;
  cameraOpen: boolean;
  onCloseCamera: () => void;
  onCapture: (files: File[]) => void;
  remainingSlots: number;
  editIndex: number | null;
  photos: string[];
  onCloseEditor: () => void;
  onApplyEditedPhoto: (blob: Blob) => void;
}

export function SellMediaSheets({
  cameraSupported,
  cameraOpen,
  onCloseCamera,
  onCapture,
  remainingSlots,
  editIndex,
  photos,
  onCloseEditor,
  onApplyEditedPhoto,
}: SellMediaSheetsProps) {
  return (
    <>
      {cameraSupported ? (
        <CameraSheet
          open={cameraOpen}
          onClose={onCloseCamera}
          onCapture={onCapture}
          remainingSlots={remainingSlots}
        />
      ) : null}
      <PhotoEditSheet
        open={editIndex != null && editIndex < photos.length}
        src={editIndex != null ? (photos[editIndex] ?? null) : null}
        photoLabel={editIndex != null ? `Photo ${editIndex + 1}` : 'photo'}
        onClose={onCloseEditor}
        onApply={onApplyEditedPhoto}
      />
    </>
  );
}
