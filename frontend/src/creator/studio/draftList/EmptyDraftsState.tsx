/**
 * EmptyDraftsState — empty state for CreatorDraftListScreen: static
 * text with a one-shot entrance fade. Extracted verbatim from
 * CreatorDraftListScreen.tsx.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { Motion } from '../../../theme/motionTokens';
import type { createStyles } from './draftListStyles';

// ── Empty state — static icon with one-shot entrance fade ──────────
// Per AGENTS.md §17, continuous pulsing/breathing is prohibited on
// empty states. A restrained entrance fade replaces the old breathing
// animation for a calmer, more premium empty-state.
interface EmptyDraftsStateProps {
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  onCreate: () => void;
}

export function EmptyDraftsState({ styles, reduceMotion, onCreate }: EmptyDraftsStateProps) {
  const entranceSV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      // Per §5.14: entrance uses timing (ease-out), not spring.
      entranceSV.value = withDelay(100, withTiming(1, { duration: Motion.duration.slow, easing: Motion.easing.entrance }));
    }
  }, [reduceMotion, entranceSV]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceSV.value,
    transform: [{ translateY: interpolate(entranceSV.value, [0, 1], [12, 0], Extrapolation.CLAMP) }] }));

  return (
    <View style={styles.emptyState}>
      <Reanimated.View style={entranceStyle}>
        <Text style={styles.emptyTitle}>No drafts yet</Text>
        <Text style={styles.emptySubtitle}>Start creating to see your drafts here.</Text>
      </Reanimated.View>
      <Pressable
        onPress={onCreate}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="New post"
        accessibilityHint="Starts a new draft"
        accessibilityRole="button"
      >
        <Text style={styles.emptyCtaText}>New post</Text>
      </Pressable>
    </View>
  );
}
