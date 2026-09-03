import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  Space,
  Radius,
  Stroke,
  Control,
  FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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

const DELIVERY_STATUS_CONFIG: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; colorKey: 'textMuted' | 'danger' | 'textSecondary' }
> = {
  suppressed: { label: 'Silenced', icon: 'moon-outline', colorKey: 'textMuted' },
  failed: { label: 'Delivery failed', icon: 'alert-circle-outline', colorKey: 'danger' },
  queued: { label: 'Pending', icon: 'time-outline', colorKey: 'textSecondary' } };

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
  style }: NotificationRowBaseProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUnread = !event.readAt;
  const timeColor = resolveTimestampColor(event.createdAt, colors);
  const deliveryConfig = DELIVERY_STATUS_CONFIG[event.status];

  return (
    <AnimatedPressable
      style={[
        styles.row,
        isUnread && styles.rowUnread,
        inAttentionSection && styles.rowAttention,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hapticFeedback="light"
    >
      {/* Leading visual slot — avatar/icon with unread dot at bottom-right */}
      <View style={styles.leadingWrap}>
        {leading}
        {isUnread ? <View style={styles.unreadDot} /> : null}
      </View>

      {/* Body — title + description + aggregated badge */}
      <View style={styles.body}>
        <View style={styles.contentHeaderRow}>
          <View style={styles.textContentWrap}>
            {children}
          </View>
          {/* Timestamp — right-aligned, top-right of the body column */}
          <Text
            style={[styles.time, { color: timeColor }]}
            accessibilityLabel={`Time: ${time}`}
          >
            {time}
          </Text>
        </View>
        {aggregatedCount && aggregatedCount > 1 ? (
          <View style={styles.metaRow}>
            <View style={styles.aggregatedBadge}>
              <Text style={styles.aggregatedText}>+{aggregatedCount - 1}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Trailing slot — action button or item thumbnail */}
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
  colors }: {
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

/**
 * Status icon — a bare accent-coloured glyph, no decorative circle.
 *
 * The icon itself is the scannable signal. No background tint, no container
 * View — just a plain Ionicons glyph at the given size and colour. This
 * eliminates the grey card-on-card silhouette and lets the row read as a
 * clean text list (iOS Mail / Gmail notification pattern).
 */
export function NotificationStatusIcon({
  icon,
  accentColor,
  size = 24 }: {
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  size?: number;
}) {
  return (
    <Ionicons name={icon} size={size} color={accentColor} />
  );
}

/** Compact action button for action-required rows. */
export function NotificationActionButton({
  label,
  onPress,
  colors,
  variant = 'primary' }: {
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
      alignItems: 'flex-start',
      gap: Space.sm + 2,
      paddingVertical: Space.sm + 4,
      paddingHorizontal: Space.md,
      minHeight: 64,
      backgroundColor: 'transparent',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    // Unread is signalled ONLY by the unread dot on the leading element +
    // semibold title weight (applied by the presenter). No row tint —
    // a 6% grey wash across all unread rows creates "single grey background
    // slop" when every row is unread. Linear/Instagram/iOS Mail all use
    // dot + weight only, never a full-row tint.
    rowUnread: {},
    // Attention rows (action-required: outbid, dispute, ship order) use a
    // danger left border to distinguish them from plain unread rows.
    rowAttention: {
      borderLeftWidth: 2,
      borderLeftColor: colors.danger,
      paddingLeft: Space.md - 2 },
    leadingWrap: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: Space.xs / 2 },
    unreadDot: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      // Functional contrast ring — separates the dot from the underlying
      // avatar/image. Without this, a dark dot on a dark avatar area is
      // invisible. This is not decoration; it is contrast separation.
      borderWidth: Stroke.standard,
      borderColor: colors.background },
    body: {
      flex: 1,
      gap: Space.xs / 2 },
    contentHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm },
    textContentWrap: {
      flex: 1,
      flexDirection: 'column',
      gap: 2 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs / 2 },
    time: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      flexShrink: 0,
      marginTop: 2 },
    aggregatedBadge: {
      minWidth: Space.md + 4,
      height: Space.md + 4,
      borderRadius: Radius.full,
      paddingHorizontal: Space.xs + 2,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center' },
    aggregatedText: {
      // Small badge text — no dedicated token below meta; meta - 2 gives ~9px.
      fontSize: TypographyV2.meta.size - 2,
      fontFamily: FontFamily.bold,
      color: colors.background },
    deliveryStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2 },
    deliveryStatusText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular },
    trailing: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: Control.hit,
      minHeight: Control.hit } });
}

function createThumbnailStyles(colors: ThemeColors, size: number) {
  return StyleSheet.create({
    wrap: {
      width: size,
      height: size,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: 'transparent' },
    image: {
      width: '100%',
      height: '100%' },
    placeholder: {
      width: size,
      height: size,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center' } });
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
      justifyContent: 'center' },
    label: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: isPrimary ? colors.textInverse : colors.textPrimary,
      letterSpacing: 0.1 } });
}
