import { ConversationListSkeleton } from '@/components/inbox/list/ConversationListSkeleton';

/** Streaming skeleton for the inbox segment — the master-detail shell:
 *  conversation rail on the left, the (empty) detail pane beside it. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] md:flex md:h-[calc(100dvh-4rem)]">
      <div className="w-full md:h-full md:w-[340px] md:shrink-0 md:border-r md:border-border-subtle lg:w-[380px]">
        <ConversationListSkeleton />
      </div>
      <div className="hidden min-w-0 flex-1 md:block" aria-hidden />
    </div>
  );
}
