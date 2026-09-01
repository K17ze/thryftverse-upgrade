import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, AvatarSize, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Motion } from '../../../theme/motionTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { CachedImage } from '../../CachedImage';
import { AppIcon } from '../../common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';

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
 *
 * `variant="rich"` expresses the full seller confidence row (avatar,
 * name, verification badge, compact stats line, one quiet trailing
 * action) so a fixed-price PDP can present seller trust in the first
 * viewport without a separate card module. Verification renders only
 * from the `verified` prop — never fabricated.
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
  /** Compact stats line for the rich variant (e.g. "124 sales · 4.9★ · 98% response"). */
  statsLine?: string;
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
  /** Presentation density. `compact` (default) is the slim inline row;
   * `rich` adds the stats line and a trailing quiet action. */
  variant?: 'compact' | 'rich';
  onPress?: () => void;
}

export function CommerceDetailSellerRow({
  avatarUri,
  name,
  verified = false,
  ratingLine,
  locationLine,
  statsLine,
  primaryAction,
  secondaryAction,
  roleLabel,
  institutional = false,
  variant = 'compact',
  onPress }: CommerceDetailSellerRowProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const isRich = variant === 'rich';

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

  const avatar = (avatarUri ? (
    <View style={[styles.avatar, institutional && styles.avatarInstitutional, { backgroundColor: colors.surfaceAlt }]}>
      <CachedImage
        uri={avatarUri}
        style={styles.avatarImage}
        transition={Motion.duration.normal}
        emptyIcon="person-outline"
      />
    </View>
  ) : !isFallbackIdentity ? (
    <View style={[styles.avatar, institutional && styles.avatarInstitutional, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  ) : null);

  const identityText = (
    <View style={styles.identityText}>
      <View style={styles.nameRow}>
        <Text
          style={[styles.name, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {displayedName}
        </Text>
        {institutional && verified ? (
          <AppIcon name="verified" size={IconSize.xs} color="brand" opticalCenter accessible={false} />
        ) : verified ? (
          <AppIcon name="shieldCheck" focused size={IconSize.xs} color="success" opticalCenter accessible={false} />
        ) : null}
      </View>
      {isRich && statsLine ? (
        <Text
          style={[styles.statsLine, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {statsLine}
        </Text>
      ) : subtitle ? (
        <Text
          style={[styles.subtitle, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (isRich) {
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
          {avatar}
          {identityText}
        </Pressable>

        {primaryAction ? (
          <Pressable
            onPress={() => handleAction(primaryAction.onPress)}
            hitSlop={8}
            style={({ pressed }) => [styles.actionHitTarget, pressed && styles.actionPressed]}
            accessibilityLabel={primaryAction.label}
            accessibilityRole="button"
          >
            <Text style={[styles.quietAction, { color: colors.textPrimary }]}>
              {primaryAction.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

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
        {avatar}
        {identityText}
      </Pressable>

      {(primaryAction || secondaryAction) && (
        <View style={styles.actions}>
          {secondaryAction ? (
            <Pressable
              onPress={() => handleAction(secondaryAction.onPress)}
              hitSlop={8}
              style={({ pressed }) => [styles.actionHitTarget, pressed && styles.actionPressed]}
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
              style={({ pressed }) => [styles.actionHitTarget, pressed && styles.actionPressed]}
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
    paddingVertical: Space.sm },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 1,
    minHeight: 44 },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: PressScale.gentle }] },
  actionPressed: {
    opacity: 0.85 },
  avatar: {
    width: AvatarSize.md,
    height: AvatarSize.md,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' },
  // Institutional issuers use a rounded-square avatar to visually
  // distinguish them from individual sellers (circles).
  avatarInstitutional: {
    borderRadius: Radius.md },
  avatarImage: {
    width: '100%',
    height: '100%' },
  avatarInitial: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  identityText: {
    flexShrink: 1,
    gap: Space.xs / 2 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  name: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  // Rich-variant stats line — captionElevated with tabular figures so
  // "124 sales · 4.9★ · 98% response" scans as one quiet numeric row.
  statsLine: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    fontVariant: ['tabular-nums'] },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    flexShrink: 0 },
  quietAction: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  actionHitTarget: {
    minHeight: 44,
    justifyContent: 'center' } });
