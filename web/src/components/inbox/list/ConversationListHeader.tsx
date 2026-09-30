'use client';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';

interface ConversationListHeaderProps {
  query: string;
  composeOpen: boolean;
  onQueryChange: (q: string) => void;
  onOpenCompose: () => void;
}

export function ConversationListHeader({
  query,
  composeOpen,
  onQueryChange,
  onOpenCompose,
}: ConversationListHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-screen-title text-text-primary">Messages</h1>
        <IconButton
          name="edit"
          aria-label="New message"
          aria-haspopup="dialog"
          aria-expanded={composeOpen}
          onClick={onOpenCompose}
          className="-mr-2"
        />
      </div>
      <label className="relative mt-3 block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
          <Icon name="search" size={16} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears a live query, then releases the field
            if (e.key === 'Escape') {
              if (query) onQueryChange('');
              else e.currentTarget.blur();
            }
          }}
          placeholder="Search messages"
          aria-label="Search messages"
          className="h-9 w-full rounded-full border border-transparent bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
        />
      </label>
    </>
  );
}
