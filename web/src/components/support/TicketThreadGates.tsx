'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import type { TicketThreadWorkflow } from './useTicketThreadWorkflow';

export function ThreadSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 lg:max-w-[1440px]" aria-busy aria-label="Loading case">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="mt-2 h-8 w-56" />
      <div className="mt-6 flex flex-col gap-4 border-y border-border-subtle py-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4" style={{ width: `${38 - i * 8}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <Skeleton className="h-12 w-2/3 rounded-chat" />
        <Skeleton className="ml-auto h-12 w-1/2 rounded-chat" />
        <Skeleton className="h-10 w-3/5 rounded-chat" />
      </div>
      <Skeleton className="mt-6 h-16 w-full rounded-lg" />
    </div>
  );
}

export function TicketThreadGates({
  workflow,
}: {
  workflow: TicketThreadWorkflow;
}) {
  const {
    sessionLoading,
    isLoading,
    detail,
    isGuest,
    isError,
    ticket,
    router,
    handleRetryLoad,
  } = workflow;

  if (sessionLoading || isLoading || detail.isLoading) {
    return <ThreadSkeleton />;
  }

  if (isGuest && DATA_MODE === 'live') {
    return (
      <EmptyState
        icon="folder"
        title="Sign in to view this case"
        subtitle="Support cases are tied to your account."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (isError || (!ticket && detail.isError)) {
    return (
      <EmptyState
        icon="alert"
        title="Could not load the case"
        subtitle="Check your connection and try again."
        actionLabel="Retry"
        onAction={handleRetryLoad}
      />
    );
  }

  if (!ticket) {
    return (
      <EmptyState
        icon="folder"
        title="Case not found"
        subtitle="This case may have been removed, or the link is incomplete."
        actionLabel="All support cases"
        onAction={() => router.push('/support')}
      />
    );
  }

  return null;
}
