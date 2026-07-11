import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { useStore } from '../../store/useStore';
import { haptics } from '../../utils/haptics';

export interface CoOwnWatchButtonProps {
  assetId: string;
  assetTitle: string;
}

export function CoOwnWatchButton({ assetId, assetTitle }: CoOwnWatchButtonProps) {
  const { colors } = useAppTheme();
  const isWatched = useStore((s) => s.coOwnWatchlist.includes(assetId));
  const toggleCoOwnWatch = useStore((s) => s.toggleCoOwnWatch);

  const handlePress = useCallback(() => {
    haptics.tap();
    toggleCoOwnWatch(assetId);
  }, [assetId, toggleCoOwnWatch]);

  return (
    <AnimatedPressable
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
        isWatched && { backgroundColor: `${colors.brand}10`, borderColor: `${colors.brand}40` },
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
      scaleValue={0.96}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={
        isWatched
          ? `Remove ${assetTitle} from watchlist`
          : `Add ${assetTitle} to watchlist`
      }
      accessibilityState={{ selected: isWatched }}
    >
      <Ionicons
        name={isWatched ? 'eye' : 'eye-outline'}
        size={15}
        color={isWatched ? colors.brand : colors.textSecondary}
      />
      <Text
        style={[
          styles.label,
          { color: isWatched ? colors.brand : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {isWatched ? 'Watching' : 'Watch'}
      </Text>
      {isWatched ? (
        <View style={[styles.notificationDot, { backgroundColor: colors.brand }]} />
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
  },
  label: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.1,
  },
  notificationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
});
