import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  FontFamily,
  Control,
  Numeric } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type {
  ImportItemDTO,
  ImportMediaDTO,
  ItemReadiness } from '../../services/catalogImportApi';

interface Props {
  item: ImportItemDTO;
  onPress: (itemId: string) => void;
}

const STATUS_DOT_COLOR: Partial<Record<ItemReadiness, 'success' | 'warning' | 'brand' | 'danger'>> = {
  ready: 'success',
  needs_input: 'warning',
  probable_duplicate: 'brand',
  source_changed: 'danger' };

const DOT_SIZE = 8;

/**
 * Extracts the first verified media preview URL from an import item.
 * Returns null when there is no usable image so the caller can render
 * the restrained placeholder instead of a broken Image.
 */
function getVerifiedPreviewUrl(media: ImportMediaDTO[] | undefined): string | null {
  if (!media || media.length === 0) return null;
  const first = media[0];
  if (!first || first.fetchStatus !== 'verified') return null;
  return first.previewUrl ?? null;
}

/**
 * Reads the GBP price string from the normalised fields bag.
 * The backend stores field values as `{ value: string }` records, but the
 * shape is `Record<string, unknown>` on the client, so we guard defensively.
 */
function getPriceString(item: ImportItemDTO): string | null {
  const fields = item.normalisedFields;
  if (!fields) return null;
  const priceField = fields['price_gbp'] as unknown;
  if (priceField && typeof priceField === 'object' && priceField !== null) {
    const value = (priceField as Record<string, unknown>).value;
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/**
 * Derives a human-readable title from the normalised fields. Falls back to
 * the external item id so the tile always has *something* to show — never
 * an empty string.
 */
function getTitle(item: ImportItemDTO): string {
  const fields = item.normalisedFields;
  if (fields) {
    const titleField = fields['title'] as unknown;
    if (titleField && typeof titleField === 'object' && titleField !== null) {
      const value = (titleField as Record<string, unknown>).value;
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    const nameField = fields['name'] as unknown;
    if (nameField && typeof nameField === 'object' && nameField !== null) {
      const value = (nameField as Record<string, unknown>).value;
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
  }
  return item.externalItemId || 'Untitled';
}

export function ImportListingTile({ item, onPress }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const previewUrl = getVerifiedPreviewUrl(item.media);
  const title = getTitle(item);
  const price = getPriceString(item);
  const isExcluded = item.readiness === 'excluded';
  const dotColorKey = STATUS_DOT_COLOR[item.readiness];

  const handlePress = React.useCallback(() => {
    onPress(item.id);
  }, [onPress, item.id]);

  return (
    <AnimatedPressable
      style={styles.tile}
      onPress={handlePress}
      scaleValue={0.97}
      hapticFeedback="selection"
      accessibilityRole="button"
      accessibilityLabel={`${title}${price ? `, ${price}` : ''}`}
      accessibilityHint="Opens the item review editor"
    >
      <View style={styles.mediaWrap}>
        {previewUrl ? (
          <ExpoImage
            source={{ uri: previewUrl }}
            style={styles.image}
            contentFit="cover"
            transition={120}
            recyclingKey={item.id}
            cachePolicy="memory-disk"
            accessibilityRole="image"
          />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons
              name="image-outline"
              size={Control.iconCompact}
              color={colors.textMuted}
            />
          </View>
        )}

        {dotColorKey ? (
          <View
            style={[
              styles.statusDot,
              { backgroundColor: colors[dotColorKey] },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>
        {price ? (
          <Text style={styles.price}>{`\u00A3${price}`}</Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    tile: {
      width: '100%' },
    mediaWrap: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    image: {
      width: '100%',
      height: '100%',
      borderRadius: Radius.md },
    placeholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md },
    statusDot: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2 },
    meta: {
      gap: Space.xs,
      paddingTop: Space.xs },
    title: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textPrimary },
    price: {
      fontFamily: FontFamily.bold,
      fontSize: Numeric.priceList.size,
      lineHeight: Numeric.priceList.lineHeight,
      letterSpacing: Numeric.priceList.letterSpacing,
      color: colors.textPrimary,
      fontVariant: Numeric.priceList.fontVariant } });
