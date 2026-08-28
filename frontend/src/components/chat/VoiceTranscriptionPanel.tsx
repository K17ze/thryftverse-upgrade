import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, TypeStyles, Typography } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import {
  requestVoiceTranscriptionOnApi,
  fetchVoiceTranscriptionOnApi,
  rateVoiceTranscriptionOnApi,
  type VoiceTranscriptionReceipt,
} from '../../services/chatApi';

export interface VoiceTranscriptionPanelProps {
  conversationId: string;
  messageId: string;
  /** When true, the panel is rendered expanded by default (e.g. accessibility). */
  defaultExpanded?: boolean;
}

type PanelState =
  | 'collapsed'
  | 'requesting'
  | 'processing'
  | 'complete'
  | 'failed_retryable'
  | 'failed_final'
  | 'unsupported';

/**
 * VoiceTranscriptionPanel — opt-in transcription surface for voice messages.
 *
 * Anti-AI design (AGENTS.md §4, §11):
 * - Transcription is never auto-fetched. The user explicitly taps "Show
 *   transcript" to request it. This respects bandwidth, privacy, and the
 *   principle that voice is the message — text is a derived aid.
 * - The derived label "Automatically transcribed" is always shown when text
 *   is displayed, so the user knows it is not the sender's own words.
 * - States are honest: requesting → processing → complete/failed. No fake
 *   typing animation, no placeholder lorem.
 * - Rating (good/bad) feeds the backend quality signal. No star ratings —
 *   a binary signal is sufficient and less noisy.
 */
export function VoiceTranscriptionPanel({
  conversationId,
  messageId,
  defaultExpanded = false,
}: VoiceTranscriptionPanelProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [state, setState] = useState<PanelState>(defaultExpanded ? 'requesting' : 'collapsed');
  const [transcription, setTranscription] = useState<VoiceTranscriptionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userRating, setUserRating] = useState<'good' | 'bad' | null>(null);

  // On first expand, check if a transcription already exists (e.g. from a
  // prior session or server-side auto-queue). If not, request one.
  useEffect(() => {
    if (state !== 'requesting') return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await fetchVoiceTranscriptionOnApi(conversationId, messageId);
        if (cancelled) return;
        if (existing) {
          setTranscription(existing);
          setUserRating(existing.rating);
          if (existing.state === 'complete') {
            setState('complete');
          } else if (existing.state === 'processing' || existing.state === 'queued') {
            setState('processing');
          } else if (existing.state === 'failed_retryable') {
            setState('failed_retryable');
            setError(existing.failureReason ?? 'Transcription is temporarily unavailable');
          } else if (existing.state === 'failed_final') {
            setState('failed_final');
            setError(existing.failureReason ?? 'Transcription failed');
          } else if (existing.state === 'unsupported') {
            setState('unsupported');
          }
          return;
        }
        // No existing transcription — request one.
        const receipt = await requestVoiceTranscriptionOnApi(conversationId, messageId);
        if (cancelled) return;
        setTranscription(receipt);
        if (receipt.state === 'complete') {
          setState('complete');
        } else if (receipt.state === 'processing' || receipt.state === 'queued') {
          setState('processing');
        } else if (receipt.state === 'failed_retryable') {
          setState('failed_retryable');
          setError(receipt.failureReason ?? 'Transcription is temporarily unavailable');
        } else if (receipt.state === 'failed_final') {
          setState('failed_final');
          setError(receipt.failureReason ?? 'Transcription failed');
        } else if (receipt.state === 'unsupported') {
          setState('unsupported');
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load transcript');
        setState('failed_retryable');
      }
    })();
    return () => { cancelled = true; };
  }, [state, conversationId, messageId]);

  // Poll while processing.
  useEffect(() => {
    if (state !== 'processing') return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const latest = await fetchVoiceTranscriptionOnApi(conversationId, messageId);
        if (cancelled || !latest) return;
        setTranscription(latest);
        if (latest.state === 'complete') {
          setState('complete');
          haptic.light();
        } else if (latest.state === 'failed_retryable') {
          setState('failed_retryable');
          setError(latest.failureReason ?? 'Transcription is temporarily unavailable');
        } else if (latest.state === 'failed_final') {
          setState('failed_final');
          setError(latest.failureReason ?? 'Transcription failed');
        } else if (latest.state === 'unsupported') {
          setState('unsupported');
        }
      } catch {
        // Network blip — keep polling.
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state, conversationId, messageId, haptic]);

  const handleExpand = useCallback(() => {
    setState('requesting');
    haptic.selection();
  }, [haptic]);

  const handleCollapse = useCallback(() => {
    setState('collapsed');
    haptic.light();
  }, [haptic]);

  const handleRetry = useCallback(() => {
    setError(null);
    setState('requesting');
    haptic.light();
  }, [haptic]);

  const handleRate = useCallback(
    async (rating: 'good' | 'bad') => {
      if (userRating === rating) return;
      setUserRating(rating);
      haptic.selection();
      try {
        await rateVoiceTranscriptionOnApi(conversationId, messageId, rating);
      } catch {
        // Revert on failure.
        setUserRating(null);
      }
    },
    [conversationId, messageId, userRating, haptic],
  );

  if (state === 'collapsed') {
    return (
      <Pressable
        onPress={handleExpand}
        style={styles.trigger}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Show transcript for this voice message"
        accessibilityHint="Requests an automatic transcription. The text is derived, not the sender's own words."
      >
        <Ionicons name="document-text-outline" size={13} color={colors.textMuted} />
        <Text style={styles.triggerText}>Transcript</Text>
      </Pressable>
    );
  }

  if (state === 'unsupported') {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={styles.mutedText}>Transcription not available for this audio format</Text>
        </View>
        <Pressable onPress={handleCollapse} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close transcript">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  if (state === 'failed_final') {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.errorText} numberOfLines={2}>{error ?? 'Transcription failed'}</Text>
        </View>
        <Pressable onPress={handleCollapse} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close transcript">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  if (state === 'failed_retryable') {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.warningText} numberOfLines={2}>{error ?? 'Temporarily unavailable'}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="Retry transcription">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable onPress={handleCollapse} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close transcript">
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (state === 'requesting' || state === 'processing') {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={styles.mutedText}>
            {state === 'requesting' ? 'Requesting transcript…' : 'Transcribing audio…'}
          </Text>
        </View>
        <Pressable onPress={handleCollapse} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close transcript">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  // state === 'complete'
  const text = transcription?.text ?? '';
  return (
    <View style={styles.container}>
      <View style={styles.textWrap}>
        <Text style={styles.transcriptText}>{text || '(empty transcript)'}</Text>
        <Text style={styles.derivedLabel}>Automatically transcribed</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => handleRate('good')}
          style={[styles.rateBtn, userRating === 'good' && styles.rateBtnActive]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Mark transcription as accurate"
        >
          <Ionicons
            name="thumbs-up-outline"
            size={14}
            color={userRating === 'good' ? colors.brand : colors.textMuted}
          />
        </Pressable>
        <Pressable
          onPress={() => handleRate('bad')}
          style={[styles.rateBtn, userRating === 'bad' && styles.rateBtnActive]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Mark transcription as inaccurate"
        >
          <Ionicons
            name="thumbs-down-outline"
            size={14}
            color={userRating === 'bad' ? colors.danger : colors.textMuted}
          />
        </Pressable>
        <Pressable onPress={handleCollapse} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close transcript">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    triggerText: {
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textMuted,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm,
      paddingVertical: Space.xs + 1,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 1,
    },
    textWrap: {
      flex: 1,
      gap: 2,
    },
    transcriptText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textPrimary,
      lineHeight: Type.caption.lineHeight + 2,
    },
    derivedLabel: {
      fontSize: Type.meta.size - 1,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    mutedText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textMuted,
    },
    errorText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.danger,
    },
    warningText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.warning,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    retryBtn: {
      paddingHorizontal: Space.sm,
      paddingVertical: 2,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceElevated,
    },
    retryText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    rateBtn: {
      width: 28,
      height: 28,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.full,
    },
    rateBtnActive: {
      backgroundColor: colors.surfaceElevated,
    },
  });
