import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { DEFAULT_CURRENCY_CODE } from '../../constants/currencies';

/**
 * Normalised item shape for the ShopRail — decoupled from both the domain
 * Listing type and the ListingApiItem backend type so both profile screens
 * can feed it without a heavy mapper.
 */
export interface ShopRailItem {
  id: string;
  title: string;
  price: number;
  imageUri: string;
  brand: string | null;
  isSold?: boolean;
  isPinned?: boolean;
}

interface ShopRailProps {
  items: ShopRailItem[];
  onPressItem: (id: string) => void;
  /** Optional: long-press handler for owner pin/unpin (MyProfile only). */
  onLongPressItem?: (id: string) => void;
}

const CARD_WIDTH = 140;
const CARD_IMAGE_HEIGHT = 186; // ~3:4 portrait

/**
 * ShopRail — horizontal discovery rail showing a curated selection of a
 * user's listings. Renders nothing when the items list is empty (no empty
 * state — the rail is simply omitted per spec).
 *
 * Design: flat canvas, one "Shop" title, hairline separator above, compact
 * portrait cards with price below the image. Pinned items show a small pin
 * glyph. No card-on-card, no decorative chrome.
 */
export function ShopRail({ items, onPressItem, onLongPressItem }: ShopRailProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shop</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => {
          const hasImage = item.imageUri.length > 0;
          return (
            <AnimatedPressable
              key={item.id}
              style={styles.card}
              onPress={() => onPressItem(item.id)}
              onLongPress={onLongPressItem ? () => onLongPressItem(item.id) : undefined}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${formatFromFiat(item.price, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}${item.isPinned ? ', pinned' : ''}${item.isSold ? ', sold' : ''}`}
              accessibilityHint="Opens listing details"
            >
              <View style={styles.imageWrap}>
                {hasImage ? (
                  <CachedImage
                    uri={item.imageUri}
                    style={styles.image}
                    containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.md }}
                    contentFit="cover"
                    downscaleWidth={CARD_WIDTH}
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="shirt-outline" size={24} color={colors.textMuted} />
                  </View>
                )}
                {item.isPinned ? (
                  <View style={styles.pinnedBadge} pointerEvents="none">
                    <Ionicons name="pin" size={11} color={colors.scrimTextPrimary} />
                  </View>
                ) : null}
                {item.isSold ? (
                  <View style={styles.soldOverlay} pointerEvents="none">
                    <Text style={styles.soldText}>Sold</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.price} numberOfLines={1}>
                {formatFromFiat(item.price, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}
              </Text>
              <Text style={styles.brand} numberOfLines={1}>
                {item.brand ?? item.title}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingVertical: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    header: {
      paddingHorizontal: Space.md,
      marginBottom: Space.sm,
    },
    title: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
    },
    card: {
      width: CARD_WIDTH,
    },
    imageWrap: {
      width: CARD_WIDTH,
      height: CARD_IMAGE_HEIGHT,
      borderRadius: Radius.md,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: colors.surfaceAlt,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imagePlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    pinnedBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    soldOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    soldText: {
      color: colors.scrimTextPrimary,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
    },
    price: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      marginTop: Space.xs + 1,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
    brand: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });
}
