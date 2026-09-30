'use client';

import type { User } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

export function MemberListSkeleton() {
  return (
    <div className="px-4" aria-busy aria-label="Loading people">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="mt-1.5 h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserResultList({
  users,
  loading,
  error,
  onRetry,
  existingIds,
  onPick,
  disabled,
}: {
  users: User[];
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  existingIds: ReadonlySet<string>;
  onPick: (u: User) => void;
  disabled: boolean;
}) {
  if (error) {
    return (
      <EmptyState
        compact
        icon="alert"
        title="Couldn't search people"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }
  if (loading) return <MemberListSkeleton />;
  if (users.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-body text-text-muted">
        No one found — try a different username.
      </p>
    );
  }
  return (
    <div>
      {users.map((u) => (
        <button
          key={u.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(u)}
          aria-label={`Message ${u.username}`}
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
              {existingIds.has(u.id) ? 'Existing conversation' : u.location}
            </span>
          </span>
          <Icon name="forward" size={16} className="text-text-muted" />
        </button>
      ))}
    </div>
  );
}
