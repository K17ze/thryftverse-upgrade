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

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppImage } from '@/components/ui/AppImage';
import { IconButton } from '@/components/ui/IconButton';
import { lockBodyScroll } from '@/lib/a11y/scrollLock';
import { trapTabKey } from '@/lib/a11y/focus';

/** Horizontal travel (px) that commits a page change on release. */
const SWIPE_THRESHOLD = 56;
/** Pointer travel below this counts as a click, not a drag. */
const CLICK_SLOP = 6;
/** Fixed magnification step — mirrors the mobile double-tap zoom. */
const ZOOM_SCALE = 2.5;
/** Arrow-key pan step (px) while zoomed. */
const PAN_STEP = 60;

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
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  /** Transform origin (px inside the stage box) the zoom anchors at. */
  const [zoomOrigin, setZoomOrigin] = useState({ x: 0, y: 0 });
  /** Post-scale translate (px) — the pan offset, clamped to the box. */
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const count = images.length;
  const current = Math.min(Math.max(index, 0), Math.max(0, count - 1));

  const step = useCallback(
    (dir: 1 | -1) => {
      if (count < 2) return;
      onIndexChange((current + dir + count) % count);
    },
    [count, current, onIndexChange],
  );

  const resetZoom = useCallback(() => {
    setZoomed(false);
    setPan({ x: 0, y: 0 });
  }, []);

  /** Clamp a pan offset so the scaled photo still covers the stage box:
   *  tx ∈ [(s−1)(ox−W), (s−1)·ox] — same bound on y. */
  const clampPan = useCallback(
    (x: number, y: number, origin = zoomOrigin): { x: number; y: number } => {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box) return { x: 0, y: 0 };
      const s = ZOOM_SCALE - 1;
      const minX = s * (origin.x - box.width);
      const maxX = s * origin.x;
      const minY = s * (origin.y - box.height);
      const maxY = s * origin.y;
      return {
        x: Math.min(maxX, Math.max(minX, x)),
        y: Math.min(maxY, Math.max(minY, y)),
      };
    },
    [zoomOrigin],
  );

  const zoomInAt = useCallback(
    (point?: { x: number; y: number }) => {
      const box = stageRef.current?.getBoundingClientRect();
      const origin =
        point ??
        (box ? { x: box.width / 2, y: box.height / 2 } : { x: 0, y: 0 });
      setZoomOrigin(origin);
      setPan(clampPan(0, 0, origin));
      setZoomed(true);
    },
    [clampPan],
  );

  const toggleZoomAt = useCallback(
    (point: { x: number; y: number }) => {
      if (zoomed) resetZoom();
      else zoomInAt(point);
    },
    [zoomed, zoomInAt, resetZoom],
  );

  // A page change always returns to fit — zoom never leaks across photos.
  useEffect(() => {
    resetZoom();
  }, [current, resetZoom]);

  // Mount-only: capture the opener's focus, move it into the dialog and
  // take the refcounted scroll lock. Kept separate from the key-handler
  // effect so zoom/index dependency changes don't tear down and re-focus
  // (which would steal focus from zoom/paging controls mid-interaction).
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      prev?.focus({ preventScroll: true });
    };
  }, []);

  // Keys — same discipline as the Sheet primitive. Re-bound when zoom or
  // paging deps change; no focus churn. Zoomed: arrows pan, +/z zoom in,
  // −/0 zoom out; unzoomed: arrows page. Tab/Shift+Tab are trapped —
  // aria-modal claims a modal, so focus must never reach the page.
  useEffect(() => {
    const dialog = dialogRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (dialog) trapTabKey(e, dialog);
        return;
      }
      if (e.key === 'Escape') {
        if (zoomed) resetZoom();
        else onClose();
        return;
      }
      if (e.key === '+' || e.key === '=' || e.key === 'z' || e.key === 'Z') {
        zoomInAt();
        return;
      }
      if (e.key === '-' || e.key === '_' || e.key === '0') {
        resetZoom();
        return;
      }
      if (zoomed) {
        const d =
          e.key === 'ArrowRight'
            ? { x: -PAN_STEP, y: 0 }
            : e.key === 'ArrowLeft'
              ? { x: PAN_STEP, y: 0 }
              : e.key === 'ArrowUp'
                ? { x: 0, y: PAN_STEP }
                : e.key === 'ArrowDown'
                  ? { x: 0, y: -PAN_STEP }
                  : null;
        if (d) {
          e.preventDefault();
          setPan((p) => clampPan(p.x + d.x, p.y + d.y));
        }
        return;
      }
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step, zoomed, zoomInAt, resetZoom, clampPan]);

  // Keep the active thumbnail inside the rail's viewport.
  useEffect(() => {
    railRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  // ── Pointer gestures — unzoomed: horizontal swipe pages, click zooms in
  //    at the pointer; zoomed: drag pans, click zooms back out. Pointer
  //    events cover mouse and touch; touch-action: pan-y keeps vertical
  //    page gestures native while unzoomed (none while zoomed so pan wins).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.abs(dx) + Math.abs(dy) > CLICK_SLOP) g.moved = true;
    if (zoomed) {
      setPan(clampPan(g.startPanX + dx, g.startPanY + dy));
      return;
    }
    if (count < 2) return;
    // Rubber-band: travel response softens so edges feel physical.
    setDragX(Math.sign(dx) * Math.min(Math.abs(dx) * 0.6, 140));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setDragging(false);
    setDragX(0);
    if (!g.moved) {
      // A click, not a drag — toggle magnification anchored at the pointer.
      const box = stageRef.current?.getBoundingClientRect();
      if (box) {
        toggleZoomAt({ x: e.clientX - box.left, y: e.clientY - box.top });
      }
      return;
    }
    if (zoomed) return; // pan already applied during move
    const delta = e.clientX - g.startX;
    if (Math.abs(delta) > SWIPE_THRESHOLD) step(delta < 0 ? 1 : -1);
  };

  /** Wheel: scroll up magnifies at the cursor, scroll down returns to fit. */
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0 && !zoomed) {
      const box = stageRef.current?.getBoundingClientRect();
      if (box) zoomInAt({ x: e.clientX - box.left, y: e.clientY - box.top });
    } else if (e.deltaY > 0 && zoomed) {
      resetZoom();
    }
  };

  /** Double-click — desktop photo-viewer grammar: always lands zoomed at
   *  the pointer. The two constituent clicks already toggled in/out;
   *  this settles the gesture on the zoomed state. */
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (box) zoomInAt({ x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — photo ${current + 1} of ${count}${zoomed ? ', zoomed in' : ''}`}
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
            transition: dragging ? 'none' : 'transform 180ms var(--ease-standard)',
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
              transition: dragging ? 'none' : 'transform 200ms var(--ease-standard)',
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
            role="group"
            aria-label="Item photos"
          >
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                aria-pressed={i === current}
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
          {current + 1} / {count}{zoomed ? ` · ${ZOOM_SCALE}×` : ''}
        </span>
      </div>
    </div>,
    document.body,
  );
}
