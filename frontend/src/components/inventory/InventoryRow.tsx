import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ImageStyle,
  type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { ListingApiItem } from '../../services/listingsApi';
import { inventorySharedStyles, type InventoryScreenStyles } from './inventoryScreenStyles';

// ── Status config ──
const STATUS_CONFIG: Record<string, { label: string; accent: 'success' | 'muted' | 'warning' | 'brand' | 'default' }> = {
  active: { label: 'Active', accent: 'success' },
  sold: { label: 'Sold', accent: 'muted' },
  paused: { label: 'Paused', accent: 'warning' },
  draft: { label: 'Draft', accent: 'brand' },
  reserved: { label: 'Reserved', accent: 'warning' },
  unknown: { label: 'Unknown', accent: 'default' } };

export interface InventoryRowProps {
  item: ListingApiItem;
  isLast: boolean;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
  selectionMode: boolean;
  isSelected: boolean;
  isPendingAction: boolean;
  onLongPress: () => void;
  onPress: () => void;
  onEdit: () => void;
  onTogglePause: () => void;
  onRelist: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
}

/** Inventory row — flat canvas, hairline separator between rows. */
export function InventoryRow({
  item,
  isLast,
  colors,
  styles,
  selectionMode,
  isSelected,
  isPendingAction,
  onLongPress,
  onPress,
  onEdit,
  onTogglePause,
  onRelist,
  onDelete,
  onToggleSelect }: InventoryRowProps) {
  const { currencyCode, currencySymbol, formatFromFiat } = useFormattedPrice();
  const statusConfig = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.unknown;
  const statusColor =
    statusConfig.accent === 'success' ? colors.success
    : statusConfig.accent === 'muted' ? colors.textMuted
    : statusConfig.accent === 'warning' ? colors.warning
    : statusConfig.accent === 'brand' ? colors.brand
    : colors.textMuted;

  const views = item.engagement?.views ?? 0;
  const saves = item.engagement?.wishlistCount ?? 0;
  const likes = item.engagement?.likes ?? 0;
  const isPaused = item.status === 'paused';
  const isSold = item.status === 'sold';

  return (
    <View style={[styles.rowWrap, !isLast && { borderBottomColor: colors.border }]}>
      <AnimatedPressable
        style={styles.row}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        activeOpacity={0.88}
        accessibilityLabel={`${item.title}, ${currencySymbol}${item.priceGbp.toFixed(2)}, status: ${item.status}`}
        accessibilityRole="button"
        accessibilityHint={selectionMode ? 'Tap to toggle selection' : 'Tap to view listing details. Long-press to select.'}
      >
        {/* Selection checkbox */}
        {selectionMode ? (
          <Pressable
            onPress={onToggleSelect}
            style={[styles.selectCheckbox, isSelected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={isSelected ? 'Deselect listing' : 'Select listing'}
            hitSlop={4}
          >
            {isSelected ? <Ionicons name="checkmark" size={14} color={colors.textInverse} /> : null}
          </Pressable>
        ) : null}

        {/* Thumbnail */}
        {item.images[0] ? (
          <CachedImage
            uri={item.images[0]}
            style={styles.thumbnail as StyleProp<ImageStyle>}
            containerStyle={styles.thumbnailWrap as StyleProp<ViewStyle>}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumbnailWrap, styles.thumbnailFallback]}>
            <Ionicons name="bag-handle-outline" size={20} color={colors.textMuted} />
          </View>
        )}

        {/* Body */}
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.rowPrice}>{formatFromFiat(item.priceGbp, 'GBP')}</Text>
          <View style={styles.rowMetaRow}>
            {/* Status badge */}
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{statusConfig.label}</Text>
            </View>
            {/* Engagement metrics */}
            <View style={styles.metricsRow}>
              <Metric icon="eye-outline" value={views} colors={colors} styles={styles} />
              <Metric icon="bookmark-outline" value={saves} colors={colors} styles={styles} />
              <Metric icon="heart-outline" value={likes} colors={colors} styles={styles} />
            </View>
          </View>
        </View>

        {/* Quick actions */}
        {isPendingAction ? (
          <ActivityIndicator size="small" color={colors.textMuted} style={styles.rowSpinner} />
        ) : (
          <View style={styles.quickActions}>
            <IconButton icon="create-outline" onPress={onEdit} color={colors.textSecondary} label="Edit listing" />
            <IconButton
              icon={isPaused ? 'play-outline' : 'pause-outline'}
              onPress={onTogglePause}
              color={colors.textSecondary}
              label={isPaused ? 'Resume listing' : 'Pause listing'}
            />
            {isSold ? (
              <IconButton icon="repeat-outline" onPress={onRelist} color={colors.textSecondary} label="Relist item" />
            ) : null}
            <IconButton icon="trash-outline" onPress={onDelete} color={colors.danger} label="Delete listing" />
          </View>
        )}
      </AnimatedPressable>
    </View>
  );
}

function Metric({
  icon,
  value,
  colors,
  styles }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: number;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
}) {
  return (
    <View style={styles.metricItem}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.metricText}>{value}</Text>
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  color,
  label }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  color: string;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={inventorySharedStyles.iconActionBtn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}
