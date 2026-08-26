import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioPlayer, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useHaptic } from '../useHaptic';

type PlaybackState =
  | 'idle'
  | 'authorizing_url'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'interrupted'
  | 'unavailable'
  | 'error';

export interface VoicePlaybackItem {
  messageId: string;
  conversationId: string;
  durationMs: number;
  waveform: number[] | null;
  playbackUrl: string | null;
  expiresAt: number | null;
  moderationState: 'pending' | 'allowed' | 'limited' | 'blocked';
}

export interface VoicePlayerState {
  currentItem: VoicePlaybackItem | null;
  state: PlaybackState;
  position: number; // 0..1
  progressMs: number;
  durationMs: number;
  playbackRate: number;
  isSeeking: boolean;
  error: string | null;
}

const PLAYBACK_RATES = [1, 1.5, 2] as const;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function isUrlExpired(expiresAt: number | null): boolean {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - 5_000; // 5s buffer before actual expiry.
}

/**
 * useVoicePlayer — conversation-scoped voice message playback coordinator.
 *
 * Only one voice item plays at a time. Starting a new item pauses the prior
 * one. Playback URLs are short-lived, so the coordinator refreshes the URL
 * before playing if it has expired. It exposes play/pause/seek/speed and
 * remembers the last position (bounded, per message).
 */
export function useVoicePlayer() {
  const haptic = useHaptic();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const [currentItem, setCurrentItem] = useState<VoicePlaybackItem | null>(null);
  const [state, setState] = useState<PlaybackState>('idle');
  const [position, setPosition] = useState(0);
  const [progressMs, setProgressMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<typeof PLAYBACK_RATES[number]>(1);
  const [isSeeking, setIsSeeking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const positionByMessageRef = useRef<Map<string, number>>(new Map());
  const rateIndexRef = useRef(0);
  const replaceSourceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionUpdateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drive progress from the player status.
  useEffect(() => {
    if (!currentItem) {
      if (positionUpdateTimerRef.current) {
        clearInterval(positionUpdateTimerRef.current);
        positionUpdateTimerRef.current = null;
      }
      return;
    }
    const update = () => {
      try {
        const current = (player?.currentTime ?? 0) * 1000; // seconds → ms
        const ms = Math.min(Math.max(0, current), currentItem.durationMs);
        setProgressMs(ms);
        setPosition(ms / (currentItem.durationMs || 1));
      } catch {
        // Player may be unready.
      }
    };
    update();
    positionUpdateTimerRef.current = setInterval(update, 100);
    return () => {
      if (positionUpdateTimerRef.current) {
        clearInterval(positionUpdateTimerRef.current);
        positionUpdateTimerRef.current = null;
      }
    };
  }, [currentItem, player]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      player?.pause();
      if (replaceSourceTimerRef.current) clearTimeout(replaceSourceTimerRef.current);
      if (positionUpdateTimerRef.current) clearInterval(positionUpdateTimerRef.current);
    };
  }, [player]);

  const setPlaybackItem = useCallback((item: VoicePlaybackItem) => {
    setError(null);
    setCurrentItem(item);
    setPlaybackRate(1);
    rateIndexRef.current = 0;
    const saved = positionByMessageRef.current.get(item.messageId) ?? 0;
    setPosition(saved);
    setProgressMs(Math.round(saved * item.durationMs));
    setState('idle');
  }, []);

  const cyclePlaybackRate = useCallback(() => {
    rateIndexRef.current = (rateIndexRef.current + 1) % PLAYBACK_RATES.length;
    const next = PLAYBACK_RATES[rateIndexRef.current];
    setPlaybackRate(next);
    if (player) {
      player.playbackRate = next;
    }
    haptic.light();
  }, [player, haptic]);

  const seekTo = useCallback(
    async (ratio: number) => {
      if (!currentItem || !player) return;
      const target = Math.max(0, Math.min(1, ratio)) * (currentItem.durationMs || 1);
      setIsSeeking(true);
      try {
        await player.seekTo(target / 1000);
        setProgressMs(target);
        setPosition(target / (currentItem.durationMs || 1));
        positionByMessageRef.current.set(currentItem.messageId, target / (currentItem.durationMs || 1));
      } catch {
        // ignore
      } finally {
        setIsSeeking(false);
      }
    },
    [currentItem, player],
  );

  const forward = useCallback(
    async (ms = 5000) => {
      if (!currentItem || !player) return;
      const next = Math.min(currentItem.durationMs, progressMs + ms);
      await seekTo(next / (currentItem.durationMs || 1));
    },
    [currentItem, progressMs, seekTo],
  );

  const rewind = useCallback(
    async (ms = 5000) => {
      if (!currentItem || !player) return;
      const next = Math.max(0, progressMs - ms);
      await seekTo(next / (currentItem.durationMs || 1));
    },
    [currentItem, progressMs, seekTo],
  );

  const play = useCallback(async () => {
    if (!currentItem) return;

    if (currentItem.moderationState === 'blocked') {
      setError('This voice message is unavailable');
      setState('unavailable');
      return;
    }
    if (!currentItem.playbackUrl || isUrlExpired(currentItem.expiresAt)) {
      setState('authorizing_url');
      // The consumer (VoiceMessageBubble) owns the URL fetch. We call a
      // placeholder and rely on the caller to call `setPlaybackUrl`.
      setError('Playback URL expired; refresh and try again.');
      setState('error');
      return;
    }

    setError(null);
    setState('buffering');
    try {
      const saved = positionByMessageRef.current.get(currentItem.messageId) ?? 0;
      await player?.replace(currentItem.playbackUrl);
      player.playbackRate = playbackRate;
      if (saved > 0.005) {
        await player?.seekTo(saved * (currentItem.durationMs / 1000));
      }
      await player?.play();
      setState('playing');
      haptic.light();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Playback failed');
      setState('error');
      haptic.error();
    }
  }, [currentItem, player, playbackRate, haptic]);

  const pause = useCallback(async () => {
    if (!player) return;
    try {
      await player.pause();
      setState('paused');
      if (currentItem) {
        positionByMessageRef.current.set(currentItem.messageId, position);
      }
    } catch {
      // ignore
    }
  }, [player, currentItem, position]);

  const toggle = useCallback(() => {
    if (state === 'playing' || state === 'buffering') {
      pause();
    } else {
      play();
    }
  }, [state, play, pause]);

  const stop = useCallback(() => {
    player?.pause();
    player?.seekTo(0);
    setState('idle');
    setPosition(0);
    setProgressMs(0);
    if (currentItem) {
      positionByMessageRef.current.delete(currentItem.messageId);
    }
  }, [player, currentItem]);

  const setPlaybackUrl = useCallback(
    (url: string, expiresInSeconds: number) => {
      if (currentItem) {
        setCurrentItem({
          ...currentItem,
          playbackUrl: url,
          expiresAt: Date.now() + expiresInSeconds * 1000,
        });
      }
    },
    [currentItem],
  );

  // End-of-play detection via status. Expo audio status does not always fire
  // a completion event, so we observe `currentTime` / `duration` in the status.
  useEffect(() => {
    if (!status?.duration || !currentItem) return;
    if (status.currentTime >= status.duration - 0.05) {
      setState('ended');
      positionByMessageRef.current.delete(currentItem.messageId);
      setPosition(0);
      setProgressMs(0);
    }
  }, [status, currentItem]);

  return {
    currentItem,
    state,
    position,
    progressMs,
    durationMs: currentItem?.durationMs ?? 0,
    durationLabel: formatDuration(currentItem?.durationMs ?? 0),
    progressLabel: formatDuration(progressMs),
    playbackRate,
    isSeeking,
    error,
    canPlay: Boolean(currentItem?.playbackUrl) && !isUrlExpired(currentItem?.expiresAt ?? null),
    setPlaybackItem,
    setPlaybackUrl,
    play,
    pause,
    toggle,
    stop,
    seekTo,
    forward,
    rewind,
    cyclePlaybackRate,
  };
}
