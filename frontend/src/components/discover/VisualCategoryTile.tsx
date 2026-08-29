import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  title: string;
  subtitle?: string;
  imageUri?: string;
  count?: number;
  onPress: () => void;
  size?: 'large' | 'medium' | 'small';
}

export function VisualCategoryTile({
  title,
  subtitle,
  imageUri,
  count,
  onPress,
  size = 'medium' }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: SCREEN_W } = useWindowDimensions();
  const SIZE_MAP = {
    large: { width: SCREEN_W - Space.md * 2, height: 180, titleSize: TypographyV2.screenTitle.size, radius: Radius.xl },
    medium: { width: (SCREEN_W - Space.md * 2 - Space.sm) / 2, height: 140, titleSize: TypographyV2.itemTitle.size, radius: Radius.lg },
    small: { width: (SCREEN_W - Space.md * 2 - Space.sm * 2) / 3, height: 110, titleSize: TypographyV2.body.size, radius: Radius.md } };
  const dims = SIZE_MAP[size];

  const GRADIENT_OVERLAYS: readonly [string, string] = isDark
    ? ['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']
    : ['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.45)'];

  return (
    <AnimatedPressable
      style={[styles.card, { width: dims.width, height: dims.height, borderRadius: dims.radius }]}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityLabel={`${title} category`}
      accessibilityRole="button"
    >
      <CachedImage
        uri={imageUri ?? ''}
        style={StyleSheet.absoluteFill}
        containerStyle={{ borderRadius: dims.radius }}
        contentFit="cover"
        emptyLabel={title}
        emptyIcon="grid-outline"
      />

      <LinearGradient
        colors={GRADIENT_OVERLAYS}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: dims.radius }]}
      />

      <View style={styles.textOverlay}>
        <Text style={[styles.title, { fontSize: dims.titleSize }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
        {count !== undefined ? (
          <View style={styles.countRow}>
            <Ionicons name="shirt-outline" size={10} color={colors.scrimTextSecondary} />
            <Text style={styles.countText}>{count} items</Text>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceAlt },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14 },
  title: {
    fontFamily: Typography.family.bold,
    color: colors.scrimTextPrimary,
    letterSpacing: -0.3,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3 },
  subtitle: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextSecondary,
    marginTop: Space.xxs,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: 6 },
  countText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextSecondary,
    letterSpacing: 0.2 } });
}