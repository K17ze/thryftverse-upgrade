import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { CachedImage } from '../CachedImage';
import { IconSize } from '../../theme/iconTokens';

export interface SellerThumbRailItem {
  id: string;
  imageUri: string | null;
  /** One-line label under the thumbnail. */
  label: string;
  /** One-line metadata, e.g. price. */
  meta?: string;
}

export interface SellerThumbRailProps {
  items: SellerThumbRailItem[];
  onItemPress: (id: string) => void;
}

const THUMB_SIZE = 64;
const ITEM_WIDTH = 88;

/**
 * SellerThumbRail — flat horizontal media rail for the Seller Hub.
 * The image is the primary visual anchor; there is no card chrome — the
 * image radius is the containment. Missing media renders an honest
 * surfaceAlt placeholder, never a fake thumbnail.
 */
export const SellerThumbRail: React.FC<SellerThumbRailProps> = ({ items, onItemPress }) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
    >
      {items.map((item) => (
        <AnimatedPressable
          key={item.id}
          onPress={() => onItemPress(item.id)}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={item.meta ? `${item.label}, ${item.meta}` : item.label}
          style={styles.item}
        >
          {item.imageUri ? (
            <CachedImage
              uri={item.imageUri}
              style={styles.thumb}
              containerStyle={styles.thumbSurface}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <AppIcon
                concept="tag"
                size={IconSize.xs}
                color="textMuted"
                opticalCenter
                accessible={false}
              />
            </View>
          )}
          <Text style={[styles.itemLabel, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.label}
          </Text>
          {item.meta ? (
            <Text style={[styles.itemMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {item.meta}
            </Text>
          ) : null}
        </AnimatedPressable>
      ))}
    </ScrollView>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    railContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
    },
    item: {
      width: ITEM_WIDTH,
      minHeight: Control.hit,
    },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: Radius.md,
      overflow: 'hidden',
    },
    thumbSurface: {
      backgroundColor: colors.surfaceAlt,
    },
    thumbPlaceholder: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: {
      marginTop: Space.xs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    itemMeta: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
  });
}
