'use client';

/**
 * ConversationRowMenu — hover-revealed kebab on a list row: mute/unmute,
 * archive/unarchive, report. Floats above the row's stretched link —
 * pointer events land here first.
 */

import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useHydrated } from '@/lib/store/useStore';
import type { Conversation } from '@/lib/contracts/domain';

export function ConversationRowMenu({ conversation }: { conversation: Conversation }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const archivedIds = useInboxPrefs((s) => s.archivedIds);
  const mutedIds = useInboxPrefs((s) => s.mutedIds);
  const toggleArchive = useInboxPrefs((s) => s.toggleArchive);
  const toggleMute = useInboxPrefs((s) => s.toggleMute);

  const archived = hydrated && archivedIds.includes(conversation.id);
  const muted = hydrated && mutedIds.includes(conversation.id);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
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
          role="menu"
          className="absolute right-0 top-full mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <MenuItem
            icon={muted ? 'notifications' : 'notificationsOff'}
            label={muted ? 'Unmute' : 'Mute notifications'}
            onClick={() => {
              toggleMute(conversation.id);
              setOpen(false);
            }}
          />
          <MenuItem
            icon={archived ? 'mail' : 'folder'}
            label={archived ? 'Move back to inbox' : 'Archive'}
            onClick={() => {
              toggleArchive(conversation.id);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="pressable flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-body text-text-primary hover:bg-row-pressed"
    >
      <Icon name={icon} size={15} className="text-text-muted" />
      {label}
    </button>
  );
}
