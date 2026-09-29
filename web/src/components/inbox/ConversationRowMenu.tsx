'use client';

/**
 * ConversationRowMenu — the row's contextual menu, reachable two ways:
 * the hover-revealed kebab (touch + mouse) and a right-click anywhere on
 * the row (the desktop analogue of the mobile long-press sheet —
 * Messenger/WhatsApp-web grammar). The kebab anchors the menu under the
 * button; a context-menu press anchors it at the cursor, clamped inside
 * the viewport. The menu grammar is the mobile union: the long-press
 * sheet (Pin, Mute, Delete) plus the swipe actions (Mark read/unread,
 * Archive). Writes go through useConversationPrefs / the mark-read
 * mutation so live mode posts the server edges and reverts on failure;
 * fixture mode mutates the module dataset.
 */

import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconButton } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import type { Conversation } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { focusAdjacentMatch } from '@/lib/a11y/focus';
import { useMarkConversationRead } from '@/lib/hooks/queries';
import { useConversationPrefs } from './useConversationPrefs';
import { useConversationAdmin } from './useConversationAdmin';
import {
  liveConversationApi,
  markFixtureConversationUnread,
} from './groupAdmin';
import { conversationTitle } from './inboxModel';
import { CLOSED_CONFIRM, ConfirmSheet, type ConfirmSheetState } from './ConfirmSheet';

/** Selector matching every conversation row link — used to park focus on
 *  a stable sibling before an action (archive, delete) unmounts this row. */
const ROW_SELECTOR = '[data-conversation-row]';

/** Menu placement — kebab anchors under the button; a right-click opens
 *  the same menu fixed at the pointer (viewport-clamped on mount). */
type MenuAnchor = { kind: 'kebab' } | { kind: 'pointer'; x: number; y: number };

export interface ConversationRowMenuHandle {
  /** Open the menu anchored at a pointer position (row right-click). */
  openAt: (x: number, y: number) => void;
}

export function ConversationRowMenu({
  conversation,
  ref,
}: {
  conversation: Conversation;
  /** Imperative handle for the row's contextmenu press. */
  ref?: React.Ref<ConversationRowMenuHandle>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const open = anchor !== null;
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);
  const wrapRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  /** Kebab-anchored menus flip above the row when the measured rect would
   *  clear the viewport bottom — the same clamp the pointer path gets. */
  const [openUp, setOpenUp] = useState(false);
  /** Set by deliberate dismissal (Escape, item activation); passive
   *  closes (outside press, scroll, Tab continuing) leave it false. */
  const restoreFocus = useRef(false);
  const { isMuted, isArchived, isPinned, setMuted, setArchived, setPinned } =
    useConversationPrefs();
  const markConversationRead = useMarkConversationRead();
  const admin = useConversationAdmin(conversation);

  const archived = isArchived(conversation);
  const muted = isMuted(conversation);
  const pinned = isPinned(conversation);
  const unread = conversation.unread || (conversation.unreadCount ?? 0) > 0;

  // Row right-click — the same menu the kebab opens, anchored at the
  // pointer. Exposed as an imperative handle so the row wrapper's
  // contextmenu press can reach it.
  useImperativeHandle(ref, () => ({
    openAt: (x, y) => setAnchor({ kind: 'pointer', x, y }),
  }));

  /** The row this menu belongs to — the wrapper sits beside the row link
   *  inside the item group, so walk up to the group and back down. */
  const hostRow = () =>
    (wrapRef.current?.closest('.group') ?? wrapRef.current?.parentElement)
      ?.querySelector<HTMLElement>(ROW_SELECTOR) ?? null;

  /** Deliberate close returns focus to the control that opened the menu —
   *  the kebab for the button path, the right-clicked row link for the
   *  pointer path. */
  const focusTrigger = (kind: MenuAnchor['kind'] | undefined) => {
    const trigger = kind === 'pointer' ? hostRow() : kebabRef.current;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  };

  /** An action that removes this row (archive, delete) would strand focus
   *  on a detached node — park it on the next/previous row first, falling
   *  back to the main landmark when no sibling row exists. */
  const parkFocusBeforeUnmount = () => {
    if (focusAdjacentMatch(hostRow(), ROW_SELECTOR)) return;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  // Pointer-anchored menus clamp into the viewport once the menu mounts
  // and its real size is measurable — measure-once, position-stays.
  useEffect(() => {
    if (anchor?.kind !== 'pointer') {
      setMenuPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      left: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)),
    });
  }, [anchor]);

  // Kebab-anchored menus get the vertical half of that clamp: the measured
  // rect clears the bottom edge → the menu flips above the trigger rather
  // than bleeding off-viewport.
  useEffect(() => {
    if (anchor?.kind !== 'kebab') {
      setOpenUp(false);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setOpenUp(rect.bottom > window.innerHeight - 8);
  }, [anchor]);

  // Close on pointer-down outside; a pointer-anchored menu also closes on
  // scroll (a fixed menu would detach from its row). Focus moves into the
  // menu on open and returns to the trigger on deliberate dismissal —
  // activating an item unmounts the focused menuitem, so without the
  // restore it would drop to <body>.
  useEffect(() => {
    if (!open) return;
    const kind = anchor?.kind;
    restoreFocus.current = false;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAnchor(null);
    };
    const onScroll = () => setAnchor(null);
    document.addEventListener('mousedown', onDoc);
    if (kind === 'pointer') window.addEventListener('scroll', onScroll, true);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      if (restoreFocus.current) focusTrigger(kind);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusTrigger reads refs/DOM, not reactive state
  }, [open, anchor?.kind]);

  // Menu keyboard grammar — Escape closes and returns focus to the
  // trigger; arrows/Home/End traverse the items (the AccountMenu pattern).
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    ];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      restoreFocus.current = true;
      setAnchor(null);
      return;
    }
    if (e.key === 'Tab') {
      // Menu grammar (the FeedItemMenu fix): close, return focus to the
      // trigger, then let the browser's default tab step continue from
      // it — an open menu left past its Tab position strands the order.
      setAnchor(null);
      focusTrigger(anchor?.kind);
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

  const close = () => setAnchor(null);

  /** Item activation — the focused menuitem unmounts with the menu, so a
   *  deliberate close flags focus restore to the trigger (or parks it on
   *  an adjacent row when the action removes this row from the list). */
  const activate = (action: () => void, removesRow = false) => {
    if (removesRow) {
      parkFocusBeforeUnmount();
    } else {
      restoreFocus.current = true;
    }
    close();
    action();
  };

  return (
    <div
      ref={wrapRef}
      className="absolute right-2 top-1/2 z-elevated -translate-y-1/2"
      onKeyDown={onMenuKeyDown}
    >
      <IconButton
        ref={kebabRef}
        name="more"
        aria-label={`Options for ${conversationTitle(conversation)}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setAnchor((a) => (a ? null : { kind: 'kebab' }))}
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100 [@media(hover:none)]:opacity-100"
        data-open={open}
      />
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Options for ${conversationTitle(conversation)}`}
          className={`w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-floating ${
            anchor?.kind === 'pointer'
              ? 'fixed z-dropdown'
              : `absolute right-0 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`
          }`}
          style={
            anchor?.kind === 'pointer'
              ? menuPos
                ? { left: menuPos.left, top: menuPos.top }
                : // Pre-measure: render off-viewport for one frame rather
                  // than flash at the raw cursor and jump.
                  { left: anchor.x, top: anchor.y, visibility: 'hidden' }
              : undefined
          }
        >
          <MenuItem
            icon="pin"
            filled={pinned}
            label={pinned ? 'Unpin' : 'Pin'}
            onClick={() => activate(() => setPinned(conversation, !pinned))}
          />
          <MenuItem
            icon={muted ? 'notifications' : 'notificationsOff'}
            label={muted ? 'Unmute' : 'Mute notifications'}
            onClick={() => activate(() => setMuted(conversation, !muted))}
          />
          <MenuItem
            icon={unread ? 'mail' : 'mailUnread'}
            label={unread ? 'Mark as read' : 'Mark as unread'}
            onClick={() =>
              activate(() => (unread ? markRead() : markUnread()))
            }
          />
          {/* Archive/unarchive pulls the row out of the visible list —
              park focus on a sibling row before the write unmounts it. */}
          <MenuItem
            icon={archived ? 'mail' : 'folder'}
            label={archived ? 'Move back to inbox' : 'Archive'}
            onClick={() => activate(() => setArchived(conversation, !archived), true)}
          />
          <div className="my-1 border-t border-border-subtle" aria-hidden />
          {/* Delete routes through the confirm sheet — parking focus on a
              sibling row first means the sheet's own focus-restore lands
              somewhere stable even if the row is gone by then. */}
          <MenuItem
            icon="trash"
            label="Delete"
            danger
            onClick={() => activate(confirmDelete, true)}
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
