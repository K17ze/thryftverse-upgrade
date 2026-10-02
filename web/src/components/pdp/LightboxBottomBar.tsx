'use client';

import { type RefObject } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { ZOOM_SCALE } from './useLightboxWorkflow';

interface LightboxBottomBarProps {
  railRef: RefObject<HTMLDivElement | null>;
  images: string[];
  current: number;
  count: number;
  zoomed: boolean;
  onSelectIndex: (index: number) => void;
}

export function LightboxBottomBar({
  railRef,
  images,
  current,
  count,
  zoomed,
  onSelectIndex,
}: LightboxBottomBarProps) {
  return (
    <div
      className="flex flex-col items-center gap-2 pb-4"
      onClick={(e) => e.stopPropagation()}
    >
      {count > 1 ? (
        <div
          ref={railRef}
          className="no-scrollbar flex max-w-full gap-2 overflow-x-auto px-4"
          role="group"
          aria-label="Item photos"
        >
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              aria-pressed={i === current}
              aria-label={`Photo ${i + 1}`}
              onClick={() => onSelectIndex(i)}
              className={`pressable relative h-14 w-11 shrink-0 overflow-hidden rounded-md ${
                i === current
                  ? 'ring-2 ring-scrim-text-primary'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <AppImage
                src={src}
                alt=""
                aspectRatio={0.8}
                sizes="44px"
                className="h-full w-full"
              />
            </button>
          ))}
        </div>
      ) : null}
      <span className="tnum text-caption font-medium text-scrim-text-secondary">
        {current + 1} / {count}
        {zoomed ? ` · ${ZOOM_SCALE}×` : ''}
      </span>
    </div>
  );
}
