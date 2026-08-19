import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  Space,
  Radius,
  Stroke,
  Control,
  Type,
  FontFamily,
} from '../../theme/designTokens';
import type { NotificationEventV2 } from '../../services/notificationsApi';

// ---------------------------------------------------------------------------
// Shared spacing primitives for notification rows
// ---------------------------------------------------------------------------
// Each role-specific row presenter composes this base for consistent spacing,
// unread indicator, timestamp, and press handling. The base provides the
// structural skeleton; the presenter fills in the role-specific icon, image,
// and action button.
// ---------------------------------------------------------------------------

/**
 * Resolve a timestamp color based on recency.
 *
 * The color desaturates as time passes, drawing the eye to fresh activity:
 *   < 1 hour   → colors.brand         (fresh / active — the "spark")
 *   1–24 hours → colors.textSecondary (slightly elevated)
 *   1–7 days   → colors.textMuted     (neutral — current behaviour)
 *   7+ days    → colors.textMuted     (stays neutral)
 *
 * Edge cases:
 *   - Missing/invalid timestamp → textMuted (safe default)
 *   - Future timestamp          → brand (treat as fresh)
 */
function resolveTimestampColor(createdAt: string | null | undefined, colors: ThemeColors): string {
  if (!createdAt) return colors.textMuted;
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return colors.textMuted;
  const hours = (Date.now() - then) / 36e5;
  if (hours < 1) return colors.brand;            // fresh (also covers future)
  if (hours < 24) return colors.textSecondary;   // recent
  return colors.textMuted;                       // 1–7 days and 7+ days
}

export interface NotificationRowBaseProps {
  /** The V2 notification event. */
  event: NotificationEventV2;
  /** Relative time string (pre-formatted by the screen). */
  time: string;
  /** Whether this row represents an aggregated group (count > 1). */
  aggregatedCount?: number;
  /** Whether this row is in the "Needs attention" section. */
  inAttentionSection?: boolean;
  /** Press handler for the row body. */
  onPress: () => void;
  /** Optional action button label + handler for action-required events. */
  actionLabel?: string;
  onActionPress?: () => void;
  /** Leading visual — avatar, status icon, or thumbnail (rendered by presenter). */
  leading: React.ReactNode;
  /** Main content — title + body (rendered by presenter). */
  children: React.ReactNode;
  /** Optional trailing element (e.g. action button). */
  trailing?: React.ReactNode;
  /** Accessibility label for the entire row. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

export function NotificationRowBase({
  event,
  time,
  aggregatedCount,
  inAttentionSection = false,
  onPress,
  actionLabel,
  onActionPress,
  leading,
  children,
  trailing,
  accessibilityLabel,
  style,
}: NotificationRowBaseProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUnread = !event.readAt;
  const timeColor = resolveTimestampColor(event.createdAt, colors);

  return (
    <AnimatedPressable
      style={[
        styles.row,
        inAttentionSection && styles.rowAttention,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hapticFeedback="light"
    >
      {/* Unread indicator — subtle dot, not a giant badge */}
      {isUnread ? <View style={styles.unreadDot} /> : null}

      {/* Leading visual slot */}
      <View style={styles.leading}>{leading}</View>

      {/* Body — title + description + meta */}
      <View style={styles.body}>
        {children}
        <View style={styles.metaRow}>
          {aggregatedCount && aggregatedCount > 1 ? (
            <View style={styles.aggregatedBadge}>
              <Text style={styles.aggregatedText}>+{aggregatedCount - 1}</Text>
            </View>
          ) : null}
          <Text style={[styles.time, { color: timeColor }]}>{time}</Text>
        </View>
      </View>

      {/* Trailing slot — action button or chevron */}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components used by multiple row presenters
// ---------------------------------------------------------------------------

/** Small rounded-square thumbnail with a subtle border. */
export function NotificationThumbnail({
  uri,
  fallbackIcon = 'notifications-outline',
  size = 44,
  colors,
}: {
  uri?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  size?: number;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createThumbnailStyles(colors, size), [colors, size]);
  if (!uri) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name={fallbackIcon} size={size * 0.45} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <CachedImage
        uri={uri}
        style={styles.image}
        contentFit="cover"
        emptyIcon={fallbackIcon}
      />
    </View>
  );
}

/** Status icon chip — small rounded square with an accent-tinted background. */
export function NotificationStatusIcon({
  icon,
  accentColor,
  colors,
  size = 44,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  colors: ThemeColors;
  size?: number;
}) {
  const styles = useMemo(() => createStatusIconStyles(colors, size), [colors, size]);
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={size * 0.42} color={accentColor} />
    </View>
  );
}

/** Compact action button for action-required rows. */
export function NotificationActionButton({
  label,
  onPress,
  colors,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  variant?: 'primary' | 'quiet';
}) {
  const styles = useMemo(() => createActionStyles(colors, variant), [colors, variant]);
  return (
    <AnimatedPressable
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      hapticFeedback="light"
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      minHeight: Control.hit + Space.sm,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowAttention: {
      // Subtle accent — left border tint, not a giant card.
      borderLeftWidth: Stroke.emphasis,
      borderLeftColor: colors.brand,
    },
    unreadDot: {
      position: 'absolute',
      top: Space.sm + 2,
      left: Space.xs,
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
    },
    leading: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: Space.xs / 2,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs / 2,
    },
    time: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    aggregatedBadge: {
      minWidth: Space.md + 4,
      height: Space.md + 4,
      borderRadius: Radius.full,
      paddingHorizontal: Space.xs + 2,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aggregatedText: {
      fontSize: Type.meta.size - 2,
      fontFamily: FontFamily.bold,
      color: colors.background,
    },
    trailing: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: Control.hit,
      minHeight: Control.hit,
    },
  });
}

function createThumbnailStyles(colors: ThemeColors, size: number) {
  return StyleSheet.create({
    wrap: {
      width: size,
      height: size,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      width: size,
      height: size,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

function createStatusIconStyles(colors: ThemeColors, size: number) {
  return StyleSheet.create({
    container: {
      width: size,
      height: size,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

function createActionStyles(colors: ThemeColors, variant: 'primary' | 'quiet') {
  const isPrimary = variant === 'primary';
  return StyleSheet.create({
    button: {
      minHeight: Control.hit,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: isPrimary ? colors.brand : 'transparent',
      borderWidth: isPrimary ? 0 : Stroke.standard,
      borderColor: isPrimary ? 'transparent' : colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.semibold,
      color: isPrimary ? colors.textInverse : colors.textPrimary,
      letterSpacing: 0.1,
    },
  });
}
