import React from 'react';
import { AppState, AppStateStatus } from 'react-native';

export type AuctionEffectiveState = 'cancelled' | 'settled' | 'upcoming' | 'live' | 'ended';

export interface AuctionTimingInput {
  startsAt: string;
  endsAt: string;
  cancelledAt?: string | null;
  settledAt?: string | null;
}

export interface AuctionTimingOutput {
  effectiveState: AuctionEffectiveState;
  msToStart: number;
  msToEnd: number;
  progress: number;
}

export function resolveAuctionTiming(
  input: AuctionTimingInput,
  serverNowMs: number
): AuctionTimingOutput {
  const startsAtMs = new Date(input.startsAt).getTime();
  const endsAtMs = new Date(input.endsAt).getTime();

  const cancelledAtMs = input.cancelledAt ? new Date(input.cancelledAt).getTime() : null;
  const settledAtMs = input.settledAt ? new Date(input.settledAt).getTime() : null;

  let effectiveState: AuctionEffectiveState;

  if (cancelledAtMs !== null) {
    effectiveState = 'cancelled';
  } else if (settledAtMs !== null) {
    effectiveState = 'settled';
  } else if (serverNowMs >= endsAtMs) {
    effectiveState = 'ended';
  } else if (serverNowMs >= startsAtMs) {
    effectiveState = 'live';
  } else {
    effectiveState = 'upcoming';
  }

  const msToStart = Math.max(0, startsAtMs - serverNowMs);
  const msToEnd = Math.max(0, endsAtMs - serverNowMs);

  const totalDuration = endsAtMs - startsAtMs;
  const elapsed = serverNowMs - startsAtMs;
  const progress = totalDuration > 0
    ? Math.min(1, Math.max(0, elapsed / totalDuration))
    : 0;

  return { effectiveState, msToStart, msToEnd, progress };
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Ended';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}:${minutes}:${seconds}`;
}

export interface ServerClockResult {
  serverNowMs: number;
  offsetMs: number;
  resync: (serverNow: string) => void;
}

export function useServerClock(initialServerNow: string | null): ServerClockResult {
  const [offsetMs, setOffsetMs] = React.useState(0);
  const offsetRef = React.useRef(0);
  const lastSyncRef = React.useRef(0);

  const computeOffset = React.useCallback((serverNow: string) => {
    const serverMs = new Date(serverNow).getTime();
    if (!Number.isFinite(serverMs)) return;
    const deviceMs = Date.now();
    const newOffset = serverMs - deviceMs;
    offsetRef.current = newOffset;
    setOffsetMs(newOffset);
    lastSyncRef.current = deviceMs;
  }, []);

  React.useEffect(() => {
    if (initialServerNow) {
      computeOffset(initialServerNow);
    }
  }, [initialServerNow, computeOffset]);

  React.useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const elapsed = Date.now() - lastSyncRef.current;
        if (elapsed > 30_000 && initialServerNow) {
          computeOffset(initialServerNow);
        }
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [initialServerNow, computeOffset]);

  const resync = React.useCallback((serverNow: string) => {
    computeOffset(serverNow);
  }, [computeOffset]);

  const serverNowMs = Date.now() + offsetRef.current;

  return { serverNowMs, offsetMs, resync };
}

export function useServerClockTick(initialServerNow: string | null): ServerClockResult & { nowMs: number } {
  const clock = useServerClock(initialServerNow);
  const offsetRef = React.useRef(0);
  const [nowMs, setNowMs] = React.useState(() => Date.now() + clock.offsetMs);

  React.useEffect(() => {
    offsetRef.current = clock.offsetMs;
    setNowMs(Date.now() + clock.offsetMs);
  }, [clock.offsetMs]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now() + offsetRef.current);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return { ...clock, nowMs };
}
