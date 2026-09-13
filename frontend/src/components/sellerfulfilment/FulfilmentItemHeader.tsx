import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import { createSellerFulfilmentStyles } from './sellerFulfilmentScreenStyles';

export interface FulfilmentItemHeaderProps {
  imageUrl: string | null;
  title: string | null;
  /** Precomposed ship-by line text (urgency copy included). */
  shipByText: string;
  shipByUrgent: boolean;
  shipByOverdue: boolean;
  serviceName: string | null;
  trackingIncluded?: boolean;
  etaWindow: string | null;
}

/**
 * Item-dominant header: merges the former deadline panel, item row, and
 * service card into one authored composition. The item image is the visual
 * anchor; the ship-by urgency colour applies to the "Ship by" text only,
 * not a full panel background.
 */
export function FulfilmentItemHeader({
  imageUrl,
  title,
  shipByText,
  shipByUrgent,
  shipByOverdue,
  serviceName,
  trackingIncluded,
  etaWindow }: FulfilmentItemHeaderProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  return (
    <View style={styles.itemHeader}>
      {imageUrl ? (
        <CachedImage uri={imageUrl} style={styles.itemImage} contentFit="cover" />
      ) : (
        <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
          <Ionicons name="image-outline" size={24} color={colors.textMuted} aria-hidden={true} />
        </View>
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {title || 'Ordered item'}
        </Text>
        <Text
          style={[
            styles.shipByLine,
            {
              color: shipByOverdue
                ? colors.danger
                : shipByUrgent
                  ? colors.warning
                  : colors.textSecondary },
          ]}
        >
          {shipByText}
        </Text>
        {serviceName && (
          <Text style={styles.serviceLine} numberOfLines={1}>
            {serviceName}
            {trackingIncluded ? ' · Tracked' : ''}
            {etaWindow ? ` · ETA ${etaWindow}` : ''}
          </Text>
        )}
      </View>
    </View>
  );
}
