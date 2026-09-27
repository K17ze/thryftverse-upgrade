'use client';

/**
 * ConversationRowMenu — hover-revealed kebab on a list row. The mobile
 * grammar union: the long-press action sheet (Mute, Pin, Delete) plus the
 * swipe actions (Mark read/unread, Archive). Writes go through
 * useConversationPrefs / the mark-read mutation so live mode posts the
 * server edges and reverts on failure; fixture mode mutates the module
 * dataset. Floats above the row's stretched link — pointer events land
 * here first.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconButton } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import type { Conversation } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { useMarkConversationRead } from '@/lib/hooks/queries';
import { useConversationPrefs } from './useConversationPrefs';
import { useConversationAdmin } from './useConversationAdmin';
import {
  liveConversationApi,
  markFixtureConversationUnread,
} from './groupAdmin';
import { CLOSED_CONFIRM, ConfirmSheet, type ConfirmSheetState } from './ConfirmSheet';

export function ConversationRowMenu({ conversation }: { conversation: Conversation }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isMuted, isArchived, isPinned, setMuted, setArchived, setPinned } =
    useConversationPrefs();
  const markConversationRead = useMarkConversationRead();
  const admin = useConversationAdmin(conversation);

  const archived = isArchived(conversation);
  const muted = isMuted(conversation);
  const pinned = isPinned(conversation);
  const unread = conversation.unread || (conversation.unreadCount ?? 0) > 0;

  // Close on pointer-down outside; move focus into the menu on open.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Menu keyboard grammar — Escape closes and returns focus to the
  // trigger; arrows/Home/End traverse the items (the AccountMenu pattern).
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    ];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      wrapRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      return;
    }
    if (e.key === 'Tab') {
      // Menu grammar (the FeedItemMenu fix): close, return focus to the
      // trigger, then let the browser's default tab step continue from
      // it — an open menu left past its Tab position strands the order.
      setOpen(false);
      wrapRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      return;
    }
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowUp') next = idx <= 0 ? items.length - 1 : idx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next]?.focus();
    }
  };

  /**
   * Mark-read runs the canonical read write (optimistic badge drop + POST
   * /read) — in live mode a markedUnread flag is a separate server bit,
   * so the /unread edge clears it too and a refetch can't resurrect the
   * badge.
   */
  const markRead = () => {
    markConversationRead(conversation.id);
    if (DATA_MODE === 'live') {
      liveConversationApi.setUnread(conversation.id, false).catch(() => {});
    }
  };

  /**
   * Mark-unread — the mirror of useMarkConversationRead: optimistic cache
   * write so row/header/tab badges rise together, the fixture store write
   * in fixture mode, PATCH /unread live with revert-on-failure. The flag
   * is viewer intent — `unread` flips without inflating unreadCount (the
   * row renders a dot, never a fabricated number).
   */
  const markUnread = () => {
    const id = conversation.id;
    const applyUnread = (c: Conversation): Conversation =>
      c.unread ? c : { ...c, unread: true };
    const revertUnread = (c: Conversation): Conversation =>
      c.id === id ? { ...c, unread: false } : c;
    qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
      old?.map((c) => (c.id === id ? applyUnread(c) : c)),
    );
    qc.setQueriesData<Conversation | null>({ queryKey: ['conversation', id] }, (old) =>
      old ? applyUnread(old) : old,
    );
    if (DATA_MODE === 'live') {
      liveConversationApi
        .setUnread(id, true)
        .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
        .catch(() => {
          qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
            old?.map(revertUnread),
          );
          qc.setQueriesData<Conversation | null>({ queryKey: ['conversation', id] }, (old) =>
            old ? { ...old, unread: false } : old,
          );
          toast.show("Couldn't mark unread — try again", 'error');
        });
      return;
    }
    markFixtureConversationUnread(id);
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };

  const confirmDelete = () =>
    setConfirm({
      open: true,
      title: 'Delete conversation?',
      message:
        'This removes the conversation for you — the other person keeps their copy.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        const ok = await admin.removeConversation('me');
        toast.show(
          ok ? 'Conversation deleted' : "Couldn't delete this conversation.",
          ok ? 'success' : 'error',
        );
      },
    });

  return (
    <div
      ref={wrapRef}
      className="absolute right-2 top-1/2 z-10 -translate-y-1/2"
      onKeyDown={onMenuKeyDown}
    >
      <IconButton
        name="more"
        aria-label={`Options for this conversation`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={open}
      />
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <MenuItem
            icon="pin"
            filled={pinned}
            label={pinned ? 'Unpin' : 'Pin'}
            onClick={() => {
              setPinned(conversation, !pinned);
              setOpen(false);
            }}
          />
          <MenuItem
            icon={muted ? 'notifications' : 'notificationsOff'}
            label={muted ? 'Unmute' : 'Mute notifications'}
            onClick={() => {
              setMuted(conversation, !muted);
              setOpen(false);
            }}
          />
          <MenuItem
            icon={unread ? 'mail' : 'mailUnread'}
            label={unread ? 'Mark as read' : 'Mark as unread'}
            onClick={() => {
              if (unread) markRead();
              else markUnread();
              setOpen(false);
            }}
          />
          <MenuItem
            icon={archived ? 'mail' : 'folder'}
            label={archived ? 'Move back to inbox' : 'Archive'}
            onClick={() => {
              setArchived(conversation, !archived);
              setOpen(false);
            }}
          />
          <div className="my-1 border-t border-border-subtle" aria-hidden />
          <MenuItem
            icon="trash"
            label="Delete"
            danger
            onClick={() => {
              setOpen(false);
              confirmDelete();
            }}
          />
        </div>
      ) : null}
      <ConfirmSheet state={confirm} onClose={() => setConfirm(CLOSED_CONFIRM)} />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  filled,
  danger,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onClick: () => void;
  filled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`pressable flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-body hover:bg-row-pressed focus:bg-row-pressed focus:outline-none ${
        danger ? 'text-danger-text' : 'text-text-primary'
      }`}
    >
      <Icon
        name={icon}
        filled={filled}
        size={15}
        className={danger ? 'text-danger-text' : 'text-text-muted'}
      />
      {label}
    </button>
  );
}
