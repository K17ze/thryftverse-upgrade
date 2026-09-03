/**
 * SyncStatusBadge — subtle, non-intrusive indicator for the offline sync
 * engine state.
 *
 * Renders only when the engine has something to communicate (pending,
 * failed, offline, conflict). `syncing` is opt-in via the `showSyncing`
 * prop because the pulse is transient and most surfaces only care about
 * sticky states. `idle` never renders — the resting state is silence.
 *
 * Design (AGENTS.md §4):
 *  - No decorative chrome. Just an icon and a label on a transparent canvas.
 *  - One icon family (Ionicons), one metadata glyph band (12pt).
 *  - Pulsing dot for `syncing` (Reanimated, reduced-motion collapses to
 *    a static dot). Warning glyph for `failed`, cloud-off for `offline`,
 *    alert for `conflict`, sync for `pending`.
 *  - Status colour comes from the semantic theme tokens (warning / danger /
 *    success) — never hardcoded hex.
 *  - Accessibility: the badge is a status element; the label is the
 *    accessibility label so VoiceOver / TalkBack reads the real state.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, IconGrammar } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  type SyncState,
  type SyncStatus,
  getSyncStatusLabel,
  shouldShowSyncIndicator,
} from '../storage/syncStatus';

export interface SyncStatusBadgeProps {
  /** The sync state from `useSyncState()`. */
  state: SyncState;
  /** Show the transient `syncing` pulse. Defaults to false — most surfaces
   *  only surface sticky states to avoid indicator chatter. */
  showSyncing?: boolean;
  /** Override the label text. Defaults to `getSyncStatusLabel(status)`. */
  label?: string;
}

interface ToneStyle {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

function resolveTone(status: SyncStatus, colors: ThemeColors): ToneStyle {
  switch (status) {
    case 'syncing':
      return { icon: 'sync-outline', color: colors.warning };
    case 'pending':
      return { icon: 'sync-outline', color: colors.warning };
    case 'failed':
      return { icon: 'warning-outline', color: colors.danger };
    case 'offline':
      return { icon: 'cloud-offline-outline', color: colors.warning };
    case 'conflict':
      return { icon: 'alert-circle-outline', color: colors.danger };
    case 'idle':
    default:
      return { icon: 'checkmark-circle-outline', color: colors.success };
  }
}

const PULSE_DURATION = 1100;

/**
 * A small dot that pulses opacity while syncing. Reduced-motion users get a
 * static dot — no animation, same visual intent (something is in flight).
 */
function SyncingDot({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  const dotStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: 1 };
    }
    return {
      opacity: withRepeat(
        withTiming(0.3, { duration: PULSE_DURATION, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    };
  }, [reducedMotion]);

  return <Reanimated.View style={[styles.dot, { backgroundColor: color }, dotStyle]} />;
}

export function SyncStatusBadge({ state, showSyncing = false, label }: SyncStatusBadgeProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();

  const { status } = state;

  // idle is silence. syncing is opt-in to avoid chatter.
  if (status === 'idle') return null;
  if (status === 'syncing' && !showSyncing) return null;
  if (!shouldShowSyncIndicator(state) && status !== 'syncing') return null;

  const tone = resolveTone(status, colors);
  const text = label ?? getSyncStatusLabel(status);
  const isSyncing = status === 'syncing';

  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityLabel={`Sync status: ${text}`}
    >
      {isSyncing ? (
        <SyncingDot color={tone.color} reducedMotion={reducedMotion} />
      ) : (
        <Ionicons name={tone.icon} size={IconGrammar.badge} color={tone.color} />
      )}
      <Text
        style={[styles.text, { color: tone.color }]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7 / 2,
  },
  text: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
