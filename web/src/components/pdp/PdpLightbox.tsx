'use client';

/**
 * PdpLightbox — fullscreen photo viewer, dependency-free. Backdrop click
 * and Escape close; ←/→ keys, arrow buttons and horizontal drag/swipe
 * page through photos; a synced thumbnail rail and index counter sit in
 * the bottom chrome — the iOS-Photos grammar the mobile
 * FullscreenMediaViewer uses.
 *
 * Magnification is real: click the photo (or press +/Z, wheel up, or the
 * zoom control) to zoom 2.5× anchored at the pointer, drag to pan, arrows
 * pan while zoomed, Escape/−/0 or click returns to fit. The zoom-in cursor
 * is honest now — it maps to actual magnification, not just enlargement.
 */

import { createPortal } from 'react-dom';
import { AppImage } from '@/components/ui/AppImage';
import { IconButton } from '@/components/ui/IconButton';
import { useLightboxWorkflow, ZOOM_SCALE } from './useLightboxWorkflow';
import { LightboxBottomBar } from './LightboxBottomBar';

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
  const {
    dialogRef,
    railRef,
    stageRef,
    current,
    count,
    dragX,
    dragging,
    zoomed,
    zoomOrigin,
    pan,
    step,
    resetZoom,
    zoomInAt,
    onPointerDown,
    onPointerMove,
    endDrag,
    onWheel,
    onDoubleClick,
  } = useLightboxWorkflow({
    images,
    index,
    onIndexChange,
    onClose,
  });

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — photo ${current + 1} of ${count}${
        zoomed ? ', zoomed in' : ''
      }`}
      tabIndex={-1}
      className="fixed inset-0 z-modal flex flex-col bg-overlay outline-none"
      onClick={onClose}
    >
      <IconButton
        name={zoomed ? 'remove' : 'plus'}
        aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
        aria-pressed={zoomed}
        onMedia
        onClick={(e) => {
          e.stopPropagation();
          if (zoomed) resetZoom();
          else zoomInAt();
        }}
        className="absolute right-14 top-2 z-elevated sm:right-16 sm:top-4"
      />
      <IconButton
        name="close"
        aria-label="Close photo viewer"
        onMedia
        onClick={onClose}
        className="absolute right-2 top-2 z-elevated sm:right-4 sm:top-4"
      />

      {/* Stage — box matches the media ratio so the photo is never
          cropped; width is capped by both viewport edges and the height
          budget left above the thumbnail chrome. overflow-hidden clips the
          magnified frame inside the box. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-16">
        <div
          ref={stageRef}
          className={`select-none overflow-hidden ${
            zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
          } ${zoomed ? 'touch-none' : 'touch-pan-y'}`}
          style={{
            width: `min(92vw, max(240px, calc((100dvh - 12rem) * ${aspectRatio})))`,
            transform: !zoomed && dragX ? `translateX(${dragX}px)` : undefined,
            transition: dragging
              ? 'none'
              : 'transform 180ms var(--ease-standard)',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
          onDragStart={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              transform: zoomed
                ? `translate(${pan.x}px, ${pan.y}px) scale(${ZOOM_SCALE})`
                : undefined,
              transformOrigin: `${zoomOrigin.x}px ${zoomOrigin.y}px`,
              transition: dragging
                ? 'none'
                : 'transform 200ms var(--ease-standard)',
            }}
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
      </div>

      {/* Paging controls hide while zoomed — the photo owns the stage. */}
      {count > 1 && !zoomed ? (
        <>
          <IconButton
            name="back"
            aria-label="Previous photo"
            onMedia
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 max-sm:hidden"
          />
          <IconButton
            name="forward"
            aria-label="Next photo"
            onMedia
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 max-sm:hidden"
          />
        </>
      ) : null}

      {/* Bottom chrome — thumbnail rail + index counter */}
      <LightboxBottomBar
        railRef={railRef}
        images={images}
        current={current}
        count={count}
        zoomed={zoomed}
        onSelectIndex={onIndexChange}
      />
    </div>,
    document.body,
  );
}
