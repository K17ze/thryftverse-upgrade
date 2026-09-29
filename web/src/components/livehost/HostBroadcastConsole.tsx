'use client';

/**
 * HostBroadcastConsole — the live-mode resolver behind /live/host/[id].
 * Fetches the real session row (GET /streaming/sessions/:id), proves host
 * authority — the recorded host passes on the row itself; anyone else is
 * probed through the host-token endpoint, which 401s the signed-out and
 * 403s non-hosts (admins pass — they mint host tokens too) — then hands
 * the session to HostBroadcastRoom. Every failure is an honest state:
 * not found, sign-in, forbidden, retryable error. Nothing falls back to
 * a simulated stream.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiRequestError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { useSession } from '@/lib/session/SessionProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { HostGate } from './HostGate';
import { HostBroadcastRoom } from './HostBroadcastRoom';

type AccessState = 'loading' | 'ready' | 'not-found' | 'forbidden' | 'error';

function ConsoleSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[1440px] px-4 pt-4 sm:px-6"
      aria-busy
      aria-label="Loading host console"
    >
      <div className="skeleton h-7 w-64 rounded-md" />
      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="skeleton aspect-[16/9] w-full rounded-xl" />
          <div className="skeleton mt-6 h-20 w-full rounded-lg" />
        </div>
        <div className="skeleton h-64 w-full rounded-lg lg:w-[340px]" />
      </div>
    </div>
  );
}

function ConsoleMessage({
  icon,
  title,
  body,
  children,
}: {
  icon: 'videocam' | 'lock' | 'warning';
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-text-muted">
        <Icon name={icon} size={26} />
      </span>
      <h1 className="mt-5 text-screen-title text-text-primary">{title}</h1>
      <p className="mt-2 max-w-sm text-body text-text-secondary">{body}</p>
      <div className="mt-7 flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

export function HostBroadcastConsole({ streamId }: { streamId: string }) {
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [hostToken, setHostToken] = useState<liveService.StreamJoinToken | null>(
    null,
  );
  const [access, setAccess] = useState<AccessState>('loading');
  const [resolveAttempt, setResolveAttempt] = useState(0);

  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;

    (async () => {
      let resolved: LiveSession | null;
      try {
        resolved = await liveService.fetchStreamSession(streamId);
      } catch {
        if (!cancelled) setAccess('error');
        return;
      }
      if (cancelled) return;
      if (!resolved) {
        setAccess('not-found');
        return;
      }

      // The recorded host is authoritative on the session row. Anyone else
      // is probed through the host-token endpoint — the same 401/403 the
      // backend enforces, plus the admin exception, for free.
      if (user?.id != null && resolved.sellerId === user.id) {
        setSession(resolved);
        setAccess('ready');
        return;
      }
      try {
        const token = await liveService.fetchStreamToken(streamId, 'host');
        if (cancelled) return;
        setSession(resolved);
        setHostToken(token);
        setAccess('ready');
      } catch (error) {
        if (cancelled) return;
        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          setAccess('forbidden');
        } else {
          setAccess('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [streamId, isGuest, user?.id, resolveAttempt]);

  if (sessionLoading) return <ConsoleSkeleton />;
  if (isGuest) return <HostGate />;
  if (access === 'loading') return <ConsoleSkeleton />;

  if (access === 'not-found') {
    return (
      <ConsoleMessage
        icon="videocam"
        title="This show doesn't exist"
        body="The session was never created — or it was a demo show, which only lives in the session it was authored in."
      >
        <Link
          href="/live/create"
          className="pressable text-body font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          Start a show
        </Link>
        <Link
          href="/live"
          className="pressable text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Back to live hub
        </Link>
      </ConsoleMessage>
    );
  }

  if (access === 'forbidden') {
    return (
      <ConsoleMessage
        icon="lock"
        title="Only the host can run this console"
        body="This show belongs to another account — sign in as the host to broadcast, or watch from the live hub instead."
      >
        <Button
          variant="primary"
          size="md"
          onClick={() => router.push('/auth/login')}
        >
          Log in
        </Button>
        <Link
          href="/live"
          className="pressable text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Back to live hub
        </Link>
      </ConsoleMessage>
    );
  }

  if (access === 'error' || !session) {
    return (
      <ConsoleMessage
        icon="warning"
        title="The console couldn't load"
        body="The session lookup failed — check your connection and try again."
      >
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            setAccess('loading');
            setResolveAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
        <Link
          href="/live"
          className="pressable text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Back to live hub
        </Link>
      </ConsoleMessage>
    );
  }

  // Keyed by session id — a different route param remounts the room with a
  // clean realtime/publish lifecycle rather than reusing a stale one.
  return (
    <HostBroadcastRoom
      key={session.id}
      session={session}
      hostToken={hostToken}
    />
  );
}
