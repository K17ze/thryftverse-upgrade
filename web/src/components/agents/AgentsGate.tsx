'use client';

/**
 * AgentsGate — the honest auth state for /agents surfaces in live mode.
 *
 * Every agents read requires an account (the only public leg is the
 * /bots/system directory, which is meaningless on its own), so a guest or a
 * 401 gets a sign-in wall — never a fake "empty" list. Fixture mode always
 * resolves 'ok': the authored demo data renders for the demo session.
 */

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import { useSession } from '@/lib/session/SessionProvider';

export type AgentsAccess = 'loading' | 'blocked' | 'ok';

/**
 * @param error - the query error, when one exists. A 401 after refresh
 *                means the session is gone even if the guest flag hasn't
 *                flipped yet — treat it as blocked.
 */
export function useAgentsAccess(error?: unknown): AgentsAccess {
  const { isGuest, sessionLoading } = useSession();
  if (DATA_MODE !== 'live') return 'ok';
  if (sessionLoading) return 'loading';
  if (isGuest) return 'blocked';
  if (error instanceof ApiRequestError && error.status === 401) return 'blocked';
  return 'ok';
}

/** The sign-in wall — one state, reused by every agents surface. */
export function AgentsSignInWall({ title }: { title?: string }) {
  const router = useRouter();
  return (
    <EmptyState
      icon="lock"
      title={title ?? 'Sign in to use agents'}
      subtitle="Your agents, their run ledger and your feed signals live on your account."
      actionLabel="Sign in"
      onAction={() => router.push('/auth/login')}
    />
  );
}
