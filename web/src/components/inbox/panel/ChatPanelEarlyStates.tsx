'use client';

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChatSkeleton } from './ChatSkeleton';

interface ChatPanelEarlyStatesProps {
  isGuest: boolean;
  isLoading: boolean;
  isError: boolean;
  hasConversation: boolean;
  onRetry: () => void;
}

/**
 * Early states for the conversation panel (guest, skeleton, error, not-found).
 * Enforces fail-closed UX without fabricated local fallbacks.
 */
export function ChatPanelEarlyStates({
  isGuest,
  isLoading,
  isError,
  hasConversation,
  onRetry,
}: ChatPanelEarlyStatesProps) {
  const router = useRouter();

  if (isGuest) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <EmptyState
          icon="chat"
          title="Sign in to message"
          subtitle="Messages and offers live on your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  if (isLoading) return <ChatSkeleton />;

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <EmptyState
          icon="alert"
          title="Couldn't load this conversation"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={onRetry}
        />
      </div>
    );
  }

  if (!hasConversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon="chat"
          title="Conversation not found"
          subtitle="It may have been archived or deleted."
          actionLabel="Back to inbox"
          onAction={() => router.push('/inbox')}
        />
      </div>
    );
  }

  return null;
}
