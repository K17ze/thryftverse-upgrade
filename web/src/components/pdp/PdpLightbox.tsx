'use client';

/**
 * PdpLightbox — fullscreen photo viewer, dependency-free. Backdrop click
 * and Escape close; ←/→ keys, arrow buttons and horizontal drag/swipe
 * page through photos; a synced thumbnail rail and index counter sit in
 * the bottom chrome — the iOS-Photos grammar the mobile
 * FullscreenMediaViewer uses. Flat overlay, no card surfaces.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppImage } from '@/components/ui/AppImage';
import { IconButton } from '@/components/ui/IconButton';

/** Horizontal travel (px) that commits a page change on release. */
const SWIPE_THRESHOLD = 56;

interface PdpLightboxProps {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  title: string;
  /** Listing-level media ratio — the stage box matches it so photos
   *  are never cropped inside the viewer. */
  aspectRatio: number;
  focalPoint?: { x: number; y: number } | null;
}

export function PdpLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  title,
  aspectRatio,
  focalPoint,
}: PdpLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const count = images.length;
  const current = Math.min(Math.max(index, 0), Math.max(0, count - 1));

  const step = useCallback(
    (dir: 1 | -1) => {
      if (count < 2) return;
      onIndexChange((current + dir + count) % count);
    },
    [count, current, onIndexChange],
  );

  // Focus, keys and scroll lock — same discipline as the Sheet primitive.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [onClose, step]);

  // Keep the active thumbnail inside the rail's viewport.
  useEffect(() => {
    railRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  // ── Drag/swipe paging — pointer events cover mouse and touch;
  //    touch-action: pan-y keeps vertical page gestures native. ──
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (count < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragStartX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    const raw = e.clientX - dragStartX.current;
    // Rubber-band: travel response softens so edges feel physical.
    setDragX(Math.sign(raw) * Math.min(Math.abs(raw) * 0.6, 140));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    setDragging(false);
    setDragX(0);
    if (Math.abs(delta) > SWIPE_THRESHOLD) step(delta < 0 ? 1 : -1);
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — photo ${current + 1} of ${count}`}
      tabIndex={-1}
      className="fixed inset-0 z-modal flex flex-col bg-overlay outline-none"
      onClick={onClose}
    >
      <IconButton
        name="close"
        aria-label="Close photo viewer"
        onMedia
        onClick={onClose}
        className="absolute right-2 top-2 z-10 sm:right-4 sm:top-4"
      />

      {/* Stage — box matches the media ratio so the photo is never
          cropped; width is capped by both viewport edges and the height
          budget left above the thumbnail chrome. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-16">
        <div
          className="touch-pan-y select-none"
          style={{
            width: `min(92vw, max(240px, calc((100dvh - 12rem) * ${aspectRatio})))`,
            transform: dragX ? `translateX(${dragX}px)` : undefined,
            transition: dragging ? 'none' : 'transform 180ms ease-out',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDragStart={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <AppImage
            src={images[current]}
            alt={`${title} — photo ${current + 1} of ${count}`}
            aspectRatio={aspectRatio}
            focalPoint={focalPoint}
            sizes="92vw"
            quality={90}
            className="w-full rounded-lg"
          />
        </div>
      </div>

      {count > 1 ? (
        <>
          <IconButton
            name="back"
            aria-label="Previous photo"
            onMedia
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex"
          />
          <IconButton
            name="forward"
            aria-label="Next photo"
            onMedia
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex"
          />
        </>
      ) : null}

      {/* Bottom chrome — thumbnail rail + index counter */}
      <div
        className="flex flex-col items-center gap-2 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        {count > 1 ? (
          <div
            ref={railRef}
            className="no-scrollbar flex max-w-full gap-2 overflow-x-auto px-4"
            role="tablist"
            aria-label="Item photos"
          >
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                role="tab"
                aria-selected={i === current}
                aria-label={`Photo ${i + 1}`}
                onClick={() => onIndexChange(i)}
                className={`pressable relative h-14 w-11 shrink-0 overflow-hidden rounded-md ${
                  i === current
                    ? 'ring-2 ring-scrim-text-primary'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                <AppImage src={src} alt="" aspectRatio={0.8} sizes="44px" className="h-full w-full" />
              </button>
            ))}
          </div>
        ) : null}
        <span className="tnum text-caption font-medium text-scrim-text-secondary">
          {current + 1} / {count}
        </span>
      </div>
    </div>,
    document.body,
  );
}
