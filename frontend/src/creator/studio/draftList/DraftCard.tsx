/**
 * DraftCard — a draft row for CreatorDraftListScreen with stagger
 * entrance and spring thumbnail. Extracted verbatim from
 * CreatorDraftListScreen.tsx.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { DraftMeta } from '../../core/projectStore/drafts';
import { formatRelativeTime } from '../../../utils/dateFormat';
import { CreatorCanvas } from '../CreatorCanvas';
import { SwipeableRow } from '../../../components/SwipeableRow';
import { Motion } from '../../../theme/motionTokens';
import type { CreatorDocument } from '../../core/projectStore/composition';
import type { createStyles } from './draftListStyles';

// ── DraftCard with stagger entrance and spring thumbnail ───────────
interface DraftCardProps {
  item: DraftMeta;
  doc: CreatorDocument | null | undefined;
  index: number;
  finalThumbW: number;
  finalThumbH: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  onPress: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSwipeDelete: () => void;
}

export function DraftCard({
  item,
  doc,
  index,
  finalThumbW,
  finalThumbH,
  colors,
  styles,
  reduceMotion,
  onPress,
  onDuplicate,
  onDelete,
  onSwipeDelete }: DraftCardProps) {
  // Thumbnail press spring scale
  const thumbScale = useSharedValue(1);
  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbScale.value }] }));

  // Refined stagger entrance — opacity only (no scale), 30ms delay per
  // card, 200ms duration. Capped to the first viewport per Motion.stagger.maxItems
  // so long lists do not animate their entire history (AGENTS §16).
  // Respects reduceMotion (opacity = 1 immediately).
  const entranceOpacity = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      entranceOpacity.value = 1;
    } else if (index < Motion.stagger.maxItems) {
      entranceOpacity.value = withDelay(index * 30, withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance }));
    } else {
      // Beyond the first viewport — appear instantly, no cascade.
      entranceOpacity.value = 1;
    }
  }, [reduceMotion, index, entranceOpacity]);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value }));

  return (
    <Reanimated.View style={entranceStyle}>
    <SwipeableRow
        accessibilityLabel={`Open draft ${item.title}`}
        accessibilityHint="Swipe left to delete"
        onPress={onPress}
        rightAction={{
          icon: 'trash-outline',
          label: 'Delete',
          onPress: onSwipeDelete,
          color: colors.dangerText }}
        swipeThreshold={88}
      >
        <View style={styles.draftRow}>
          <Pressable
            onPress={onPress}
            onPressIn={() => { if (!reduceMotion) thumbScale.value = withSpring(0.95, Motion.spring.tap); }}
            onPressOut={() => { if (!reduceMotion) thumbScale.value = withSpring(1, Motion.spring.tap); }}
            accessibilityLabel={`Open draft ${item.title}`}
            accessibilityHint="Opens the draft for editing"
            accessibilityRole="button"
          >
            <Reanimated.View style={[thumbAnimatedStyle]}>
              {doc ? (
                <View style={[styles.draftThumb, { width: finalThumbW, height: finalThumbH }]}>
                  <CreatorCanvas
                    document={doc}
                    page={doc.pages[0]}
                    canvasWidth={finalThumbW}
                    canvasHeight={finalThumbH}
                    mode="view"
                  />
                </View>
              ) : (
                <View style={[styles.draftIcon, { width: finalThumbW, height: finalThumbH, backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons
                    name={item.type === 'look' ? 'shirt-outline' : 'film-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </View>
              )}
            </Reanimated.View>
          </Pressable>
          <View style={styles.draftInfo}>
            <Text style={styles.draftTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.draftMetaRow}>
              <View style={[styles.draftTypeDot, item.type === 'look' ? styles.draftTypeDotLook : styles.draftTypeDotPoster]} />
              <Text style={styles.draftMeta} numberOfLines={1}>
                {formatRelativeTime(item.updatedAt)}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={onDuplicate}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Duplicate draft ${item.title}`}
              accessibilityHint="Creates a copy of this draft"
              accessibilityRole="button"
            >
              <Ionicons name="copy-outline" size={IconGrammar.metadata} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Delete draft ${item.title}`}
              accessibilityHint="Shows the delete confirmation"
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={IconGrammar.metadata} color={colors.dangerText} />
            </Pressable>
          </View>
        </View>
      </SwipeableRow>
    </Reanimated.View>
  );
}
