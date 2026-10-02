'use client';

import { Icon } from '@/components/ui/Icon';

interface PhotoActionRowProps {
  canAdd: boolean;
  cameraSupported?: boolean;
  onPick: () => void;
  onTakePhoto?: () => void;
}

export function PhotoActionRow({
  canAdd,
  cameraSupported,
  onPick,
  onTakePhoto,
}: PhotoActionRowProps) {
  if (!canAdd) return null;

  return (
    <div className="mt-3 flex items-center gap-4">
      <button
        type="button"
        onClick={onPick}
        className="pressable flex h-11 items-center gap-2 rounded-md text-body font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <Icon name="images" size={16} />
        Add more
      </button>
      {cameraSupported && onTakePhoto ? (
        <button
          type="button"
          onClick={onTakePhoto}
          className="pressable flex h-11 items-center gap-2 rounded-md text-body font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <Icon name="camera" size={16} />
          Take photo
        </button>
      ) : null}
    </div>
  );
}
