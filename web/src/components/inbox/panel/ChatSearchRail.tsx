'use client';

/**
 * ChatSearchRail — inline message search bar with match count readout,
 * clear on escape, and direct focus management.
 */

import { forwardRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';

interface ChatSearchRailProps {
  open: boolean;
  query: string;
  title: string;
  matchCount: number;
  onQueryChange: (val: string) => void;
  onClose: () => void;
}

export const ChatSearchRail = forwardRef<HTMLInputElement, ChatSearchRailProps>(
  function ChatSearchRail(
    { open, query, title, matchCount, onQueryChange, onClose },
    ref,
  ) {
    if (!open) return null;

    const trimmed = query.trim();

    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-alt px-3 py-1.5 md:px-4">
        <Icon name="search" size={16} className="shrink-0 text-text-muted" />
        <input
          ref={ref}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              if (trimmed) onQueryChange('');
              else onClose();
            }
          }}
          placeholder={`Search in ${title}`}
          aria-label={`Search in ${title}`}
          className="h-11 -my-1.5 min-w-0 flex-1 bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
        />
        {trimmed ? (
          <span
            className="tnum shrink-0 text-meta text-text-muted"
            aria-live="polite"
          >
            {matchCount} {matchCount === 1 ? 'result' : 'results'}
          </span>
        ) : null}
        <IconButton
          name="close"
          size={14}
          aria-label="Close search"
          className="-my-1.5 shrink-0"
          onClick={() => {
            onQueryChange('');
            onClose();
          }}
        />
      </div>
    );
  },
);
