import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Stroke, Typography } from '../../theme/designTokens';
import type { StyleItem } from '../../services/styleGraph';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { T } from '../ui/Text';
import { haptics } from '../../utils/haptics';

export interface OutfitBuilderItemThumbProps {
  item: StyleItem;
  onPress: () => void;
  isSelected: boolean;
  screenWidth: number;
}

function OutfitBuilderItemThumbImpl({
  item,
  onPress,
  isSelected,
  screenWidth }: OutfitBuilderItemThumbProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  return (
    <AnimatedPressable
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {item.imageUri ? (
        <CachedImage uri={item.imageUri} style={styles.image} priority="low" />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Ionicons name="image-outline" size={24} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.meta}>
        <T.Caption
          color={colors.textPrimary}
          numberOfLines={1}
          style={{ fontFamily: Typography.family.semibold }}
        >
          {item.title}
        </T.Caption>
        <T.Meta color={colors.textMuted} numberOfLines={1}>
          {item.brand ?? item.category}
        </T.Meta>
      </View>
      {isSelected && (
        <View style={styles.check}>
          <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
        </View>
      )}
    </AnimatedPressable>
  );
}

export const OutfitBuilderItemThumb = React.memo(OutfitBuilderItemThumbImpl);

function createStyles(colors: ThemeColors, screenWidth: number) {
  return StyleSheet.create({
  card: {
    width: (screenWidth - Space.md * 2 - Space.sm) / 2,
    overflow: 'hidden',
    marginBottom: Space.sm,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border,
    paddingBottom: Space.sm },
  cardSelected: {
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border,
    borderWidth: Stroke.emphasis,
    borderColor: colors.brand },
  image: {
    width: '100%',
    height: Space.xxl * 3 - Space.xs,
    backgroundColor: colors.surfaceAlt },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center' },
  meta: {
    padding: Space.sm },
  check: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    backgroundColor: colors.background,
    borderRadius: Radius.full } });
}
