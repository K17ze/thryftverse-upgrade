'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { lockBodyScroll } from '@/lib/a11y/scrollLock';
import { restoreFocus, trapTabKey } from '@/lib/a11y/focus';

/** Horizontal travel (px) that commits a page change on release. */
const SWIPE_THRESHOLD = 56;
/** Pointer travel below this counts as a click, not a drag. */
const CLICK_SLOP = 6;
/** Fixed magnification step — mirrors the mobile double-tap zoom. */
export const ZOOM_SCALE = 2.5;
/** Arrow-key pan step (px) while zoomed. */
const PAN_STEP = 60;

interface UseLightboxWorkflowProps {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function useLightboxWorkflow({
  images,
  index,
  onIndexChange,
  onClose,
}: UseLightboxWorkflowProps) {
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
  // take the refcounted scroll lock.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      restoreFocus(prev);
    };
  }, []);

  // Keys — same discipline as the Sheet primitive.
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

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0 && !zoomed) {
      const box = stageRef.current?.getBoundingClientRect();
      if (box) zoomInAt({ x: e.clientX - box.left, y: e.clientY - box.top });
    } else if (e.deltaY > 0 && zoomed) {
      resetZoom();
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (box) zoomInAt({ x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return {
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
  };
}
