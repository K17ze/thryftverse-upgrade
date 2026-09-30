'use client';

import type { RefObject } from 'react';
import type { User } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { MemberListSkeleton } from './NewMessagePrimitives';
import { MIN_GROUP_MEMBERS } from './useNewMessageWorkflow';

interface NewMessageMembersStageProps {
  query: string;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  selected: User[];
  selectedIds: ReadonlySet<string>;
  onToggleMember: (user: User) => void;
  directoryUsers: User[];
  directoryLoading: boolean;
  directoryError?: boolean;
  onRetryDirectory: () => void;
  onContinue: () => void;
}

export function NewMessageMembersStage({
  query,
  searchQuery,
  onSearchChange,
  searchRef,
  selected,
  selectedIds,
  onToggleMember,
  directoryUsers,
  directoryLoading,
  directoryError,
  onRetryDirectory,
  onContinue,
}: NewMessageMembersStageProps) {
  return (
    <>
      {/* Search Input */}
      <div className="shrink-0 px-4 pb-2 pt-1">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search people"
            aria-label="Search people"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            className="h-10 w-full rounded-full border border-transparent bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
          />
        </label>
      </div>

      {/* Selected chip rail */}
      {selected.length > 0 ? (
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-2">
          {selected.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggleMember(u)}
              aria-label={`Remove ${u.username} from selection`}
              className="pressable flex shrink-0 items-center gap-1.5 rounded-full bg-surface-alt py-1 pl-1 pr-2.5"
            >
              <Avatar src={u.avatar} name={u.username} size={22} />
              <span className="max-w-[96px] truncate text-meta text-text-primary">
                {u.username}
              </span>
              <Icon name="close" size={12} className="text-text-muted" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {directoryError ? (
          <EmptyState
            compact
            icon="alert"
            title="Couldn't load people"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={onRetryDirectory}
          />
        ) : directoryLoading ? (
          <MemberListSkeleton />
        ) : directoryUsers.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-text-muted">
            {query ? 'No one found — try a different username.' : 'No people to add.'}
          </p>
        ) : (
          directoryUsers.map((u) => {
            const isSelected = selectedIds.has(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggleMember(u)}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${u.username}`}
                className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-row-pressed"
              >
                <Avatar src={u.avatar} name={u.username} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                      {u.username}
                    </span>
                    {u.isVerified ? (
                      <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
                    ) : null}
                  </span>
                  <span className="clamp-1 block text-meta text-text-muted">
                    {u.location}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    isSelected
                      ? 'border-brand bg-brand text-text-inverse'
                      : 'border-border text-transparent'
                  }`}
                  aria-hidden
                >
                  <Icon name="check" size={14} />
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Member-stage footer */}
      <div className="shrink-0 border-t border-border-subtle px-4 py-3">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={selected.length < MIN_GROUP_MEMBERS}
          onClick={onContinue}
        >
          {selected.length === 0
            ? 'Select members'
            : selected.length < MIN_GROUP_MEMBERS
              ? 'Select at least 2 members'
              : `Continue · ${selected.length} selected`}
        </Button>
      </div>
    </>
  );
}
