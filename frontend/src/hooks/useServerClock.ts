import React from 'react';
import { AppState, AppStateStatus } from 'react-native';

export type AuctionEffectiveState = 'cancelled' | 'settled' | 'upcoming' | 'live' | 'ended';

export type AuctionTerminalReason = 'cancelled' | 'settled' | 'buy_now' | 'scheduled_end' | null;

export interface AuctionTimingInput {
  startsAt: string;
  endsAt: string;
  cancelledAt?: string | null;
  settledAt?: string | null;
  winnerBidderId?: string | null;
  lifecycle?: string;
  terminalReason?: string | null;
}

export interface AuctionTimingOutput {
  effectiveState: AuctionEffectiveState;
  terminalReason: AuctionTerminalReason;
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
  let terminalReason: AuctionTerminalReason = null;

  if (cancelledAtMs !== null) {
    effectiveState = 'cancelled';
    terminalReason = 'cancelled';
  } else if (settledAtMs !== null) {
    effectiveState = 'settled';
    terminalReason = 'settled';
  } else if (input.winnerBidderId || input.terminalReason === 'buy_now') {
    effectiveState = 'ended';
    terminalReason = 'buy_now';
  } else if (input.lifecycle === 'ended' || serverNowMs >= endsAtMs) {
    effectiveState = 'ended';
    terminalReason = 'scheduled_end';
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

  return { effectiveState, terminalReason, msToStart, msToEnd, progress };
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

// ── Resync lifecycle: idle → needsResync → refreshing → succeeded | failed ──

export interface ServerClockResult {
  serverNowMs: number;
  offsetMs: number;
  resync: (serverNow: string) => void;
  needsResync: boolean;
  resyncFailed: boolean;
  markResyncFailed: () => void;
  clearResyncFailed: () => void;
}

export function useServerClock(initialServerNow: string | null): ServerClockResult {
  const [offsetMs, setOffsetMs] = React.useState(0);
  const [needsResync, setNeedsResync] = React.useState(false);
  const [resyncFailed, setResyncFailed] = React.useState(false);
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
    setNeedsResync(false);
    setResyncFailed(false);
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
        if (elapsed > 30_000) {
          setNeedsResync(true);
        }
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const resync = React.useCallback((serverNow: string) => {
    computeOffset(serverNow);
  }, [computeOffset]);

  const markResyncFailed = React.useCallback(() => {
    setNeedsResync(false);
    setResyncFailed(true);
  }, []);

  const clearResyncFailed = React.useCallback(() => {
    setResyncFailed(false);
  }, []);

  const serverNowMs = Date.now() + offsetRef.current;

  return { serverNowMs, offsetMs, resync, needsResync, resyncFailed, markResyncFailed, clearResyncFailed };
}

// ── PASS 5: Bucketed clocks — second precision for final minutes, minute otherwise ──

export interface BucketedClockResult extends ServerClockResult {
  secondClock: number;
  minuteClock: number;
}

export function useBucketedServerClock(initialServerNow: string | null): BucketedClockResult {
  const clock = useServerClock(initialServerNow);
  const offsetRef = React.useRef(0);
  const [secondClock, setSecondClock] = React.useState(() => Date.now() + clock.offsetMs);
  const [minuteClock, setMinuteClock] = React.useState(() => {
    const now = Date.now() + clock.offsetMs;
    return now - (now % 60_000);
  });

  React.useEffect(() => {
    offsetRef.current = clock.offsetMs;
    const now = Date.now() + clock.offsetMs;
    setSecondClock(now);
    setMinuteClock(now - (now % 60_000));
  }, [clock.offsetMs]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now() + offsetRef.current;
      setSecondClock(now);
      setMinuteClock((prev) => {
        const floored = now - (now % 60_000);
        return floored !== prev ? floored : prev;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return { ...clock, secondClock, minuteClock };
}
