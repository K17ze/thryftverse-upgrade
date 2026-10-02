'use client';

/**
 * QuickReplyMenu — role-scoped saved replies popover for marketplace chats.
 * Provides accessible menu semantics, keyboard navigation (Escape, Tab, Enter),
 * and direct deep link to manage templates in seller-hub.
 */

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { IconButton } from '@/components/ui/IconButton';

export interface QuickReplyItem {
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
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const menuLabelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Focus goes back to the trigger — the menu Escape contract.
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    // Menu grammar: focus moves into the menu on open (the FeedItemMenu
    // pattern) so the keyboard sequence starts at the first reply.
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
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
      />
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={menuLabelId}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              // Menu grammar (the FeedItemMenu fix): close, return
              // focus to the trigger, then let the browser's default
              // tab step continue from it — an open menu left past its
              // Tab position strands the tab order.
              setOpen(false);
              btnRef.current?.focus();
              return;
            }
            // Arrow/Home/End roving (the ConversationRowMenu pattern) —
            // the "Manage quick replies" link carries menuitem too, so
            // it's inside the same cycle.
            const items = [
              ...(menuRef.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]',
              ) ?? []),
            ];
            if (!items.length) return;
            const idx = items.indexOf(document.activeElement as HTMLElement);
            let next = -1;
            if (e.key === 'ArrowDown') next = (idx + 1) % items.length;
            else if (e.key === 'ArrowUp')
              next = idx <= 0 ? items.length - 1 : idx - 1;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = items.length - 1;
            if (next >= 0) {
              e.preventDefault();
              items[next]?.focus();
            }
          }}
          className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-border-subtle bg-surface py-1 shadow-floating"
        >
          <p
            id={menuLabelId}
            className="px-3.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
          >
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
            role="menuitem"
            className="block border-t border-border-subtle px-3.5 py-2.5 text-body font-semibold text-text-primary hover:bg-surface-alt transition-colors"
          >
            Manage quick replies
          </Link>
        </div>
      ) : null}
    </div>
  );
}
