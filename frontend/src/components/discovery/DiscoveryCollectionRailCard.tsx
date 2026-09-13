import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import type { GalleriaCollection } from '../../services/galleriaApi';

// ============================================================================
// COLLECTION RAIL CARD — compact card for horizontal rail
// ============================================================================

export function DiscoveryCollectionRailCard({
  collection,
  onPress }: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AnimatedPressable
      style={{ width: 180, marginRight: Space.sm }}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Collection: ${collection.title}`}
    >
      <View style={{ width: 180, height: 240, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        <CachedImage
          uri={collection.coverImage}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' }}
          pointerEvents="none"
        />
        <View style={{ position: 'absolute', left: Space.sm, right: Space.sm, bottom: Space.sm }} pointerEvents="none">
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: FontFamily.semibold, fontSize: TypographyV2.meta.size, letterSpacing: 0.5 }} numberOfLines={1} maxFontSizeMultiplier={2}>
            {collection.theme.toUpperCase()}
          </Text>
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: FontFamily.bold, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight }} numberOfLines={2} maxFontSizeMultiplier={2}>
            {collection.title}
          </Text>
          <Text style={{ color: colors.scrimTextSecondary, fontFamily: FontFamily.regular, fontSize: TypographyV2.meta.size }} numberOfLines={1} maxFontSizeMultiplier={2}>
            {collection.curator}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}
