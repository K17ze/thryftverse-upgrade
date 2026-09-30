'use client';

/**
 * ChatSkeleton — loading placeholder for the chat thread.
 * Renders header bar, alternating bubble shapes, and composer skeleton.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function ChatSkeleton() {
  return (
    <div
      className="flex h-full flex-col"
      aria-busy
      aria-label="Loading conversation"
    >
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="mt-1.5 h-3 w-20" />
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-hidden px-4 py-6">
        <Skeleton className="h-9 w-3/5 rounded-chat" />
        <Skeleton className="ml-auto h-9 w-1/2 rounded-chat" />
        <Skeleton className="h-9 w-2/5 rounded-chat" />
        <Skeleton className="h-16 w-3/4 rounded-xl" />
        <Skeleton className="ml-auto h-9 w-3/5 rounded-chat" />
      </div>
      <div className="border-t border-border-subtle px-4 py-3">
        <Skeleton className="h-10 w-full rounded-chat" />
      </div>
    </div>
  );
}
