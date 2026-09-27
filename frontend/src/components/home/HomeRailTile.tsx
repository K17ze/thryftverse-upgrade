import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { openProductDetail } from '../../platform/product/openProductDetail';

export const RAIL_TILE_WIDTH = 148;
const RAIL_TILE_IMAGE_HEIGHT = 185;

export interface HomeRailTileData {
  id: string;
  title: string;
  brand?: string | null;
  price: number;
  image: string | null;
}

interface HomeRailTileProps {
  item: HomeRailTileData;
}

/**
 * HomeRailTile — the compact product tile every home module shelf renders
 * (recently viewed, fresh drops). Media-first at rail scale: reserved 4:5
 * frame, one identity line, tabular price. The object is the label.
 */
export function HomeRailTile({ item }: HomeRailTileProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();

  const handlePress = React.useCallback(() => {
    haptic.light();
    openProductDetail(navigation, {
      referenceKind: 'listing',
      canonicalId: item.id,
      sourceSurface: 'HomeRail',
    });
  }, [haptic, navigation, item.id]);

  return (
    <AnimatedPressable
      style={styles.tile}
      onPress={handlePress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`View ${item.title}${item.brand ? ` by ${item.brand}` : ''}`}
      accessibilityHint="Opens listing details"
    >
      <View style={styles.mediaWrap}>
        {item.image ? (
          <CachedImage
            uri={item.image}
            style={styles.media}
            contentFit="cover"
            downscaleWidth={RAIL_TILE_WIDTH}
          />
        ) : null}
      </View>
      {item.brand ? (
        <Text style={styles.brand} numberOfLines={1} maxFontSizeMultiplier={1.5}>
          {item.brand}
        </Text>
      ) : null}
      <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.5}>
        {item.title}
      </Text>
      <Text style={styles.price} numberOfLines={1} maxFontSizeMultiplier={1.5}>
        {formatFromFiat(item.price, 'GBP')}
      </Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    tile: {
      width: RAIL_TILE_WIDTH },
    mediaWrap: {
      width: RAIL_TILE_WIDTH,
      height: RAIL_TILE_IMAGE_HEIGHT,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    media: {
      width: '100%',
      height: '100%' },
    brand: {
      marginTop: Space.xs + 2,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted },
    title: {
      marginTop: Space.xxs,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    price: {
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'] },
  });
