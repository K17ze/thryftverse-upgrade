import React from 'react';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProfileHeroSkeleton } from '@/components/profile/ProfileSkeleton';
import { ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import type { User } from '@/lib/contracts/domain';
import type { PublicProfile } from '@/lib/api/services/users';

export function ProfileGates({
  isLoading,
  isError,
  refetch,
  isFetched,
  user,
  me,
  aggregate,
  unblockPending,
  onUnblock,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  isFetched: boolean;
  user: User | null;
  me: User | null;
  aggregate: PublicProfile | null | undefined;
  unblockPending: boolean;
  onUnblock: () => void;
}) {
  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <ProfileHeroSkeleton />
        <div className="mt-5 border-b border-border-subtle" />
        <div className="py-4">
          <ClosetGridSkeleton />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <EmptyState
          icon="warning"
          title="Couldn't load this profile"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={refetch}
        />
      </div>
    );
  }

  if (isFetched && !user) {
    notFound();
  }

  if (!user || user.id === me?.id) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <ProfileHeroSkeleton />
        <div className="mt-5 border-b border-border-subtle" />
        <div className="py-4">
          <ClosetGridSkeleton />
        </div>
      </div>
    );
  }

  if (aggregate?.isBlocked === true) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-center px-6 py-16 text-center sm:py-24">
          <Avatar src={user.avatar} name={user.username} size={80} />
          <h1 className="mt-4 text-item-title font-bold text-text-primary">
            {user.displayName?.trim() || `@${user.username}`}
          </h1>
          {user.displayName?.trim() ? (
            <p className="mt-1 text-body text-text-secondary">@{user.username}</p>
          ) : null}
          <p className="mt-3 max-w-sm text-body text-text-secondary">
            You blocked this member — they can&apos;t message you and you
            won&apos;t see their items.
          </p>
          <Button
            variant="secondary"
            className="mt-5"
            disabled={unblockPending}
            onClick={onUnblock}
          >
            {unblockPending ? 'Unblocking…' : 'Unblock'}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
