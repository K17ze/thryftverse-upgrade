'use client';

/**
 * VisualSearchRegionPicker — honest region-of-interest on the uploaded
 * photo. Drag draws a frame; a tap lands a focus box centred on the tap;
 * committing a region re-extracts colour features from just that area and
 * re-ranks. "Whole image" clears back to the full frame.
 *
 * The overlay covers the rendered <img> exactly (width-constrained natural
 * aspect — no letterbox), so pointer fractions map 1:1 to image fractions.
 */

import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  MIN_REGION_FRACTION,
  TAP_FOCUS_FRACTION,
  type VisualSearchRegion,
} from './visualSearchTypes';

interface VisualSearchRegionPickerProps {
  imageUrl: string;
  region: VisualSearchRegion | null;
  onCommit: (region: VisualSearchRegion | null) => void;
}

interface Point {
  x: number;
  y: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function rectFromPoints(a: Point, b: Point): VisualSearchRegion {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function focusBoxAt(p: Point): VisualSearchRegion {
  const s = TAP_FOCUS_FRACTION;
  return {
    x: Math.min(Math.max(0, p.x - s / 2), 1 - s),
    y: Math.min(Math.max(0, p.y - s / 2), 1 - s),
    width: s,
    height: s,
  };
}

export function VisualSearchRegionPicker({
  imageUrl,
  region,
  onCommit,
}: VisualSearchRegionPickerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<Point | null>(null);
  const [draft, setDraft] = useState<VisualSearchRegion | null>(null);

  const toFraction = useCallback((e: React.PointerEvent): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  const shown = draft ?? region;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = toFraction(e);
    setDraft(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    setDraft(rectFromPoints(start, toFraction(e)));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const end = toFraction(e);
    const drawn = rectFromPoints(start, end);
    // A tap (sub-minimum drag) lands a focus box centred on the point;
    // a real drag commits the drawn frame once it's above the floor.
    const next =
      drawn.width < MIN_REGION_FRACTION && drawn.height < MIN_REGION_FRACTION
        ? focusBoxAt(end)
        : drawn;
    setDraft(null);
    onCommit(next);
  };

  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

  return (
    <div>
      <div
        ref={stageRef}
        aria-label="Frame part of your photo. Drag to draw a region, or tap to focus around a point."
        className="relative w-full touch-none select-none overflow-hidden rounded-lg bg-surface-alt"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startRef.current = null;
          setDraft(null);
        }}
      >
        {/* Plain img — blob previews don't go through next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Your photo — drag to frame a region"
          className="block h-auto w-full"
          draggable={false}
        />
        {shown ? (
          <>
            {/* Scrim outside the frame — four panels, hairline rect. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-overlay" style={{ height: pct(shown.y) }} />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-overlay"
              style={{ top: pct(shown.y + shown.height) }}
            />
            <div
              className="pointer-events-none absolute top-0 bg-overlay"
              style={{ left: 0, width: pct(shown.x), top: pct(shown.y), height: pct(shown.height) }}
            />
            <div
              className="pointer-events-none absolute bg-overlay"
              style={{
                left: pct(shown.x + shown.width),
                right: 0,
                top: pct(shown.y),
                height: pct(shown.height),
              }}
            />
            <div
              className="pointer-events-none absolute border-2 border-scrim-text-primary"
              style={{
                left: pct(shown.x),
                top: pct(shown.y),
                width: pct(shown.width),
                height: pct(shown.height),
              }}
            />
          </>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="tnum text-caption text-text-muted" aria-live="polite">
          {shown
            ? `${Math.round(shown.width * 100)}% × ${Math.round(shown.height * 100)}% framed`
            : 'Drag or tap to frame part of the photo'}
        </p>
        {shown ? (
          <button
            type="button"
            onClick={() => onCommit(null)}
            className="pressable flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-text-secondary hover:text-text-primary"
          >
            <Icon name="close" size={14} />
            Whole image
          </button>
        ) : null}
      </div>
    </div>
  );
}
