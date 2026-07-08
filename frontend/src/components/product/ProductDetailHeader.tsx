import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ProductDetailHeaderProps {
  brand?: string;
  title: string;
  price: string;
  scrollY: SharedValue<number>;
  heroHeight: number;
  onBack: () => void;
  onShare: () => void;
  isFav: boolean;
  onToggleFav: () => void;
}

export function ProductDetailHeader({
  brand,
  title,
  price,
  scrollY,
  heroHeight,
  onBack,
  onShare,
  isFav,
  onToggleFav,
}: ProductDetailHeaderProps) {
  const insets = useSafeAreaInsets();

  const containerStyle = useAnimatedStyle(() => {
    const threshold = heroHeight - 60;
    const opacity = interpolate(
      scrollY.value,
      [threshold - 80, threshold],
      [0, 1],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      scrollY.value,
      [threshold - 80, threshold],
      [-20, 0],
      Extrapolation.CLAMP
    );
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <Reanimated.View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, Space.sm) },
        containerStyle,
      ]}
      pointerEvents="auto"
    >
      <View style={styles.row}>
        <View style={styles.leftSection}>
          <View style={styles.iconBtn}>
            <Ionicons
              name="arrow-back"
              size={22}
              color={Colors.textPrimary}
              onPress={onBack}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            />
          </View>
          <View style={styles.titleSection}>
            {brand ? (
              <Text style={styles.brand} numberOfLines={1}>
                {brand}
              </Text>
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          <View style={styles.iconBtn}>
            <Ionicons
              name="share-outline"
              size={20}
              color={Colors.textPrimary}
              onPress={onShare}
              accessibilityLabel="Share"
              accessibilityRole="button"
            />
          </View>
          <View style={styles.iconBtn}>
            <Ionicons
              name={isFav ? 'heart' : 'heart-outline'}
              size={20}
              color={isFav ? Colors.danger : Colors.textPrimary}
              onPress={onToggleFav}
              accessibilityLabel={isFav ? 'Remove from wishlist' : 'Add to wishlist'}
              accessibilityRole="button"
            />
          </View>
        </View>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{price}</Text>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    zIndex: 50,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Space.sm,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    flex: 1,
  },
  brand: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  priceRow: {
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
});
