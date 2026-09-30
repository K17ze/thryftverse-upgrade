'use client';

import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';

export function ConversationInfoSkeleton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  return (
    <div className="flex h-full flex-col bg-background" aria-busy aria-label="Loading details">
      <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 py-1">
        <IconButton
          name="back"
          aria-label="Back to conversation"
          onClick={() => router.push(`/inbox/${conversationId}`)}
        />
      </header>
      <div className="flex flex-col items-center gap-2 px-4 pt-7">
        <Skeleton className="h-24 w-24 rounded-full" />
        <Skeleton className="mt-1 h-5 w-40" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="mt-4 flex justify-between border-y border-border-subtle px-8 py-3">
        <Skeleton className="h-9 w-12" />
        <Skeleton className="h-9 w-12" />
        <Skeleton className="h-9 w-12" />
      </div>
      <div className="px-4 pt-6">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-3.5">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
