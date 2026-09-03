import React, { memo, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { haptics } from '../../utils/haptics';
import { Space, Radius, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { CategoryWorld } from '../../services/marketApi';

// ════════════════════════════════════════════════════════════════
// CATEGORY RAIL — compact horizontal image rail, max 3 visible
// ════════════════════════════════════════════════════════════════
export const CategoryRailTile = memo(function CategoryRailTile({
  world,
  onPress,
  cardWidth }: {
  world: CategoryWorld;
  onPress: () => void;
  cardWidth: number;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasImage = Boolean(world.representativeImageUrl);
  return (
    <Pressable
      style={[styles.categoryTile, { width: cardWidth }]}
      onPress={() => { haptics.tap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${world.displayName} auctions`}
    >
      {hasImage ? (
        <CachedImage
          uri={world.representativeImageUrl!}
          style={StyleSheet.absoluteFill}
          containerStyle={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        // Deliberate editorial placeholder — not a skeleton
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />
      )}
      {/* Restrained gradient only behind label */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.categoryTileOverlay}>
        <Text style={styles.categoryTileName} numberOfLines={1}>{world.displayName}</Text>
      </View>
    </Pressable>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    categoryTile: {
      height: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl - 20,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    categoryTileOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md },
    categoryTileName: {
      fontSize: TypographyV2.bodyStrong.size,
      fontWeight: '700',
      color: colors.textInverse,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: LetterSpacing.normal - 0.1 } });
}
