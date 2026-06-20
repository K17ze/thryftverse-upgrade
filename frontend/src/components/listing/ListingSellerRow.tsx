import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import type { ListingSeller } from '../../data/mockData';

interface ListingSellerRowProps {
  seller?: ListingSeller | null;
  sellerId?: string;
  onProfilePress: () => void;
  onMessage: () => void;
}

export function ListingSellerRow({
  seller,
  sellerId,
  onProfilePress,
  onMessage,
}: ListingSellerRowProps) {
  if (seller) {
    return (
      <View style={styles.container}>
        <AnimatedPressable
          style={styles.identityTap}
          onPress={onProfilePress}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={`Open @${seller.username || 'seller'} profile`}
        >
          <CachedImage
            uri={seller.avatar || ''}
            style={styles.avatar}
            containerStyle={{ width: 40, height: 40, borderRadius: 20 }}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              @{seller.username || 'Seller'}
            </Text>
            {seller.rating != null && seller.reviewCount != null ? (
              <View style={styles.metaRow}>
                <Ionicons name="star" size={11} color={Colors.brand} />
                <Text style={styles.metaText}>
                  {seller.rating} · {seller.reviewCount} reviews
                </Text>
              </View>
            ) : seller.rating != null ? (
              <View style={styles.metaRow}>
                <Ionicons name="star" size={11} color={Colors.brand} />
                <Text style={styles.metaText}>{seller.rating} rating</Text>
              </View>
            ) : seller.reviewCount != null ? (
              <Text style={styles.metaText} numberOfLines={1}>{seller.reviewCount} reviews</Text>
            ) : seller.location ? (
              <Text style={styles.metaText} numberOfLines={1}>{seller.location}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </AnimatedPressable>

        <AppButton
          title="Message"
          style={styles.messageBtn}
          titleStyle={styles.messageBtnText}
          variant="secondary"
          size="sm"
          onPress={onMessage}
        />
      </View>
    );
  }

  if (sellerId) {
    return (
      <View style={styles.container}>
        <View style={styles.identityTap}>
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={18} color={Colors.textMuted} />
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>Seller</Text>
            <Text style={styles.metaText}>Seller information unavailable</Text>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  identityTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  messageBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  messageBtnText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
});
