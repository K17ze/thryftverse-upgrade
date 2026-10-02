'use client';

import { useRef } from 'react';
import {
  MIN_CROP_FRACTION,
  type CropRect,
} from '@/lib/media/imageEdit';

const HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
type Handle = (typeof HANDLES)[number] | 'move';

export interface CropOverlayProps {
  rect: CropRect;
  /** Fixed w/h aspect in real pixels, or null for free resize. */
  aspect: number | null;
  frameWidth: number;
  frameHeight: number;
  onChange: (rect: CropRect) => void;
}

export function CropOverlay({ rect, aspect, frameWidth, frameHeight, onChange }: CropOverlayProps) {
  const drag = useRef<{
    mode: Handle;
    startX: number;
    startY: number;
    rect: CropRect;
    box: DOMRect;
  } | null>(null);

  const startDrag = (mode: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // The overlay parent is exactly the canvas box — its rect is the
    // normalized coordinate space the crop is expressed in.
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, rect, box };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const applyDelta = (dxn: number, dyn: number) => {
    const d = drag.current;
    if (!d || !frameWidth || !frameHeight) return;
    const r = d.rect;
    const min = MIN_CROP_FRACTION;
    const right = r.x + r.width;
    const bottom = r.y + r.height;
    // Pixel-space aspect → normalized height per unit of normalized width.
    const hPerW = aspect != null ? frameWidth / (aspect * frameHeight) : null;

    if (d.mode === 'move') {
      onChange({
        x: Math.min(Math.max(r.x + dxn, 0), 1 - r.width),
        y: Math.min(Math.max(r.y + dyn, 0), 1 - r.height),
        width: r.width,
        height: r.height,
      });
      return;
    }

    // Every corner anchors its opposite corner. Width deltas drive the
    // resize; with a locked aspect, height follows in real proportions and
    // clamps back into the frame.
    let w = r.width;
    let h = r.height;
    const east = d.mode === 'ne' || d.mode === 'se';
    const south = d.mode === 'sw' || d.mode === 'se';

    const wLimit = east ? 1 - r.x : right;
    w = Math.min(Math.max(east ? r.width + dxn : r.width - dxn, min), wLimit);
    if (hPerW != null) {
      const hLimit = south ? 1 - r.y : bottom;
      h = Math.min(w * hPerW, hLimit);
      w = (h / hPerW);
      w = Math.min(Math.max(w, min), wLimit);
      h = w * hPerW;
    } else {
      const hLimit = south ? 1 - r.y : bottom;
      h = Math.min(Math.max(south ? r.height + dyn : r.height - dyn, min), hLimit);
    }

    onChange({
      x: east ? r.x : right - w,
      y: south ? r.y : bottom - h,
      width: w,
      height: h,
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    applyDelta(
      (e.clientX - d.startX) / d.box.width,
      (e.clientY - d.startY) / d.box.height,
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  /* Keyboard equivalent — the crop frame is focusable: arrows nudge it,
   * Shift+arrow grows it from the bottom-right corner, Alt+arrow shrinks.
   * Announced via the tile's aria-label; the parent live region reports. */
  const onFrameKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey || e.altKey ? 0.02 : 0.01;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    const [dx, dy] = dir;
    if (e.shiftKey || e.altKey) {
      const sign = e.altKey ? -1 : 1;
      drag.current = {
        mode: 'se',
        startX: 0,
        startY: 0,
        rect,
        box: { width: 1, height: 1 } as DOMRect,
      };
      applyDelta(sign * step * dx, sign * step * dy);
      drag.current = null;
      return;
    }
    onChange({
      x: Math.min(Math.max(rect.x + dx * step, 0), 1 - rect.width),
      y: Math.min(Math.max(rect.y + dy * step, 0), 1 - rect.height),
      width: rect.width,
      height: rect.height,
    });
  };

  const handleStyle = (corner: (typeof HANDLES)[number]): React.CSSProperties => ({
    left: corner.includes('w') ? `${rect.x * 100}%` : undefined,
    right: corner.includes('e') ? `${100 - (rect.x + rect.width) * 100}%` : undefined,
    top: corner.includes('n') ? `${rect.y * 100}%` : undefined,
    bottom: corner.includes('s') ? `${100 - (rect.y + rect.height) * 100}%` : undefined,
    transform:
      `${corner.includes('w') ? 'translateX(-50%)' : 'translateX(50%)'} ` +
      `${corner.includes('n') ? 'translateY(-50%)' : 'translateY(50%)'}`,
  });

  const handleCursor: Record<(typeof HANDLES)[number], string> = {
    nw: 'cursor-nwse-resize',
    ne: 'cursor-nesw-resize',
    sw: 'cursor-nesw-resize',
    se: 'cursor-nwse-resize',
  };

  return (
    <div className="absolute inset-0">
      {/* Crop frame — everything outside is dimmed via the box-shadow. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Crop area — arrow keys move it, Shift plus arrows resizes, Alt plus arrows shrinks"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(rect.width * 100)}
        aria-valuetext={`crop covers ${Math.round(rect.width * 100)} by ${Math.round(rect.height * 100)} percent of the photo`}
        onKeyDown={onFrameKeyDown}
        onPointerDown={startDrag('move')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute cursor-move touch-none rounded-[2px] border-2 border-white/80 outline-none focus-visible:border-white"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)',
        }}
      >
        {/* Rule-of-thirds guides — hairlines, like the mobile crop grid. */}
        <span className="absolute inset-y-0 left-1/3 w-px bg-white/40" aria-hidden />
        <span className="absolute inset-y-0 left-2/3 w-px bg-white/40" aria-hidden />
        <span className="absolute inset-x-0 top-1/3 h-px bg-white/40" aria-hidden />
        <span className="absolute inset-x-0 top-2/3 h-px bg-white/40" aria-hidden />
      </div>
      {HANDLES.map((corner) => (
        <div
          key={corner}
          aria-hidden
          onPointerDown={startDrag(corner)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`absolute flex h-11 w-11 touch-none items-center justify-center ${handleCursor[corner]}`}
          style={handleStyle(corner)}
        >
          <span className="h-3 w-3 rounded-full border border-black/20 bg-white" />
        </div>
      ))}
    </div>
  );
}
