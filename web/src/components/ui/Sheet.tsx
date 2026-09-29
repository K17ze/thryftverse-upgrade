'use client';

/**
 * Sheet — modal surface: centered dialog on desktop, bottom sheet on mobile.
 * Scrim + focus trap + Escape, mirrors BottomSheet.tsx behaviour.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';
import { lockBodyScroll } from '@/lib/a11y/scrollLock';
import { trapTabKey } from '@/lib/a11y/focus';

/** Pixels of downward travel that commit a drag to dismiss — under it the
 *  sheet snaps back. Roughly a confident thumb pull, not a scroll graze. */
const DRAG_DISMISS_PX = 96;

interface SheetBaseProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max width for the dialog variant. */
  maxWidth?: number;
}

/** A dialog must always have an accessible name — either the visible
 *  `title` (wired to the header via aria-labelledby) or an `ariaLabel`
 *  for header-less sheets. The union makes one of them required. */
type SheetProps = SheetBaseProps &
  (
    | { title: string; ariaLabel?: string }
    | { title?: string; ariaLabel: string }
  );

export function Sheet({ open, onClose, title, ariaLabel, children, maxWidth = 560 }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Drag-to-dismiss state — the mobile grab handle is a real gesture
  // target, not decoration. Pointer-captured so the drag survives the
  // finger leaving the handle strip.
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Consumers pass inline onClose closures — keep the latest in a ref so
  // a parent re-render swaps the callback without re-running the setup
  // effect below (which would re-focus the dialog and yank focus out of
  // in-sheet inputs — visible with ChatPanel's 15s poll).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Open-transition effect — runs on mount/open only, never on callback
  // identity changes: captures the previously focused element, moves
  // initial focus to the dialog shell, installs the key handler and
  // takes the refcounted scroll lock.
  useEffect(() => {
    if (!open) return;
    setDragY(0);
    setDragging(false);
    drag.current = null;
    const dialog = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    dialog?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Focus trap — the shell is tabIndex=-1 so Shift+Tab from it (or
      // the first focusable) would escape behind the modal; trapTabKey
      // wraps both edges and recovers outside focus.
      if (e.key === 'Tab' && dialog) trapTabKey(e, dialog);
    };
    document.addEventListener('keydown', onKey);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
      prev?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  /** Bottom-sheet gesture: downward drag follows the finger; release past
      DRAG_DISMISS_PX closes, under it snaps back via the transform
      transition. Only the handle strip starts the drag so sheet content
      keeps its normal scroll. Esc and the close button stay the keyboard
      equivalents. */
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, dy: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    drag.current.dy = dy;
    setDragY(dy);
  };
  const onHandlePointerEnd = () => {
    if (!drag.current) return;
    const dy = drag.current.dy;
    drag.current = null;
    setDragging(false);
    if (dy >= DRAG_DISMISS_PX) {
      onClose();
      return;
    }
    setDragY(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-modal" role="presentation">
      <div
        className="fade-in absolute inset-0 bg-overlay"
        onClick={onClose}
        aria-hidden
        style={dragY > 0 ? { opacity: Math.max(0.25, 1 - dragY / 320) } : undefined}
      />
      {/* Entrance wrapper — carries positioning + the sheet-enter
          animation. The drag transform lives on the inner dialog because
          sheet-enter's `both` fill would otherwise pin transform to its
          final keyframe and swallow the gesture. */}
      <div
        className="sheet-enter absolute inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-[var(--sheet-max-w)] sm:-translate-x-1/2 sm:-translate-y-1/2"
        style={{ '--sheet-max-w': `${maxWidth}px` } as React.CSSProperties}
      >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        // A visible title names the dialog by reference (aria-labelledby)
        // so the h2 isn't duplicated as an aria-label string; header-less
        // sheets name it directly via ariaLabel.
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        className="flex max-h-[88dvh] flex-col rounded-t-sheet bg-surface shadow-modal outline-none sm:max-h-[85dvh] sm:rounded-lg sm:border sm:border-border"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          // Snap-back animates on release; while the finger is down the
          // panel tracks it with no lag.
          transition: dragging ? 'none' : 'transform 180ms var(--ease-standard)',
        }}
      >
        {/* Mobile grab handle — real drag-to-dismiss: pull down ≥96px to
            close, shorter pulls snap back. aria-hidden because it's a
            pointer-only gesture; Esc/close button are the equivalents.
            Desktop dialog suppresses it. */}
        <div
          aria-hidden
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerEnd}
          onPointerCancel={onHandlePointerEnd}
          className="flex shrink-0 touch-none cursor-grab justify-center pb-1 pt-2.5 active:cursor-grabbing sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        {title ? (
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <h2 id={titleId} className="text-section-title font-semibold text-text-primary">{title}</h2>
            {/* IconButton keeps its own 44px target — only the glyph size
                is dialled down; never shrink the hit area. */}
            <IconButton name="close" aria-label="Close" onClick={onClose} className="-mr-2" size={20} />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
