'use client';

/**
 * LookTagCanvas — the free-position pin layer over the look's cover media.
 *
 * Pins are normalised x/y fractions of the frame, so the detail surface can
 * re-render them against any crop — the same contract the mobile look
 * editor's canvas stage persists.
 *
 * Interaction model (pick → place → arrange):
 *  - Picking a listing in TagSheet drops its pin at the frame centre with a
 *    deterministic jitter (stable per listing) plus a short de-collision
 *    walk, so pins never land exactly stacked. The new pin is auto-selected
 *    so the member sees which pin is theirs to place.
 *  - Pointer-drag a pin to move it — the position writes back as the same
 *    normalised x/y the publish payload already carries.
 *  - Click selects a pin: the callout shows the piece's name/price and a
 *    remove affordance. Hover (or keyboard focus) previews the callout.
 *  - Keyboard: a focused pin nudges ~2% of the frame per arrow key
 *    (Shift+Arrow takes a coarse step); Delete/Backspace removes it;
 *    Escape deselects.
 */

import { useEffect, useRef, useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import type { LookTagInput } from '@/lib/api/services/creator';
import { formatPrice } from '@/lib/utils/format';
import { Icon } from '@/components/ui/Icon';

/** Pins keep this much breathing room from the frame edge — the marker is
 *  centred on its point, so the margin keeps the visible dot inside the
 *  media and clear of the replace/remove corner controls. */
const EDGE = 0.05;
/** Arrow-key nudge: ~2% of the frame; Shift+Arrow takes a coarse step. */
const NUDGE = 0.02;
const NUDGE_COARSE = 0.08;
/** Pointer travel that commits a press to a drag — under it the press is a
 *  click (select / deselect). */
const DRAG_PX = 5;
/** Pins this close (in either axis) count as stacked for the de-collision
 *  walk on drop. */
const OVERLAP_X = 0.05;
const OVERLAP_Y = 0.06;

const clampPos = (v: number) => Math.min(1 - EDGE, Math.max(EDGE, v));

/** Drop spot for a newly tagged piece: frame centre + a deterministic
 *  jitter hashed from the listing id, then a widening de-collision walk so
 *  pins never land exactly on top of each other. Deterministic means
 *  re-tagging the same piece lands in the same place. */
export function initialPinPosition(
  tags: ReadonlyArray<Pick<LookTagInput, 'x' | 'y'>>,
  listingId: string,
): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < listingId.length; i += 1) {
    h = (h * 31 + listingId.charCodeAt(i)) >>> 0;
  }
  let x = clampPos(0.5 + ((h % 100) / 100 - 0.5) * 0.26);
  let y = clampPos(0.55 + (((h >> 7) % 100) / 100 - 0.5) * 0.18);
  for (let step = 0; step < 10; step += 1) {
    const stacked = tags.some(
      (t) => Math.abs(t.x - x) < OVERLAP_X && Math.abs(t.y - y) < OVERLAP_Y,
    );
    if (!stacked) break;
    x = clampPos(x + (step % 2 === 0 ? 1 : -1) * (0.08 + step * 0.01));
    y = clampPos(y + 0.07);
  }
  return { x, y };
}

interface LookTagCanvasProps {
  tags: LookTagInput[];
  /** Resolve a tagged listing for the callout's price — falls back to the
   *  stored label alone when the listing isn't loaded (resumed draft, or
   *  the piece was unlisted since tagging). */
  resolveListing?: (listingId: string | undefined) => Listing | undefined;
  disabled?: boolean;
  /** Commits a moved pin — writes normalised x/y straight into the tag. */
  onMove: (tagId: string, x: number, y: number) => void;
  onRemove: (tagId: string) => void;
}

export function LookTagCanvas({ tags, resolveListing, disabled, onMove, onRemove }: LookTagCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{
    tagId: string;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  /** A drag that committed suppresses the click that follows pointer-up. */
  const suppressClickRef = useRef<string | null>(null);
  /** Whether the pressed pin was already selected when the press began —
   *  pointer-down focuses the button (which selects it) before click fires,
   *  so the click must not immediately undo a selection it just caused. */
  const pressedSelectedRef = useRef(false);
  /** Tag ids already seen — lets the canvas auto-select the pin that was
   *  just added without selecting anything on first paint. */
  const knownRef = useRef<Set<string>>(new Set(tags.map((t) => t.id)));

  useEffect(() => {
    const added = tags.find((t) => !knownRef.current.has(t.id));
    knownRef.current = new Set(tags.map((t) => t.id));
    if (added) setSelectedId(added.id);
    setSelectedId((cur) => (cur && !tags.some((t) => t.id === cur) ? null : cur));
  }, [tags]);

  const moveFromPointer = (tagId: string, clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    onMove(
      tagId,
      clampPos((clientX - rect.left) / rect.width),
      clampPos((clientY - rect.top) / rect.height),
    );
  };

  return (
    // The layer itself is pointer-transparent so media controls (video
    // playback, replace/remove) stay reachable — only the pins take events.
    <div
      ref={stageRef}
      role="group"
      aria-label="Tagged pieces on the cover"
      className="pointer-events-none absolute inset-0"
    >
      <p id="look-pin-hint" className="sr-only">
        Drag a pin to reposition it on the cover. With a pin focused, arrow keys nudge it and Delete
        removes it.
      </p>

      {tags.length === 0 ? (
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-media-overlay-scrim px-3 py-1.5 text-caption text-scrim-text-secondary">
            <Icon name="pricetag" size={13} className="text-scrim-text-secondary" />
            Tag pieces below — each pin lands on the photo
          </span>
        </div>
      ) : null}

      {tags.map((tag) => {
        const listing = resolveListing?.(tag.listingId);
        const price = listing ? formatPrice(listing.price) : '';
        const selected = tag.id === selectedId;
        const dragging = tag.id === draggingId;
        // Callout placement: flips below the pin near the top edge, and
        // hugs the frame side near the left/right edges so it never clips.
        const flip = tag.y < 0.3;
        const align = tag.x < 0.26 ? 'left' : tag.x > 0.74 ? 'right' : 'center';

        const beginDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
          if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
          pressedSelectedRef.current = selectedId === tag.id;
          // A cancelled drag leaves a stale suppress flag (no click follows
          // pointercancel) — a fresh press clears it before it can swallow
          // a genuine click.
          suppressClickRef.current = null;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = {
            tagId: tag.id,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
          };
        };

        const trackDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
          const d = dragRef.current;
          if (!d || d.tagId !== tag.id || d.pointerId !== e.pointerId) return;
          if (!d.moved) {
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_PX) return;
            d.moved = true;
            setDraggingId(tag.id);
            setSelectedId(tag.id);
          }
          moveFromPointer(tag.id, e.clientX, e.clientY);
        };

        const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
          const d = dragRef.current;
          if (!d || d.tagId !== tag.id || d.pointerId !== e.pointerId) return;
          if (d.moved) suppressClickRef.current = tag.id;
          dragRef.current = null;
          setDraggingId(null);
        };

        const nudge = (e: React.KeyboardEvent<HTMLButtonElement>) => {
          const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowLeft') dx = -step;
          else if (e.key === 'ArrowRight') dx = step;
          else if (e.key === 'ArrowUp') dy = -step;
          else if (e.key === 'ArrowDown') dy = step;
          else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            onRemove(tag.id);
            return;
          } else if (e.key === 'Escape') {
            setSelectedId(null);
            e.currentTarget.blur();
            return;
          } else {
            return;
          }
          e.preventDefault();
          onMove(tag.id, clampPos(tag.x + dx), clampPos(tag.y + dy));
        };

        return (
          <div
            key={tag.id}
            className="group absolute"
            style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
          >
            {/* 40px hit target around a 14px marker — the visible shape is
                the look-book dot, not the touch area. */}
            <button
              type="button"
              disabled={disabled}
              aria-label={`${tag.label ?? 'Listing'} pin`}
              aria-describedby="look-pin-hint"
              title="Drag to reposition"
              onPointerDown={beginDrag}
              onPointerMove={trackDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => {
                if (suppressClickRef.current === tag.id) {
                  suppressClickRef.current = null;
                  return;
                }
                // Pointer clicks: a press on an unselected pin selects via
                // focus, so this click keeps it; a press on an already
                // selected pin deselects. Keyboard Enter falls here too —
                // idempotent select (Escape is the keyboard deselect).
                if (pressedSelectedRef.current) {
                  setSelectedId(null);
                } else {
                  setSelectedId(tag.id);
                }
                pressedSelectedRef.current = false;
              }}
              onFocus={() => setSelectedId(tag.id)}
              onKeyDown={nudge}
              className={`pointer-events-auto flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-scrim-text-primary ${
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full bg-media-overlay-scrim transition-transform ${
                  selected
                    ? 'scale-110 ring-2 ring-scrim-text-primary'
                    : 'ring-1 ring-scrim-text-tertiary'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-scrim-text-primary" />
              </span>
            </button>

            {/* Callout — name + price; the remove affordance is only live
                once the pin is selected (hover/focus is a preview). */}
            <div
              aria-hidden={!selected}
              className={`absolute z-10 transition-opacity ${
                flip ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
              } ${
                align === 'left'
                  ? '-left-2'
                  : align === 'right'
                    ? '-right-2'
                    : 'left-1/2 -translate-x-1/2'
              } ${
                selected
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
            >
              <div className="flex items-center gap-2 rounded-md bg-media-overlay-scrim px-2.5 py-1.5">
                <span className="min-w-0">
                  <span className="block max-w-[180px] truncate text-caption font-medium text-scrim-text-primary">
                    {tag.label ?? 'Listing'}
                  </span>
                  {price ? (
                    <span className="tnum block text-meta text-scrim-text-secondary">{price}</span>
                  ) : null}
                </span>
                {selected ? (
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag.label ?? 'listing'}`}
                    onClick={() => onRemove(tag.id)}
                    className="pressable flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-scrim-text-secondary transition-colors hover:text-scrim-text-primary"
                  >
                    <Icon name="close" size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
