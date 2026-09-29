'use client';

/**
 * useLiveChat — the overlay's chat feed for fixture sessions: the recorded
 * transcript streams in on a seeded tick (deterministic rhythm per session
 * — the same lines arrive in the same order every open) behind a
 * "Simulated preview" system line so nobody mistakes it for real room
 * traffic; replays render the recorded transcript in full, read-only.
 * Live-mode chat is real now and lives in useLiveRoom (REST history +
 * the session's realtime topic) — this hook returns nothing there so the
 * two feeds can never double-render.
 */

import { useEffect, useRef, useState } from 'react';
import { LIVE_CHAT_LINES, type LiveChatLine, type LiveSession } from '@/lib/data/fixtures-media';
import { HOST_CHAT_LINES } from '@/lib/data/fixtures-livehost';
import { userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { seededRandom } from './useLivePresence';

export interface LiveChatMessage {
  id: string;
  /** Fixture username; '' for system lines. */
  user: string;
  text: string;
  kind: 'chat' | 'system';
  /** Seller mark — mirrors mobile's isSeller chat treatment. */
  seller?: boolean;
  /** Posted by the viewer locally this session. */
  mine?: boolean;
  /** Author's backend user id — live mode only; the host moderation
   *  panel needs it to target mute/kick. Absent on fixture lines. */
  userId?: string;
}

function toMessage(line: LiveChatLine): LiveChatMessage {
  return {
    id: line.id,
    user: line.user,
    text: line.text,
    kind: line.kind ?? 'chat',
    seller: line.seller,
  };
}

export function useLiveChat(session: LiveSession | null): {
  messages: LiveChatMessage[];
  /** null on replays — the transcript is read-only, no composer. */
  send: ((text: string) => void) | null;
} {
  const { user } = useSession();
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const sentRef = useRef(0);
  const live = session?.status === 'live';

  useEffect(() => {
    sentRef.current = 0;
    if (!session) {
      setMessages([]);
      return;
    }

    // Host name: live sessions carry the room's own projection; fixture
    // sessions resolve through USERS.
    const sellerName =
      session.sellerName || userById(session.sellerId)?.username || 'seller';

    // Live mode — real chat (history + realtime appends + sends) is owned
    // by useLiveRoom; this hook stays inert so the feeds never double.
    if (DATA_MODE === 'live') {
      setMessages([]);
      return;
    }

    // Host-authored shows carry no per-session transcript — they stream
    // the same generic chatter script the host console moderates against.
    const script =
      LIVE_CHAT_LINES[session.id] ??
      (session.id.startsWith('host-') ? HOST_CHAT_LINES : []);

    if (session.status !== 'live') {
      // Replay — the recorded transcript renders in full; nothing streams.
      setMessages([
        { id: `${session.id}-sys`, user: '', text: 'Chat from the live show', kind: 'system' },
        ...script.map(toMessage),
      ]);
      return;
    }

    // Fixture live — the script is disclosed up front as a simulation.
    setMessages([
      {
        id: `${session.id}-join`,
        user: '',
        text: `You joined @${sellerName}’s show`,
        kind: 'system',
      },
      {
        id: `${session.id}-sim`,
        user: '',
        text: 'Simulated preview — chat is scripted in this build',
        kind: 'system',
      },
    ]);

    const rand = seededRandom(`${session.id}:chat`);
    const timers: number[] = [];
    let delay = 900;
    script.forEach((line) => {
      delay += 1_600 + rand() * 1_800;
      timers.push(
        window.setTimeout(() => {
          setMessages((m) => [...m, toMessage(line)]);
        }, delay),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [session]);

  // Live mode has no socket — the composer hides rather than pretending a
  // sent line reached the room.
  const send =
    live && session && DATA_MODE !== 'live'
      ? (text: string) => {
          sentRef.current += 1;
          setMessages((m) => [
            ...m,
            {
              id: `me-${sentRef.current}`,
              user: user?.username ?? 'you',
              text,
              kind: 'chat',
              mine: true,
            },
          ]);
        }
      : null;

  return { messages, send };
}
