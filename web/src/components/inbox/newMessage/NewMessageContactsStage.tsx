'use client';

import type { RefObject } from 'react';
import type { User } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { UserResultList } from './NewMessagePrimitives';
import type { RecentContact } from './useNewMessageWorkflow';

interface NewMessageContactsStageProps {
  query: string;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onStartGroup: () => void;
  recentContacts: RecentContact[];
  existingDmIds: ReadonlySet<string>;
  directoryUsers: User[];
  directoryLoading: boolean;
  directoryError?: boolean;
  onRetryDirectory: () => void;
  onOpenDm: (userId: string) => void;
  isCreating: boolean;
}

export function NewMessageContactsStage({
  query,
  searchQuery,
  onSearchChange,
  searchRef,
  onStartGroup,
  recentContacts,
  existingDmIds,
  directoryUsers,
  directoryLoading,
  directoryError,
  onRetryDirectory,
  onOpenDm,
  isCreating,
}: NewMessageContactsStageProps) {
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
            placeholder="Search by name or username"
            aria-label="Search people"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            className="h-10 w-full rounded-full border border-transparent bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Quick action — group entry point, hidden while searching */}
        {!query ? (
          <button
            type="button"
            onClick={onStartGroup}
            className="pressable flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left"
          >
            <Icon name="people" size={20} className="shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1">
              <span className="block text-body-emphasis font-semibold text-text-primary">
                Start group chat
              </span>
              <span className="block text-meta text-text-muted">
                Create a group with multiple people
              </span>
            </span>
            <Icon name="forward" size={16} className="text-text-muted" />
          </button>
        ) : null}

        {query ? (
          <UserResultList
            users={directoryUsers}
            loading={directoryLoading}
            error={directoryError}
            onRetry={onRetryDirectory}
            existingIds={existingDmIds}
            onPick={(u) => onOpenDm(u.id)}
            disabled={isCreating}
          />
        ) : (
          <div>
            <p className="px-4 pb-1 pt-3 text-meta font-semibold uppercase tracking-wide text-text-muted">
              Recent
            </p>
            {recentContacts.length === 0 ? (
              <p className="px-4 py-6 text-body text-text-muted">
                No recent conversations — search for someone to message.
              </p>
            ) : (
              recentContacts.map((c) => (
                <button
                  key={c.userId}
                  type="button"
                  disabled={isCreating}
                  onClick={() => onOpenDm(c.userId)}
                  aria-label={`Message ${c.name}`}
                  className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-row-pressed"
                >
                  <Avatar src={c.avatar} name={c.name} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                        {c.name}
                      </span>
                      {c.verified ? (
                        <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
                      ) : null}
                    </span>
                    <span className="block text-meta text-text-muted">
                      Existing conversation
                    </span>
                  </span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
