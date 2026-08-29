import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  NotificationRowBase,
  NotificationThumbnail,
  NotificationStatusIcon } from './NotificationRowBase';
import {
  Space,
  Radius,
  FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { NotificationEventV2 } from '../../services/notificationsApi';

// ---------------------------------------------------------------------------
// CommerceNotificationRow — order lifecycle events
// ---------------------------------------------------------------------------
// Covers: order_created, order_paid, order_dispatched, order_in_transit,
// order_out_for_delivery, order_delivered, order_cancelled, order_refunded.
// Layout: order status icon → status text + object label + lifecycle
// progress → object thumbnail.
//
// The lifecycle progress strip is the Depop/Grailed 2026 shipping-update
// pattern: a compact 4-step indicator (Placed → Paid → Shipped → Delivered)
// that lets a buyer glance at where their order is without opening it. For
// sellers, the same strip makes "needs shipping" states obvious.
// ---------------------------------------------------------------------------

export interface CommerceNotificationRowProps {
  event: NotificationEventV2;
  time: string;
  aggregatedCount?: number;
  inAttentionSection?: boolean;
  onPress: () => void;
}

interface CommerceVisual {
  icon: keyof typeof Ionicons.glyphMap;
  accentKey: 'success' | 'warning' | 'danger' | 'brand' | 'commerceTrust';
  statusLabel: string;
}

function resolveCommerceVisual(eventType: NotificationEventV2['eventType']): CommerceVisual {
  switch (eventType) {
    case 'order_created':
      return { icon: 'bag-outline', accentKey: 'brand', statusLabel: 'New order' };
    case 'order_paid':
      return { icon: 'card-outline', accentKey: 'success', statusLabel: 'Paid' };
    case 'order_dispatched':
      return { icon: 'cube-outline', accentKey: 'commerceTrust', statusLabel: 'Dispatched' };
    case 'order_in_transit':
      return { icon: 'airplane-outline', accentKey: 'commerceTrust', statusLabel: 'In transit' };
    case 'order_out_for_delivery':
      return { icon: 'bicycle-outline', accentKey: 'warning', statusLabel: 'Out for delivery' };
    case 'order_delivered':
      return { icon: 'checkmark-circle-outline', accentKey: 'success', statusLabel: 'Delivered' };
    case 'order_cancelled':
      return { icon: 'close-circle-outline', accentKey: 'danger', statusLabel: 'Cancelled' };
    case 'order_refunded':
      return { icon: 'cash-outline', accentKey: 'warning', statusLabel: 'Refunded' };
    default:
      return { icon: 'bag-outline', accentKey: 'brand', statusLabel: 'Order update' };
  }
}

/**
 * Order lifecycle steps — the canonical buyer journey.
 * Each active event maps to the step the order has reached.
 */
type LifecycleStep = 'placed' | 'paid' | 'shipped' | 'delivered';
const LIFECYCLE_STEPS: LifecycleStep[] = ['placed', 'paid', 'shipped', 'delivered'];
const LIFECYCLE_LABELS: Record<LifecycleStep, string> = {
  placed: 'Placed',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered' };

/** Resolve the current lifecycle step for an event. Terminal/cancelled states return null. */
function resolveLifecycleStep(eventType: NotificationEventV2['eventType']): LifecycleStep | null {
  switch (eventType) {
    case 'order_created':
      return 'placed';
    case 'order_paid':
      return 'paid';
    case 'order_dispatched':
    case 'order_in_transit':
    case 'order_out_for_delivery':
      return 'shipped';
    case 'order_delivered':
      return 'delivered';
    default:
      return null; // cancelled / refunded / generic — no progress strip
  }
}

/** Compact 4-segment progress strip. Completed segments are filled dots;
 *  incomplete segments are hollow dots; the active segment shows the accent
 *  colour plus its label. Only the current step is labelled, reducing height. */
function OrderLifecycleStrip({
  currentStep,
  accentColor,
  colors }: {
  currentStep: LifecycleStep;
  accentColor: string;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStripStyles(colors), [colors]);
  const currentIndex = LIFECYCLE_STEPS.indexOf(currentStep);

  return (
    <View style={styles.strip} accessibilityLabel={`Order progress: ${LIFECYCLE_LABELS[currentStep]}`}>
      {LIFECYCLE_STEPS.map((step, i) => {
        const isComplete = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <View key={step} style={styles.segment}>
            <View
              style={[
                styles.bar,
                isComplete && styles.barComplete,
                isActive && { backgroundColor: accentColor },
              ]}
            />
            {isActive ? (
              <Text
                style={[styles.label, { color: accentColor, fontFamily: FontFamily.semibold }]}
                numberOfLines={1}
              >
                {LIFECYCLE_LABELS[step]}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function CommerceNotificationRow({
  event,
  time,
  aggregatedCount,
  inAttentionSection = false,
  onPress }: CommerceNotificationRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visual = useMemo(() => resolveCommerceVisual(event.eventType), [event.eventType]);
  const accentColor = colors[visual.accentKey] ?? colors.brand;
  const isUnread = !event.readAt;

  const objectLabel = event.objectRef?.label ?? 'your order';
  const objectImage = event.objectRef?.imageUrl ?? event.imageUrl ?? undefined;

  const lifecycleStep = useMemo(() => resolveLifecycleStep(event.eventType), [event.eventType]);
  const showProgress = lifecycleStep !== null;

  const description = `${visual.statusLabel} · ${objectLabel}`;
  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${visual.statusLabel}. ${objectLabel}. ${time}${showProgress ? `. Progress: ${LIFECYCLE_LABELS[lifecycleStep!]}` : ''}`;

  const leading = (
    <NotificationStatusIcon
      icon={visual.icon}
      accentColor={accentColor}
      size={24}
    />
  );

  const trailing = event.objectRef ? (
    <NotificationThumbnail
      uri={objectImage}
      fallbackIcon="cube-outline"
      size={40}
      colors={colors}
    />
  ) : undefined;

  return (
    <NotificationRowBase
      event={event}
      time={time}
      aggregatedCount={aggregatedCount}
      inAttentionSection={inAttentionSection}
      onPress={onPress}
      leading={leading}
      trailing={trailing}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
        {event.title || visual.statusLabel}
      </Text>
      <Text style={styles.body} numberOfLines={showProgress ? 1 : 2}>
        {description}
      </Text>
      {showProgress ? (
        <OrderLifecycleStrip
          currentStep={lifecycleStep!}
          accentColor={accentColor}
          colors={colors}
        />
      ) : null}
    </NotificationRowBase>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      flexShrink: 1 },
    titleUnread: {
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold },
    body: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight } });
}

function createStripStyles(colors: ThemeColors) {
  return StyleSheet.create({
    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Space.xs + 1,
      gap: Space.xs },
    segment: {
      flex: 1,
      gap: Space.xs / 2 },
    bar: {
      height: 2,
      borderRadius: Radius.full,
      backgroundColor: colors.border },
    barComplete: {
      backgroundColor: colors.textMuted },
    label: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      letterSpacing: 0.1,
      marginTop: Space.xs / 2 } });
}
