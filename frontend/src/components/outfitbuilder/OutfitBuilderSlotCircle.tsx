import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { getSlotIcon, getSlotLabel, type OutfitSlot, type StyleItem } from '../../services/styleGraph';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { haptics } from '../../utils/haptics';

export interface OutfitBuilderSlotCircleProps {
  slot: OutfitSlot;
  item?: StyleItem;
  isActive: boolean;
  onPress: () => void;
  slotSize: number;
}

function OutfitBuilderSlotCircleImpl({
  slot,
  item,
  isActive,
  onPress,
  slotSize }: OutfitBuilderSlotCircleProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, slotSize), [colors, slotSize]);
  return (
    <AnimatedPressable
      style={[styles.circle, isActive && styles.circleActive]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${getSlotLabel(slot)} slot`}
      accessibilityState={{ selected: isActive }}
    >
      {item?.imageUri ? (
        <CachedImage
          uri={item.imageUri}
          style={styles.image}
          priority="low"
        />
      ) : (
        <View style={styles.empty}>
          <Ionicons name={getSlotIcon(slot)} size={20} color={isActive ? colors.brand : colors.textMuted} />
        </View>
      )}
      {isActive && <View style={styles.activeRing} />}
    </AnimatedPressable>
  );
}

export const OutfitBuilderSlotCircle = React.memo(OutfitBuilderSlotCircleImpl);

function createStyles(colors: ThemeColors, slotSize: number) {
  return StyleSheet.create({
  circle: {
    width: slotSize,
    height: slotSize,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center' },
  circleActive: {
    borderColor: colors.brand,
    borderWidth: Stroke.emphasis },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.lg },
  empty: {
    justifyContent: 'center',
    alignItems: 'center' },
  activeRing: {
    position: 'absolute',
    bottom: Space.xs,
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand } });
}
