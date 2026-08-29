import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, TypeStyles, Typography } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useVoicePlayer } from '../../hooks/chat/useVoicePlayer';
import {
  requestVoicePlaybackUrlOnApi,
  fetchVoiceMessageDetailsOnApi,
} from '../../services/chatApi';

export interface VoiceMessageBubbleProps {
  messageId: string;
  conversationId: string;
  durationMs: number;
  isMe: boolean;
  waveform?: number[];
  container?: 'm4a' | 'ogg' | 'webm' | 'mp4';
  codec?: 'aac' | 'opus' | 'mp3';
  moderationState?: 'pending' | 'allowed' | 'limited' | 'blocked';
  accessibilityLabel?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const BAR_COUNT = 36;
const BAR_MAX_HEIGHT = 20;
const BAR_MIN_HEIGHT = 4;

/**
 * VoiceMessageBubble — canonical voice message presentation.
 *
 * Anti-AI design (AGENTS.md §4):
 * - Uses the real `waveform` prop when the server has decoded it. Falls back
 *   to a quiet progress line (single bar) when no waveform is available.
 *   Never uses `Math.random()` to fake audio evidence.
 * - One conversation-scoped player coordinator: only one voice plays at a time.
 * - Press play/pause, tap waveform to seek, speed cycles 1×/1.5×/2×.
 * - Transcription is not rendered here; it lives in the message detail/caption
 *   surface and is fetched on demand, opt-in, labelled "Automatically
 *   transcribed".
 */
export function VoiceMessageBubble({
  messageId,
  conversationId,
  durationMs,
  isMe,
  waveform,
  container,
  codec,
  moderationState = 'pending',
  accessibilityLabel,
}: VoiceMessageBubbleProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors, isMe), [colors, isMe]);

  const player = useVoicePlayer();
  const [waveformSamples, setWaveformSamples] = useState<number[] | undefined>(waveform);
  const [fetchedDuration, setFetchedDuration] = useState(durationMs);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = player.currentItem?.messageId === messageId;
  const isPlaying = isCurrent && (player.state === 'playing' || player.state === 'buffering');
  const progress = isCurrent ? player.position : 0;

  // Fetch canonical voice details on mount if waveform or duration missing.
  useEffect(() => {
    if (waveform && waveform.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const details = await fetchVoiceMessageDetailsOnApi(conversationId, messageId);
        if (cancelled) return;
        if (details.waveform?.samples) {
          setWaveformSamples(details.waveform.samples);
        }
        if (details.durationMs > 0) {
          setFetchedDuration(details.durationMs);
        }
      } catch {
        // Best-effort: the original props remain.
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, messageId, waveform]);

  useEffect(() => {
    if (!isCurrent) return;
    setIsLoadingUrl(player.state === 'authorizing_url' || player.state === 'buffering');
  }, [isCurrent, player.state]);

  const ensurePlaybackUrl = useCallback(async (): Promise<string | null> => {
    try {
      const result = await requestVoicePlaybackUrlOnApi(conversationId, messageId);
      player.setPlaybackUrl(result.playbackUrl, result.expiresIn);
      return result.playbackUrl;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load voice');
      return null;
    }
  }, [conversationId, messageId, player]);

  const handlePress = useCallback(async () => {
    if (moderationState === 'blocked') {
      haptic.error();
      return;
    }
    if (isCurrent && (player.state === 'playing' || player.state === 'buffering')) {
      await player.pause();
      return;
    }
    if (!isCurrent) {
      player.setPlaybackItem({
        messageId,
        conversationId,
        durationMs: fetchedDuration,
        waveform: waveformSamples ?? null,
        playbackUrl: null,
        expiresAt: null,
        moderationState,
      });
      setIsLoadingUrl(true);
      const url = await ensurePlaybackUrl();
      setIsLoadingUrl(false);
      if (!url) {
        haptic.error();
        return;
      }
      player.setPlaybackUrl(url, 300);
      player.play();
    } else if (player.state === 'paused' || player.state === 'ended' || player.state === 'idle') {
      player.play();
    } else {
      // Unknown: refresh the URL and try again.
      const url = await ensurePlaybackUrl();
      if (url) {
        player.setPlaybackUrl(url, 300);
        player.play();
      }
    }
    haptic.light();
  }, [
    conversationId,
    ensurePlaybackUrl,
    fetchedDuration,
    haptic,
    isCurrent,
    messageId,
    moderationState,
    player,
    waveformSamples,
  ]);

  const handleCycleSpeed = useCallback(() => {
    if (!isCurrent) return;
    player.cyclePlaybackRate();
    haptic.selection();
  }, [isCurrent, player, haptic]);

  const handleSeek = useCallback(
    (ratio: number) => {
      if (!isCurrent) return;
      player.seekTo(ratio);
    },
    [isCurrent, player],
  );

  const displaySamples = useMemo(() => {
    if (waveformSamples && waveformSamples.length > 0) {
      return waveformSamples;
    }
    return null;
  }, [waveformSamples]);

  const barColor = isMe ? colors.scrimTextTertiary : colors.textSecondary;
  const activeBarColor = isMe ? colors.textInverse : colors.brand;

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={
        accessibilityLabel ??
        `Voice message, ${formatDuration(fetchedDuration)} long${isPlaying ? ', playing' : ''}`
      }
      accessibilityRole="button"
      accessibilityHint="Double tap to play or pause. Use actions to seek, change speed, or request transcript."
    >
      <View style={styles.playBtn}>
        {isLoadingUrl ? (
          <Ionicons name="sync" size={16} color={isMe ? colors.textInverse : colors.textPrimary} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={16}
            color={isMe ? colors.textInverse : colors.textPrimary}
          />
        )}
      </View>

      <View style={styles.waveform}>
        {displaySamples ? (
          <View style={styles.barRow}>
            {displaySamples.slice(0, BAR_COUNT).map((fraction, i) => {
              const active = isCurrent && isPlaying && i / Math.max(1, displaySamples.length - 1) <= progress;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: BAR_MIN_HEIGHT + fraction * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT),
                      backgroundColor: active ? activeBarColor : barColor,
                    },
                  ]}
                />
              );
            })}
            {isCurrent && progress > 0 && (
              <View
                style={[
                  styles.progressOverlay,
                  { width: `${progress * 100}%` },
                ]}
                pointerEvents="none"
              />
            )}
          </View>
        ) : (
          // Honest fallback: no decoded waveform yet. Render a single quiet
          // progress line instead of faking bars with Math.random().
          <View style={styles.progressLineTrack}>
            <View
              style={[
                styles.progressLine,
                { width: `${progress * 100}%`, backgroundColor: activeBarColor },
              ]}
            />
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text style={styles.duration}>
          {isCurrent ? formatDuration(player.progressMs) : formatDuration(fetchedDuration)}
        </Text>
        {isCurrent && (
          <Pressable
            onPress={handleCycleSpeed}
            style={styles.speedPill}
            accessibilityLabel={`Playback speed ${player.playbackRate} times`}
            accessibilityRole="button"
          >
            <Text style={styles.speedText}>{player.playbackRate}×</Text>
          </Pressable>
        )}
      </View>

      {error ? (
        <Text style={styles.error} numberOfLines={1}>{error}</Text>
      ) : null}
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors, isMe: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minWidth: 180,
      maxWidth: 260,
      paddingVertical: 2,
    },
    playBtn: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      backgroundColor: isMe ? colors.scrimTextTertiary : colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    waveform: {
      flex: 1,
      height: BAR_MAX_HEIGHT,
      justifyContent: 'center',
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      height: BAR_MAX_HEIGHT,
    },
    bar: {
      flex: 1,
      borderRadius: Radius.full,
    },
    progressOverlay: {
      ...StyleSheet.absoluteFill,
      opacity: 0,
    },
    progressLineTrack: {
      height: 3,
      borderRadius: Radius.full,
      backgroundColor: isMe ? colors.scrimTextTertiary : `${colors.textSecondary}30`,
      overflow: 'hidden',
    },
    progressLine: {
      height: 3,
      borderRadius: Radius.full,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    duration: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: isMe ? colors.scrimTextSecondary : colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    speedPill: {
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 2,
      borderRadius: Radius.full,
      backgroundColor: isMe ? colors.scrimTextTertiary : `${colors.textSecondary}15`,
    },
    speedText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: isMe ? colors.textInverse : colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    error: {
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.danger,
    },
  });
