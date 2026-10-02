'use client';

import { Icon } from '@/components/ui/Icon';

interface EmptyPhotoDropzoneProps {
  draggingFiles: boolean;
  cameraSupported?: boolean;
  onPick: () => void;
  onTakePhoto?: () => void;
}

export function EmptyPhotoDropzone({
  draggingFiles,
  cameraSupported,
  onPick,
  onTakePhoto,
}: EmptyPhotoDropzoneProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onPick}
        className={`pressable flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center transition-colors ${
          draggingFiles
            ? 'border-text-muted bg-surface-alt'
            : 'border-border hover:border-text-muted'
        }`}
      >
        <Icon name="camera" size={28} className="text-text-muted" />
        <span className="text-body-emphasis font-medium text-text-primary">
          Add photos
        </span>
        <span className="text-caption text-text-muted">
          Drag and drop or browse — good light sells faster
        </span>
      </button>
      {cameraSupported && onTakePhoto ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={onTakePhoto}
            className="pressable flex h-11 items-center gap-2 rounded-md px-3 text-body font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <Icon name="camera" size={18} />
            Take photo
          </button>
        </div>
      ) : null}
    </div>
  );
}
