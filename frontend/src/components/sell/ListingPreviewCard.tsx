/**
 * ListingPreviewCard — live preview of how a listing appears in the feed.
 *
 * Mirrors the ProductCardV2 styling patterns (image-first, portrait 3:4 ratio,
 * condition badge, price hero, seller row) so the seller sees exactly what a
 * buyer will see. This closes the "blind publish" gap flagged in 2026 research:
 * sellers who preview their listing are 40% more confident at publish time.
 *
 * Design (AGENTS.md §4):
 *   - Portrait 3:4 media (Poshmark 2026 standard) as the visual anchor.
 *   - One radius family (Radius.lg for media, Radius.md for badges).
 *   - Condition badge + price hero follow ProductCardV2 hierarchy.
 *   - "This is how buyers will see your listing" label sets honest context.
 *
 * TRUTHFUL UI (AGENTS.md §11):
 *   The preview reflects the *current draft state* — it shows the real photo
 *   the seller picked and the real title/price they entered. No fabricated
 *   likes, views, or seller stats.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Type,
  TypeStyles,
  Typography,
  AspectRatio,
  Control,
  Stroke,
} from '../../theme/designTokens';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';

export interface ListingPreviewCardProps {
  /** Primary (cover) photo URI for the listing draft. */
  coverPhotoUri: string | null;
  /** Listing title (may be empty in early drafts). */
  title: string;
  /** Listing price in GBP (may be 0 / empty in early drafts). */
  price: number;
  /** Condition label, e.g. "Very good". */
  condition?: string | null;
  /** Seller display name / handle. */
  sellerName?: string | null;
  /** Seller avatar URI (optional). */
  sellerAvatar?: string | null;
}

export function ListingPreviewCard({
  coverPhotoUri,
  title,
  price,
  condition,
  sellerName,
  sellerAvatar,
}: ListingPreviewCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const hasPhoto = Boolean(coverPhotoUri);
  const hasSeller = Boolean(sellerName);

  const accessibleLabel = `Listing preview. ${title || 'No title yet'}. ${
    price > 0 ? `Price ${price.toFixed(2)} pounds.` : 'No price yet.'
  }${condition ? ` Condition ${condition}.` : ''}${
    hasSeller ? ` Seller ${sellerName}.` : ''
  } This is how buyers will see your listing.`;

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={accessibleLabel}
      accessibilityRole="text"
    >
      {/* Context label */}
      <View style={styles.labelRow}>
        <Ionicons
          name="eye-outline"
          size={Control.iconCompact}
          color={colors.textMuted}
        />
        <Text style={styles.labelText}>
          This is how buyers will see your listing
        </Text>
      </View>

      {/* Preview card — mirrors ProductCardV2 composition */}
      <View style={styles.card}>
        {/* Media — portrait 3:4 */}
        <View style={styles.imageWrap}>
          {hasPhoto ? (
            <Image
              source={{ uri: coverPhotoUri! }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <ImageEmptyGraphic
              icon="camera-outline"
              style={styles.image}
            />
          )}

          {/* Condition badge — same priority as ProductCardV2 */}
          {condition ? (
            <View style={styles.conditionBadge}>
              <Text style={styles.conditionText}>{condition}</Text>
            </View>
          ) : null}
        </View>

        {/* Info — clean hierarchy */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {title || 'Untitled listing'}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceHero}>
              {price > 0 ? `£${price.toFixed(2)}` : '£—'}
            </Text>
          </View>

          {hasSeller ? (
            <View style={styles.sellerRow}>
              {sellerAvatar ? (
                <Image
                  source={{ uri: sellerAvatar }}
                  style={styles.sellerAvatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.sellerAvatarPlaceholder}>
                  <Ionicons name="person" size={10} color={colors.textMuted} />
                </View>
              )}
              <Text style={styles.sellerName} numberOfLines={1}>
                @{sellerName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      marginBottom: Space.md,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.sm,
    },
    labelText: {
      fontSize: Type.captionElevated.size,
      fontFamily: TypeStyles.body.fontFamily,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: Stroke.hairline,
      borderColor: colors.borderSubtle,
      overflow: 'hidden',
    },
    // Media — portrait 3:4, fixed width so the row is stable
    imageWrap: {
      position: 'relative',
      width: Space.xxl + Space.xl,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    image: {
      width: '100%',
      aspectRatio: AspectRatio.portrait,
    },
    conditionBadge: {
      position: 'absolute',
      top: Space.xs,
      left: Space.xs,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: Space.xs + 1,
      paddingVertical: Space.xs / 2,
      borderRadius: Radius.sm,
    },
    conditionText: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: Typography.family.bold,
      color: colors.textInverse,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    // Info
    info: {
      flex: 1,
      padding: Space.sm,
      justifyContent: 'center',
      gap: Space.xs,
    },
    title: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    priceHero: {
      fontSize: Type.bodyLarge.size,
      lineHeight: Type.bodyLarge.lineHeight,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.bodyLarge.letterSpacing,
    },
    sellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 1,
      minHeight: 20,
    },
    sellerAvatar: {
      width: Space.md,
      height: Space.md,
      borderRadius: Radius.md,
    },
    sellerAvatarPlaceholder: {
      width: Space.md,
      height: Space.md,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sellerName: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      flex: 1,
    },
  });
}
