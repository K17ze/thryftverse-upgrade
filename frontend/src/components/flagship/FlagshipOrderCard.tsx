import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { PremiumStatusPill } from '../ui/PremiumStatusPill';

interface FlagshipOrderCardProps {
  imageUri?: string | null;
  listingTitle: string;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  price: string;
  sellerName?: string;
  buyerName?: string;
  orderDate?: string;
  onPress?: () => void;
  index?: number;
}

export function FlagshipOrderCard({
  imageUri,
  listingTitle,
  status,
  price,
  sellerName,
  buyerName,
  orderDate,
  onPress,
  index = 0,
}: FlagshipOrderCardProps) {
  const tone =
    status === 'delivered'
      ? 'delivered'
      : status === 'shipped'
      ? 'shipped'
      : status === 'cancelled' || status === 'refunded'
      ? 'error'
      : 'pending';

  const actorLabel = buyerName ? `To ${buyerName}` : sellerName ? `From ${sellerName}` : '';

  return (
    <Reanimated.View entering={FadeInDown.delay(index * 40).duration(350)}>
      <AnimatedPressable onPress={onPress} style={styles.root} {...PressPresets.listRow}>
        {/* Product Image */}
        <View style={styles.imageWrap}>
          {imageUri ? (
            <CachedImage
              uri={imageUri}
              style={styles.image}
              contentFit="cover"
              transition={250}
            />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Ionicons name="cube-outline" size={28} color={Colors.textMuted} />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text numberOfLines={1} style={styles.title}>
              {listingTitle}
            </Text>
            <Text style={styles.price}>{price}</Text>
          </View>

          <View style={styles.middleRow}>
            <PremiumStatusPill tone={tone} label={status.charAt(0).toUpperCase() + status.slice(1)} />
            {actorLabel ? <Text style={styles.actor}>{actorLabel}</Text> : null}
          </View>

          {orderDate ? (
            <Text style={styles.date}>{orderDate}</Text>
          ) : null}
        </View>

        {/* Chevron */}
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} style={styles.chevron} />
      </AnimatedPressable>
    </Reanimated.View>
  );
}

const IMAGE_SIZE = 72;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imageWrap: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginLeft: Space.sm,
    justifyContent: 'center',
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: Type.body.size,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  price: {
    fontSize: Type.price.size,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexWrap: 'wrap',
  },
  actor: {
    fontSize: Type.caption.size,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  date: {
    fontSize: Type.meta.size,
    fontWeight: '400',
    color: Colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    marginLeft: Space.xs,
  },
});
