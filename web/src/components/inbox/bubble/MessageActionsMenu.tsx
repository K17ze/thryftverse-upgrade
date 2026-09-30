'use client';

/**
 * MessageActionsMenu — desktop / touch context menu for messages.
 * Anchored to click point or gutter button; handles rove-tab focus,
 * quick reactions row with '+' expander to extended reactions set,
 * and context actions (Retry, Reply, Forward, Pin, Save, Edit, Copy, Report, Delete).
 */

import { useEffect, useRef, useState } from 'react';
import { EXTENDED_REACTIONS } from '@/lib/hooks/chat-queries';

export interface MenuReaction {
  emoji: string;
  reactedByMe: boolean;
}

export interface MessageActionsMenuProps {
  anchor: { x: number; y: number };
  reactions?: MenuReaction[];
  onReact?: (emoji: string) => void;
  hasReacted?: (emoji: string) => boolean;
  onRetry?: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onPin?: () => void;
  pinned?: boolean;
  saved?: boolean;
  onSave?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onReport?: () => void;
  onRemove?: () => void;
  onDeleteForMe?: () => void;
  onDeleteForEveryone?: () => void;
  onClose: () => void;
}

export function MessageActionsMenu({
  anchor,
  reactions,
  onReact,
  hasReacted,
  onRetry,
  onReply,
  onForward,
  onPin,
  pinned,
  saved,
  onSave,
  onCopy,
  onEdit,
  onReport,
  onRemove,
  onDeleteForMe,
  onDeleteForEveryone,
  onClose,
}: MessageActionsMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const restoreFocus = useRef<Element | null>(null);
  const restoreOnClose = useRef(false);

  if (restoreFocus.current === null && typeof document !== 'undefined') {
    restoreFocus.current = document.activeElement;
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        restoreOnClose.current = true;
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"]',
    );
    first?.focus();
    const prev = restoreFocus.current;
    return () => {
      if (restoreOnClose.current && prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  const focusables = (): HTMLElement[] =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      ) ?? [],
    );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const prev = restoreFocus.current;
      onClose();
      if (prev instanceof HTMLElement) prev.focus();
      return;
    }
    if (
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'Home' &&
      e.key !== 'End'
    ) {
      return;
    }
    e.preventDefault();
    const items = focusables();
    if (!items.length) return;
    const at = items.findIndex((el) => el === document.activeElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : e.key === 'ArrowDown'
            ? (at + 1) % items.length
            : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const item =
    'pressable flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-body text-text-primary hover:bg-row-pressed focus-visible:bg-row-pressed focus-visible:outline-none';
  const pick = (fn?: () => void) => () => {
    restoreOnClose.current = true;
    fn?.();
    onClose();
  };

  const rows = [
    onRetry,
    onReply,
    onForward,
    onPin,
    onSave,
    onEdit,
    onCopy,
    onReport,
    onRemove,
    onDeleteForMe,
    onDeleteForEveryone,
  ].filter(Boolean).length;
  const reactable = Boolean(reactions?.length && onReact);
  const width = reactable ? 232 : 176;
  const estHeight =
    8 + (reactable ? 52 : 0) + (reactable && moreOpen ? 124 : 0) + rows * 44;
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8));
  const top = Math.max(
    8,
    Math.min(anchor.y, window.innerHeight - estHeight - 8),
  );

  const reactChip = (emoji: string, reactedByMe: boolean) => (
    <button
      key={emoji}
      type="button"
      role="menuitemradio"
      aria-checked={reactedByMe}
      aria-label={`React ${emoji}`}
      onClick={pick(() => onReact?.(emoji))}
      className={`pressable flex h-9 w-9 items-center justify-center rounded-full text-body-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        reactedByMe ? 'bg-brand-subtle' : 'hover:bg-surface-alt'
      }`}
    >
      <span aria-hidden>{emoji}</span>
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Message actions"
      onKeyDown={onKeyDown}
      className="fixed z-dropdown overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-floating"
      style={{ left, top, width }}
    >
      {reactable ? (
        <div className="border-b border-border-subtle px-2 pb-1.5 pt-1">
          <div
            role="group"
            aria-label="React with"
            className="flex items-center justify-between"
          >
            {reactions?.map((r) => reactChip(r.emoji, r.reactedByMe))}
            <button
              type="button"
              role="menuitem"
              aria-expanded={moreOpen}
              aria-label={moreOpen ? 'Fewer reactions' : 'More reactions'}
              onClick={() => setMoreOpen((v) => !v)}
              className={`pressable flex h-9 w-9 items-center justify-center rounded-full text-body-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                moreOpen
                  ? 'bg-brand-subtle text-brand'
                  : 'text-text-muted hover:bg-surface-alt'
              }`}
            >
              <span aria-hidden>{moreOpen ? '×' : '+'}</span>
            </button>
          </div>
          {moreOpen ? (
            <div
              role="group"
              aria-label="More reactions"
              className="mt-1.5 flex flex-wrap gap-0.5 border-t border-border-subtle pt-1.5"
            >
              {EXTENDED_REACTIONS.map((emoji) =>
                reactChip(emoji, hasReacted?.(emoji) ?? false),
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onRetry)}
        >
          Retry
        </button>
      ) : null}
      {onReply ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onReply)}
        >
          Reply
        </button>
      ) : null}
      {onForward ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onForward)}
        >
          Forward
        </button>
      ) : null}
      {onPin ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onPin)}
        >
          {pinned ? 'Unpin message' : 'Pin message'}
        </button>
      ) : null}
      {onSave ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onSave)}
        >
          {saved ? 'Unsave' : 'Save in chat'}
        </button>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onEdit)}
        >
          Edit message
        </button>
      ) : null}
      {onCopy ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onCopy)}
        >
          Copy
        </button>
      ) : null}
      {onReport ? (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-danger-text`}
          onClick={pick(onReport)}
        >
          Report
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-danger-text`}
          onClick={pick(onRemove)}
        >
          Remove
        </button>
      ) : null}
      {onDeleteForMe ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onDeleteForMe)}
        >
          Delete for me
        </button>
      ) : null}
      {onDeleteForEveryone ? (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-danger-text`}
          onClick={pick(onDeleteForEveryone)}
        >
          Delete for everyone
        </button>
      ) : null}
    </div>
  );
}
