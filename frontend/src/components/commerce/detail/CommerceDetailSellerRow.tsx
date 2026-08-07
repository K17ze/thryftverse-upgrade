import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../../theme/designTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { CachedImage } from '../../CachedImage';

/**
 * Seller / issuer row — a slim inline confidence row.
 *
 * Per spec 02: seller/issuer may appear as a compact inline confidence
 * row when enough data exists. Missing seller data must reduce the
 * module, not create a large generic card.
 *
 * The row collapses to a smaller footprint when avatar/rating data is
 * missing. Follow / Message are quiet text actions, not bordered
 * pills.
 */
export interface CommerceDetailSellerRowProps {
  avatarUri?: string;
  name: string;
  /** Optional verification glyph. */
  verified?: boolean;
  /** Optional rating + review count (e.g. "4.8 · 122 reviews"). */
  ratingLine?: string;
  /** Optional location or dispatch speed line. */
  locationLine?: string;
  /** Optional quiet primary action (Follow / Message). */
  primaryAction?: {
    label: string;
    onPress: () => void;
  };
  /** Optional quiet secondary action. */
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  /** When true, the row uses the issuer copy ("Issuer" instead of
   * "Seller"). Visual treatment is identical. */
  roleLabel?: string;
  /** When true, the row renders with institutional differentiation:
   * a rounded-square avatar and a "Verified issuer" badge. Use for
   * Co-Own issuers (institutional custodians) to distinguish them
   * from individual sellers. */
  institutional?: boolean;
  onPress?: () => void;
}

export function CommerceDetailSellerRow({
  avatarUri,
  name,
  verified = false,
  ratingLine,
  locationLine,
  primaryAction,
  secondaryAction,
  roleLabel,
  institutional = false,
  onPress,
}: CommerceDetailSellerRowProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleAction = (cb: () => void) => {
    if (!reducedMotion) haptic.light();
    cb();
  };

  const subtitle = [
    institutional && verified ? 'Verified issuer' : undefined,
    ratingLine,
    locationLine,
  ].filter(Boolean).join(' · ');
  const isFallbackIdentity =
    !avatarUri
    && !verified
    && !ratingLine
    && !locationLine
    && (name.trim().toLowerCase() === 'issuer' || name.trim().toLowerCase() === 'seller');
  const displayedName = isFallbackIdentity
    ? `${roleLabel ?? (institutional ? 'Issuer' : 'Seller')} profile`
    : name;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.identity,
          onPress && pressed && styles.pressed,
        ]}
        accessibilityLabel={`${roleLabel ?? 'Seller'} ${displayedName}`}
        accessibilityRole={onPress ? 'button' : undefined}
      >
        {avatarUri ? (
          <View style={[styles.avatar, institutional && styles.avatarInstitutional, { backgroundColor: colors.surfaceAlt }]}>
            <CachedImage
              uri={avatarUri}
              style={styles.avatarImage}
              transition={200}
              emptyIcon="person-outline"
            />
          </View>
        ) : !isFallbackIdentity ? (
          <View style={[styles.avatar, institutional && styles.avatarInstitutional, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        ) : null}
        <View style={styles.identityText}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.name, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {displayedName}
            </Text>
            {institutional && verified ? (
              <Ionicons name="shield-checkmark" size={15} color={colors.brand} />
            ) : verified ? (
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            ) : null}
          </View>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {(primaryAction || secondaryAction) && (
        <View style={styles.actions}>
          {secondaryAction ? (
            <Pressable
              onPress={() => handleAction(secondaryAction.onPress)}
              hitSlop={8}
              style={styles.actionHitTarget}
              accessibilityLabel={secondaryAction.label}
              accessibilityRole="button"
            >
              <Text style={[styles.quietAction, { color: colors.textSecondary }]}>
                {secondaryAction.label}
              </Text>
            </Pressable>
          ) : null}
          {primaryAction ? (
            <Pressable
              onPress={() => handleAction(primaryAction.onPress)}
              hitSlop={8}
              style={styles.actionHitTarget}
              accessibilityLabel={primaryAction.label}
              accessibilityRole="button"
            >
              <Text style={[styles.quietAction, { color: colors.textPrimary }]}>
                {primaryAction.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 1,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.985 }],
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Institutional issuers use a rounded-square avatar to visually
  // distinguish them from individual sellers (circles).
  avatarInstitutional: {
    borderRadius: Radius.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  // "Verified issuer" badge — subtle brand-tinted pill with a shield
  // glyph. Distinguishes institutional custodians from individual
  // sellers per spec 03_COOWN §2.
  avatarInitial: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
  },
  identityText: {
    flexShrink: 1,
    gap: Space.xs / 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  name: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  subtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    flexShrink: 0,
  },
  quietAction: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  actionHitTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
