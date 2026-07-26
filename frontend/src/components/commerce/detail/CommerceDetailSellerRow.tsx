import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Type } from '../../../theme/designTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

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
  onPress,
}: CommerceDetailSellerRowProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleAction = (cb: () => void) => {
    if (!reducedMotion) haptic.light();
    cb();
  };

  const subtitle = [ratingLine, locationLine].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.identity,
          onPress && pressed && styles.pressed,
        ]}
        accessibilityLabel={`${roleLabel ?? 'Seller'} ${name}`}
        accessibilityRole={onPress ? 'button' : undefined}
      >
        {avatarUri ? (
          <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
            {/* CachedImage is intentionally not imported here to keep the
               primitive dependency-free. The screen wraps the avatar in
               CachedImage and passes the uri via a render-prop pattern is
               not used — instead we render a plain colored ring and let
               the family screen overlay the image. For simplicity and
               theme-correctness, we render a fallback initial. */}
            <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.identityText}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.name, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            {verified ? (
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
    opacity: 0.6,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '600',
  },
  identityText: {
    flexShrink: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  name: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
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
    fontWeight: '600',
  },
});
