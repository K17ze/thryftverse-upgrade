'use client';

import { AppImage } from './AppImage';
import { FACE_FOCAL_POINT, isUsableUri } from '@/lib/utils/media';
import { Icon } from './Icon';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}

/** Avatar — circular identity image with initials/person fallback. */
export function Avatar({ src, name, size = 40, className = '', ring }: AvatarProps) {
  const initials = (name ?? '')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${ring ? 'ring-2 ring-text-primary' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      {isUsableUri(src) ? (
        <AppImage
          src={src}
          alt={name ?? 'Avatar'}
          fill
          focalPoint={FACE_FOCAL_POINT}
          sizes={`${size}px`}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-alt text-text-muted">
          {initials ? (
            <span className="font-bold" style={{ fontSize: size * 0.34 }}>
              {initials}
            </span>
          ) : (
            <Icon name="profile" size={size * 0.5} filled />
          )}
        </div>
      )}
    </div>
  );
}
