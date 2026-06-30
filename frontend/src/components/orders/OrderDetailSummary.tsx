import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

interface Props {
  title: string;
  imageUrl: string;
  subtitle?: string;
  priceLabel: string;
  listingAvailable: boolean;
  onPress?: () => void;
}

export function OrderDetailSummary({
  title,
  imageUrl,
  subtitle,
  priceLabel,
  listingAvailable,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}, ${priceLabel}${listingAvailable ? '' : ', listing no longer available'}`}
    >
      <CachedImage
        uri={imageUrl}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
        <Text style={styles.price}>{priceLabel}</Text>
        {!listingAvailable ? (
          <View style={styles.unavailableRow}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.unavailableText}>Listing no longer available</Text>
          </View>
        ) : null}
      </View>
      {onPress && listingAvailable ? (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  image: {
    width: 96,
    height: 120,
    borderRadius: 8,
    backgroundColor: Colors.surfaceAlt,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  price: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  unavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  unavailableText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});
