'use client';

/**
 * FeedItemMenu — the per-card overflow control (mobile long-press sheet
 * grammar, rendered as an anchored menu on web): "Why am I seeing this?",
 * "Show less like this", "Not interested".
 *
 * Only renders inside FeedControlsProvider — elsewhere the tile is
 * unchanged. The button sits in the tile's quick-actions cluster with the
 * same 44px transparent-target grammar; the menu itself portals to the
 * document root so the media container's overflow clipping can't cut it.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { getListingCoverUri } from '@/lib/utils/media';
import { focusAdjacentMatch } from '@/lib/a11y/focus';
import { useFeedControls } from './FeedControls';

const MENU_WIDTH = 224;
const MENU_MAX_HEIGHT = 176;
/** Selector matching every feed-tile menu trigger — used to park focus
 *  on a stable sibling before an action unmounts this tile. */
const TRIGGER_SELECTOR = '[data-feed-menu-trigger]';

interface MenuItem {
  icon: AppIconName;
  label: string;
  /** True when the action removes this tile from the feed — focus must
   *  be parked on a sibling anchor before it runs. */
  unmountsTile?: boolean;
  onSelect: () => void;
}

export function FeedItemMenu({ item }: { item: DiscoveryListingSummary }) {
  const controls = useFeedControls();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  /** Set by deliberate dismissals (Escape, item select); passive closes
   *  (scroll, outside press, Tab, trigger toggle) leave it false. */
  const restoreFocus = useRef(false);

  // Listeners + initial focus once the menu is on screen. Focus returns
  // to the trigger only on deliberate dismissal — a scroll-driven close
  // that re-focused the trigger would scroll the page back to the tile,
  // hijacking the very gesture that dismissed the menu.
  useEffect(() => {
    if (!open) return;
    const trigger = buttonRef.current;
    restoreFocus.current = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        restoreFocus.current = true;
        setOpen(false);
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      // preventScroll guards the edge case where the trigger still
      // exists but has drifted out of view — a dismissal must never
      // scroll the page.
      if (restoreFocus.current && trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!controls) return null;

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= MENU_MAX_HEIGHT + 8
          ? rect.bottom + 4
          : Math.max(8, rect.top - MENU_MAX_HEIGHT - 4);
      const left = Math.min(
        Math.max(8, rect.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - 8,
      );
      setCoords({ top, left });
    }
    setOpen(true);
  };

  const moveFocus = (dir: 1 | -1) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + dir + items.length) % items.length]?.focus();
  };

  /** An action that unmounts this tile ("Not interested") would strand
   *  focus on a detached node — it lands on `<body>` and the keyboard
   *  user loses their place. Park it on the next tile's menu trigger
   *  (previous when this is the last tile), falling back to the main
   *  landmark when no sibling tile exists. */
  const parkFocusBeforeUnmount = () => {
    if (focusAdjacentMatch(buttonRef.current, TRIGGER_SELECTOR)) return;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  const cover = getListingCoverUri(item.images);
  const items: MenuItem[] = [
    ...(cover
      ? [
          {
            icon: 'search' as AppIconName,
            label: 'Find visually similar',
            onSelect: () =>
              router.push(`/search/visual?image=${encodeURIComponent(cover)}`),
          },
        ]
      : []),
    {
      icon: 'info',
      label: 'Why am I seeing this?',
      onSelect: () => controls.explain(item),
    },
    {
      icon: 'remove',
      label: 'Show less like this',
      onSelect: () => controls.showFewer(item),
    },
    {
      icon: 'eyeOff',
      label: 'Not interested',
      unmountsTile: true,
      onSelect: () => controls.notInterested(item),
    },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-feed-menu-trigger
        onClick={openMenu}
        onKeyDown={(e) => {
          // Belt-and-braces Tab dismiss — focus normally lives on the
          // first menuitem while open, but if it ever sits on the
          // trigger, Tab must still exit the open menu rather than
          // leaving it orphaned.
          if (open && e.key === 'Tab') setOpen(false);
        }}
        aria-label={`More options for ${item.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="pressable flex h-11 w-11 items-center justify-center"
      >
        <Icon name="more" size={19} className="text-scrim-text-primary drop-scrim" />
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="Item options"
              className="fade-in fixed z-modal min-w-[224px] rounded-lg border border-border bg-surface-elevated py-1 shadow-modal"
              style={{ top: coords.top, left: coords.left }}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  // Menu grammar: Tab exits the menu and continues the
                  // page sequence — it must not leave an open portal menu
                  // with aria-expanded=true behind. Focus is moved back
                  // to the trigger first so the browser's default tab
                  // step (kept — no preventDefault) proceeds from the
                  // tile, not from the end of <body> where the portal
                  // is mounted. Shift+Tab walks backwards the same way.
                  setOpen(false);
                  buttonRef.current?.focus();
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  moveFocus(1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  moveFocus(-1);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  menuRef.current
                    ?.querySelector<HTMLElement>('[role="menuitem"]')
                    ?.focus();
                } else if (e.key === 'End') {
                  e.preventDefault();
                  const list = menuRef.current?.querySelectorAll<HTMLElement>(
                    '[role="menuitem"]',
                  );
                  list?.[list.length - 1]?.focus();
                }
              }}
            >
              {items.map((mi) => (
                <button
                  key={mi.label}
                  type="button"
                  role="menuitem"
                  className="pressable flex h-11 w-full items-center gap-2.5 px-4 text-left text-body text-text-primary hover:bg-surface-alt focus-visible:bg-surface-alt"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (mi.unmountsTile) {
                      // The selection removes this tile — park focus on
                      // a stable sibling anchor before the action runs so
                      // it isn't stranded on a detached node.
                      parkFocusBeforeUnmount();
                    } else {
                      restoreFocus.current = true;
                    }
                    setOpen(false);
                    mi.onSelect();
                  }}
                >
                  <Icon name={mi.icon} size={17} className="shrink-0 text-text-secondary" />
                  {mi.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
