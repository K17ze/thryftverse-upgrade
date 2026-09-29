'use client';

/**
 * /inbox/join?token=… — the web landing for group invite links. The
 * backend mints `thryftverse://group-invite?token=…` deep links; the web
 * invite UI rewrites them to this route so a shared link opens here.
 *
 * POST /chat/groups/join is idempotent (member insert ON CONFLICT) — a
 * re-arrived member routes straight to the thread. Guests get the sign-in
 * gate first; fixture mode has no backend to join against.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import { joinGroupByInvite } from '@/lib/api/services/chat';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';

function JoinGroupView({ token }: { token: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const attempted = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || isGuest || !user || attempted.current) return;
    attempted.current = true;
    let cancelled = false;
    joinGroupByInvite(token, user.id)
      .then(({ conversation }) => {
        if (cancelled) return;
        // The list + the thread both refetch — the new row lands populated.
        void qc.invalidateQueries({ queryKey: ['conversations'] });
        if (conversation?.id) {
          void qc.invalidateQueries({ queryKey: ['conversation', conversation.id] });
          router.replace(`/inbox/${conversation.id}`);
        } else {
          router.replace('/inbox');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setFailed(
          err instanceof Error && err.message
            ? err.message
            : 'This invite link is invalid or expired.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, isGuest, user, token, qc, router]);

  if (!hydrated || (!isGuest && !failed)) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[520px] flex-col items-center justify-center gap-3 px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
        <p className="sr-only" role="status">
          Joining group…
        </p>
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[520px] items-center justify-center px-6">
        <EmptyState
          icon="people"
          title="Sign in to join this group"
          subtitle="This invite link opens a group chat — you'll need an account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[520px] items-center justify-center px-6">
      <EmptyState
        icon="link"
        title="Couldn't join the group"
        subtitle={failed ?? 'This invite link is invalid or expired.'}
        actionLabel="Back to inbox"
        onAction={() => router.push('/inbox')}
      />
    </div>
  );
}

function JoinGroupInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  if (DATA_MODE !== 'live') {
    return (
      <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[520px] items-center justify-center px-6">
        <EmptyState
          icon="link"
          title="Invite links need the live backend"
          subtitle="Group invites only work against a real server."
          actionLabel="Back to inbox"
          onAction={() => router.push('/inbox')}
        />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[520px] items-center justify-center px-6">
        <EmptyState
          icon="link"
          title="This invite link is invalid"
          subtitle="The link is missing its invite token."
          actionLabel="Back to inbox"
          onAction={() => router.push('/inbox')}
        />
      </div>
    );
  }

  return <JoinGroupView token={token} />;
}

export default function JoinGroupPage() {
  // useSearchParams requires a Suspense boundary under static rendering.
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[520px] items-center justify-center px-6">
          <Skeleton className="h-8 w-40" />
        </div>
      }
    >
      <JoinGroupInner />
    </Suspense>
  );
}
