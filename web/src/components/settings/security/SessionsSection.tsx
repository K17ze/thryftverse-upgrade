'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as securityService from '@/lib/api/services/security';
import {
  SECURITY_SESSIONS,
  formatSessionActivity,
} from '@/lib/data/fixtures-settings';
import type { SecuritySession } from '@/lib/contracts/settings';

const isLive = DATA_MODE === 'live';

function sessionIcon(platform: string): 'desktop' | 'phone' {
  return platform === 'iOS' || platform === 'Android' ? 'phone' : 'desktop';
}

function SessionRow({
  session,
  onRevoke,
  pending,
}: {
  session: SecuritySession;
  onRevoke: (s: SecuritySession) => void;
  pending: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <Icon name={sessionIcon(session.platform)} size={20} className="shrink-0 text-text-secondary" />
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
          {session.deviceName}
        </p>
        <p className="clamp-1 text-caption text-text-muted">
          {formatSessionActivity(session.lastSeenAt)}
          {session.ipAddress ? ` · ${session.ipAddress}` : ''}
        </p>
      </div>
      {session.isCurrent ? (
        <span className="rounded-full bg-success-subtle px-2 py-0.5 text-meta font-semibold text-success-text">
          Current
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onRevoke(session)}
          disabled={pending}
          className="pressable -my-2 inline-flex min-h-11 items-center rounded-md px-2 text-caption font-semibold text-danger-text hover:bg-danger-subtle disabled:opacity-50"
        >
          Sign out
        </button>
      )}
    </li>
  );
}

export function SessionsSection() {
  const { show } = useToast();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const revokedIds = useSettingsPrefs((s) => s.revokedSessionIds);
  const revokeSession = useSettingsPrefs((s) => s.revokeSession);
  const restoreSession = useSettingsPrefs((s) => s.restoreSession);
  const revokeOtherSessionsPref = useSettingsPrefs((s) => s.revokeOtherSessions);
  const restoreSessions = useSettingsPrefs((s) => s.restoreSessions);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  const liveSessions = useQuery({
    queryKey: ['security', 'sessions'],
    queryFn: ({ signal }) => securityService.fetchSecuritySessions(signal),
    enabled: isLive,
    staleTime: 15_000,
  });

  const liveRevoke = useMutation({
    mutationFn: (sessionId: string) => securityService.revokeSecuritySession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      show('Session signed out', 'success');
    },
    onError: (error) =>
      show(parseApiError(error).message || 'Could not sign out that session', 'error'),
  });

  const liveRevokeOthers = useMutation({
    mutationFn: () => securityService.revokeOtherSecuritySessions(),
    onSuccess: ({ revokedCount }) => {
      void queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      show(
        revokedCount === 1
          ? 'Signed out 1 other session'
          : `Signed out ${revokedCount} other sessions`,
        'success',
      );
    },
    onError: (error) =>
      show(parseApiError(error).message || 'Could not sign out other sessions', 'error'),
  });

  // Fixture inventory minus persisted revocations
  const sessions = isLive
    ? (liveSessions.data ?? [])
    : hydrated
      ? SECURITY_SESSIONS.filter((s) => s.isCurrent || !revokedIds.includes(s.id))
      : SECURITY_SESSIONS;
  const others = sessions.filter((s) => !s.isCurrent);
  const pending = liveRevoke.isPending || liveRevokeOthers.isPending;

  const requestRevoke = (s: SecuritySession) =>
    setConfirm({
      title: 'Sign out this session?',
      message: `${s.deviceName} will lose access on its next request and need to log in again.`,
      confirmLabel: 'Sign out',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        if (isLive) {
          liveRevoke.mutate(s.id);
          return;
        }
        revokeSession(s.id);
        show('Session signed out', 'info', {
          label: 'Undo',
          onPress: () => restoreSession(s.id),
        });
      },
    });

  const requestRevokeOthers = () =>
    setConfirm({
      title: `Sign out ${others.length} other session${others.length === 1 ? '' : 's'}?`,
      message: 'Every device except this one will be signed out and need to log in again.',
      confirmLabel: 'Sign out all',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        if (isLive) {
          liveRevokeOthers.mutate();
          return;
        }
        const ids = others.map((s) => s.id);
        revokeOtherSessionsPref(ids);
        show('All other sessions signed out', 'info', {
          label: 'Undo',
          onPress: () => restoreSessions(ids),
        });
      },
    });

  if (isLive ? liveSessions.isLoading : !hydrated) {
    return (
      <div aria-busy aria-label="Loading sessions">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  if (isLive && liveSessions.isError) {
    return (
      <div className="px-4 py-4 sm:px-5">
        <p className="text-body-emphasis text-text-primary">Sessions unavailable</p>
        <p className="mt-0.5 text-caption text-text-muted">
          {parseApiError(liveSessions.error).message ||
            'The session list could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={() => void liveSessions.refetch()}
          className="pressable mt-2 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {sessions.length === 0 ? (
        <div className="px-4 py-4 sm:px-5">
          <p className="text-caption text-text-muted">No sessions returned.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} onRevoke={requestRevoke} pending={pending} />
          ))}
        </ul>
      )}
      {others.length > 0 ? (
        <div className="px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={requestRevokeOthers}
            disabled={pending}
            className="pressable inline-flex min-h-11 items-center text-caption font-semibold text-danger-text disabled:opacity-50"
          >
            Sign out all other sessions
          </button>
        </div>
      ) : null}

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}
