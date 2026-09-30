'use client';

/**
 * QuickReplyMenu — role-scoped saved replies popover for marketplace chats.
 * Provides accessible menu semantics, keyboard navigation (Escape, Tab, Enter),
 * and direct deep link to manage templates in seller-hub.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { IconButton } from '@/components/ui/IconButton';

interface QuickReplyItem {
  id: string;
  title: string;
  message: string;
}

interface QuickReplyMenuProps {
  replies: QuickReplyItem[];
  disabled?: boolean;
  onSelect: (message: string) => void;
}

export function QuickReplyMenu({
  replies,
  disabled = false,
  onSelect,
}: QuickReplyMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    wrapRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <IconButton
        ref={btnRef}
        name="zap"
        aria-label="Quick replies"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
      />
      {open ? (
        <div
          role="menu"
          onKeyDown={(e) => {
            if (e.key !== 'Tab') return;
            setOpen(false);
            btnRef.current?.focus();
          }}
          className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-border-subtle bg-surface py-1 shadow-floating"
        >
          <p className="px-3.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Quick replies
          </p>
          {replies.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(r.message);
                setOpen(false);
              }}
              className="pressable block w-full px-3.5 py-2.5 text-left hover:bg-surface-alt transition-colors"
            >
              <span className="block text-body font-semibold text-text-primary">
                {r.title}
              </span>
              <span className="clamp-1 mt-0.5 block text-meta text-text-muted">
                {r.message}
              </span>
            </button>
          ))}
          <Link
            href="/seller-hub/quick-replies"
            className="block border-t border-border-subtle px-3.5 py-2.5 text-body font-semibold text-text-primary hover:bg-surface-alt transition-colors"
          >
            Manage quick replies
          </Link>
        </div>
      ) : null}
    </div>
  );
}
