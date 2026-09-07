import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, FontFamily, Control, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { haptics } from '../../../utils/haptics';

export interface CoOwnAssetHeaderProps {
  title: string;
  reference?: string;
  isWatched: boolean;
  onBack: () => void;
  onToggleWatch: () => void;
  onShare: () => void;
  onOverflow: () => void;
}

export function CoOwnAssetHeader({
  title,
  reference,
  isWatched,
  onBack,
  onToggleWatch,
  onShare,
  onOverflow,
}: CoOwnAssetHeaderProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const handleWatchPress = () => {
    haptics.selection();
    onToggleWatch();
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, Space.xs),
          backgroundColor: colors.background,
          borderBottomColor: colors.borderSubtle,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* Back navigation target */}
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.iconTarget, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>

        {/* Compact center title with progressive context */}
        <View style={styles.titleContainer}>
          <Text
            style={[styles.headerTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {title}
          </Text>
          {reference ? (
            <Text
              style={[styles.headerSubtitle, { color: colors.textSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {reference}
            </Text>
          ) : null}
        </View>

        {/* Right actions: Watch (Market action) + Share + Overflow */}
        <View style={styles.rightActions}>
          <Pressable
            onPress={handleWatchPress}
            hitSlop={8}
            style={({ pressed }) => [styles.iconTarget, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            accessibilityState={{ selected: isWatched }}
          >
            <Ionicons
              name={isWatched ? 'eye' : 'eye-outline'}
              size={21}
              color={isWatched ? colors.brand : colors.textPrimary}
            />
          </Pressable>

          <Pressable
            onPress={onShare}
            hitSlop={8}
            style={({ pressed }) => [styles.iconTarget, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Share asset"
          >
            <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          </Pressable>

          <Pressable
            onPress={onOverflow}
            hitSlop={8}
            style={({ pressed }) => [styles.iconTarget, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  contentRow: {
    height: Control.hit,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  iconTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: PressScale.gentle }],
  },
  titleContainer: {
    flex: 1,
    paddingHorizontal: Space.xs,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: TypographyV2.itemTitle.size,
    lineHeight: TypographyV2.itemTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.itemTitle.letterSpacing,
  },
  headerSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
