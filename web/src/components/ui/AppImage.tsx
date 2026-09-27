'use client';

/**
 * AppImage — CachedImage equivalent for the web.
 * next/image with reserved geometry (aspect-ratio box), focal-point object
 * positioning, blur/LQIP placeholder, fade-in, and premium empty fallback.
 */

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  focalPointToObjectPosition,
  isLocalMediaUri,
  isUsableUri,
} from '@/lib/utils/media';
import { Icon, type AppIconName } from './Icon';

interface AppImageProps {
  src: string | null | undefined;
  alt: string;
  /** width/height ratio (w/h). Reserves the frame before media loads. */
  aspectRatio?: number;
  focalPoint?: { x: number; y: number } | null;
  blurDataURL?: string | null;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
  fallbackIcon?: AppIconName;
  quality?: number;
}

export function AppImage({
  src,
  alt,
  aspectRatio,
  focalPoint,
  blurDataURL,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  className = '',
  imgClassName = '',
  priority,
  fill,
  width,
  height,
  fallbackIcon = 'image',
  quality = 80,
}: AppImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // A new src invalidates the previous load/fail state — without this a
  // failed URI sticks the fallback even after a valid src arrives.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const usable = isUsableUri(src) && !failed;
  const local = usable && isLocalMediaUri(src);

  const objectPosition = focalPointToObjectPosition(focalPoint);

  return (
    <div
      className={`appimg relative overflow-hidden bg-surface-alt ${className}`}
      style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
    >
      {usable ? (
        local ? (
          // Local file picks (blob:/data:) bypass next/image — the optimizer
          // can only fetch http(s) sources and would 500 on these.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`img-fade h-full w-full object-cover ${imgClassName}`}
            style={{
              objectPosition,
              opacity: loaded ? 1 : 0,
            }}
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            fill={fill ?? !width}
            width={!fill && width ? width : undefined}
            height={!fill && height ? height : undefined}
            sizes={sizes}
            quality={quality}
            priority={priority}
            placeholder={blurDataURL ? 'blur' : 'empty'}
            blurDataURL={blurDataURL ?? undefined}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`img-fade object-cover ${imgClassName}`}
            style={{
              objectPosition,
              opacity: loaded ? 1 : 0,
            }}
          />
        )
      ) : (
        // Premium placeholder — quiet geometric frame + icon, never a
        // grey box with text. Same role as mobile's ImageEmptyGraphic.
        <div
          className="flex h-full w-full items-center justify-center bg-surface-alt"
          role="img"
          aria-label={alt}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-text-muted">
            <Icon name={fallbackIcon} size={24} />
          </div>
        </div>
      )}
    </div>
  );
}
