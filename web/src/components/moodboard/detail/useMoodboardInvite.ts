import { useEffect, useRef, useState } from 'react';
import type { useRouter } from 'next/navigation';
import type { QueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as socialService from '@/lib/api/services/social';
import type { User } from '@/lib/contracts/domain';

export interface UseMoodboardInviteParams {
  id: string;
  me: User | null;
  sessionLoading: boolean;
  router: ReturnType<typeof useRouter>;
  queryClient: QueryClient;
  show: (message: string, tone?: 'info' | 'success' | 'error', action?: { label: string; onPress: () => void }) => void;
}

export function useMoodboardInvite({
  id,
  me,
  sessionLoading,
  router,
  queryClient,
  show,
}: UseMoodboardInviteParams) {
  const inviteHandled = useRef(false);
  const [invitePending, setInvitePending] = useState(false);

  useEffect(() => {
    if (inviteHandled.current) return;
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) return;
    if (DATA_MODE !== 'live') {
      inviteHandled.current = true;
      router.replace(`/moodboard/${id}`);
      return;
    }
    if (sessionLoading) return;
    inviteHandled.current = true;
    if (!me) {
      show('Sign in to accept this invite', 'info');
      router.replace(`/moodboard/${id}`);
      return;
    }
    setInvitePending(true);
    void socialService
      .acceptMoodboardInvite(token)
      .then(({ boardId }) => {
        void queryClient.invalidateQueries({ queryKey: ['moodboard'] });
        void queryClient.invalidateQueries({ queryKey: ['moodboards'] });
        void queryClient.invalidateQueries({ queryKey: ['moodboard-members'] });
        show('Joined the board', 'success');
        router.replace(`/moodboard/${boardId || id}`);
      })
      .catch((err) => {
        const status = parseApiError(err).status;
        show(
          status === 410
            ? 'That invite has expired'
            : status === 404
              ? 'That invite link is no longer valid'
              : parseApiError(err).message,
          'error',
        );
        router.replace(`/moodboard/${id}`);
      })
      .finally(() => setInvitePending(false));
  }, [id, me, sessionLoading, queryClient, router, show]);

  return { invitePending };
}
