/**
 * textEditorTabs — underline-animated tab bars for TextEditorSheet.
 *
 * Extracted from TextEditorSheet.tsx (pure extraction, zero behavior change):
 *   - AlignmentTabBar: fixed 3-up alignment row (left / center / right)
 *   - AnimationTabBar: horizontal scrolling animation selector
 *
 * Both bars report their item layouts via onLayout so the parent-owned
 * Animated.Values can spring the underline indicator to the active tab.
 */
import React, { type RefObject } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View } from 'react-native';
import { CreatorGlyph } from '../../controls/CreatorGlyph';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconGrammar } from '../../../theme/designTokens';
import { IconSize } from '../../../theme/iconTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useEditorStyles } from './textEditorStyles';
import {
  ALIGNMENTS,
  ANIMATIONS,
  type AlignmentKey,
  type AnimationKey,
  type AnimateUnderline,
  type TabLayout } from './textEditorShared';

// ── AlignmentTabBar ───────────────────────────────────────────────────

export interface AlignmentTabBarProps {
  alignment: AlignmentKey;
  onSelect: (key: AlignmentKey) => void;
  layouts: RefObject<TabLayout[]>;
  underlineLeft: Animated.Value;
  underlineWidth: Animated.Value;
  animateUnderline: AnimateUnderline;
  colors: ThemeColors;
}

export function AlignmentTabBar({
  alignment,
  onSelect,
  layouts,
  underlineLeft,
  underlineWidth,
  animateUnderline,
  colors }: AlignmentTabBarProps) {
  const haptic = useHaptic();
  const styles = useEditorStyles(colors);

  return (
    <View style={styles.tabBar}>
      {ALIGNMENTS.map((a, i) => {
        const isActive = alignment === a.key;
        return (
          <Pressable
            key={a.key}
            onPress={() => { haptic.selection(); onSelect(a.key); }}
            style={styles.tabItem}
            accessibilityLabel={`Align ${a.key}`}
            accessibilityHint="Aligns the text"
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onLayout={(e) => {
              layouts.current[i] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width };
              if (isActive) {
                animateUnderline(layouts.current, underlineLeft, underlineWidth, i);
              }
            }}
          >
            <CreatorGlyph name={a.glyph} size={IconGrammar.metadata} color={isActive ? colors.brand : colors.textSecondary} selected={isActive} />
          </Pressable>
        );
      })}
      <Animated.View
        style={[
          styles.tabUnderline,
          { left: underlineLeft, width: underlineWidth },
        ]}
      />
    </View>
  );
}

// ── AnimationTabBar ───────────────────────────────────────────────────

export interface AnimationTabBarProps {
  animation: AnimationKey;
  onSelect: (key: AnimationKey) => void;
  layouts: RefObject<TabLayout[]>;
  underlineLeft: Animated.Value;
  underlineWidth: Animated.Value;
  animateUnderline: AnimateUnderline;
  colors: ThemeColors;
}

export function AnimationTabBar({
  animation,
  onSelect,
  layouts,
  underlineLeft,
  underlineWidth,
  animateUnderline,
  colors }: AnimationTabBarProps) {
  const haptic = useHaptic();
  const styles = useEditorStyles(colors);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.animContent}>
      {ANIMATIONS.map((a, i) => {
        const isActive = animation === a.key;
        return (
          <View
            key={a.key}
            onLayout={(e) => {
              layouts.current[i] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width };
              if (isActive) {
                animateUnderline(layouts.current, underlineLeft, underlineWidth, i);
              }
            }}
          >
            <Pressable
              onPress={() => { haptic.selection(); onSelect(a.key); }}
              style={styles.animTab}
              accessibilityLabel={`Animation ${a.label}`}
              accessibilityHint="Applies this text animation"
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <AppIcon name={a.icon} size={IconSize.sm} color={isActive ? 'brand' : 'textSecondary'} opticalCenter={true} accessible={false} />
              <Text
                style={[
                  styles.animTabLabel,
                  { color: isActive ? colors.brand : colors.textSecondary },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
      <Animated.View
        style={[
          styles.tabUnderline,
          { left: underlineLeft, width: underlineWidth },
        ]}
      />
    </ScrollView>
  );
}
