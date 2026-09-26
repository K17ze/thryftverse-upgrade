'use client';

/**
 * Sheet — modal surface: centered dialog on desktop, bottom sheet on mobile.
 * Scrim + focus trap + Escape, mirrors BottomSheet.tsx behaviour.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Max width for the dialog variant. */
  maxWidth?: number;
}

export function Sheet({ open, onClose, title, children, maxWidth = 560 }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal" role="presentation">
      <div
        className="fade-in absolute inset-0 bg-overlay"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="sheet-enter absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-sheet bg-surface shadow-modal outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-border"
        style={{ maxWidth }}
      >
        {title ? (
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
            <IconButton name="close" aria-label="Close" onClick={onClose} className="-mr-2 h-9 w-9" size={20} />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
