/**
 * ChatTransactionStrip — shows the active order milestone, deadline/ETA,
 * and one contextual CTA above the chat message list.
 *
 * Per P1.4 spec:
 *   - one order milestone (paid/shipped/delivered)
 *   - deadline/ETA
 *   - one contextual CTA
 *   - collapse terminal state
 *
 * The strip fetches the user's orders filtered by listing ID and shows
 * the most recent non-terminal order. When the order is terminal
 * (completed/cancelled/refunded), the strip collapses to a single-line
 * summary that can be tapped to view the order.
 *
 * Per AGENTS.md §11: the strip shows real order data only — no fabricated
 * milestones. If no order exists for the listing, the strip renders nothing.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useStore } from '../../store/useStore';
import { listUserOrders, type CommerceUserOrder } from '../../services/commerceApi';
import { normaliseOrderStatus, humaniseStatus, isTerminalStatus, needsAction } from '../orders/orderCapabilities';
import { useAppTranslation } from '../../i18n/useAppTranslation';

// ── Props ─────────────────────────────────────────────────────────────

export interface ChatTransactionStripProps {
  /** The listing ID to look up the order for. */
  listingId: string;
}

// ── Component ─────────────────────────────────────────────────────────

export function ChatTransactionStrip({ listingId }: ChatTransactionStripProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const currentUser = useStore((state) => state.currentUser);
  const currentUserId = currentUser?.id;

  const [order, setOrder] = useState<CommerceUserOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const userId = currentUserId;
    if (!userId) return;
    let cancelled = false;

    async function fetchOrder(userId: string) {
      try {
        const result = await listUserOrders(userId, {
          limit: 20 });
        if (cancelled) return;
        // Find the most recent order for this listing
        const matching = result.items.find((o) => o.listingId === listingId);
        setOrder(matching ?? null);
      } catch {
        // Silent failure — the strip just doesn't render
        if (!cancelled) setOrder(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchOrder(userId);
    return () => { cancelled = true; };
  }, [currentUserId, listingId]);

  // Don't render while loading or if no order exists
  if (isLoading || !order) return null;

  const normalised = normaliseOrderStatus(order.status);
  const terminal = isTerminalStatus(normalised);
  const statusLabel = humaniseStatus(order.status);
  const isSeller = order.sellerId === currentUserId;
  const role = isSeller ? 'seller' : 'buyer';
  const isNeedsAction = needsAction(order.status, role);

  // Ship-by deadline for seller
  const shipByDate = order.shipByDate ?? order.fulfilmentSnapshot?.shipByDate ?? null;
  const shipByDaysLeft = shipByDate
    ? Math.ceil((new Date(shipByDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  const shipByOverdue = shipByDaysLeft != null && shipByDaysLeft < 0;

  // ETA for buyer
  const etaWindow = order.fulfilmentSnapshot?.etaMinDays != null && order.fulfilmentSnapshot?.etaMaxDays != null
    ? (order.fulfilmentSnapshot.etaMinDays !== order.fulfilmentSnapshot.etaMaxDays
        ? t('orders.etaWindow', { min: order.fulfilmentSnapshot.etaMinDays, max: order.fulfilmentSnapshot.etaMaxDays })
        : t('orders.etaDay', { count: order.fulfilmentSnapshot.etaMinDays }))
    : null;

  // Determine the contextual CTA
  const cta = (() => {
    if (terminal) return null;
    if (isSeller && normalised === 'paid') {
      return { label: t('orders.dispatchItem'), icon: 'cube-outline' as const, screen: 'SellerFulfilment', params: { orderId: order.id } };
    }
    if (!isSeller && (normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery')) {
      return { label: t('orders.trackParcel'), icon: 'navigate-outline' as const, screen: 'OrderDetail', params: { orderId: order.id } };
    }
    if (!isSeller && normalised === 'delivered') {
      return { label: t('orders.checkItem'), icon: 'shield-checkmark-outline' as const, screen: 'OrderDetail', params: { orderId: order.id } };
    }
    return { label: t('orders.viewOrder'), icon: 'receipt-outline' as const, screen: 'OrderDetail', params: { orderId: order.id } };
  })();

  // Deadline/ETA label
  const deadlineLabel = (() => {
    if (terminal) return null;
    if (isSeller && normalised === 'paid' && shipByDate) {
      if (shipByOverdue) return 'Overdue — dispatch now';
      if (shipByDaysLeft === 0) return 'Dispatch today';
      if (shipByDaysLeft === 1) return 'Ship tomorrow';
      return t('orders.shipBy', { date: new Date(shipByDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
    }
    if (!isSeller && etaWindow && (normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery')) {
      return t('orders.eta', { window: etaWindow });
    }
    return null;
  })();

  const handlePress = () => {
    if (cta) {
      navigation.navigate(cta.screen, cta.params);
    } else {
      navigation.navigate('OrderDetail', { orderId: order.id });
    }
  };

  // Status color
  const statusColor = normalised === 'paid' || normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery'
    ? colors.brand
    : terminal
      ? colors.textMuted
      : colors.textPrimary;

  return (
    <Pressable
      style={({ pressed }) => [styles.strip, pressed && styles.stripPressed, isNeedsAction && styles.stripNeedsAction]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${statusLabel}${deadlineLabel ? `, ${deadlineLabel}` : ''}${cta ? `, ${cta.label}` : ''}`}
    >
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <View style={styles.stripContent}>
        <Text style={[styles.statusLabel, { color: statusColor }]} numberOfLines={1}>
          {statusLabel}
        </Text>
        {deadlineLabel && (
          <Text style={[styles.deadline, { color: shipByOverdue ? colors.danger : colors.textSecondary }]} numberOfLines={1}>
            {deadlineLabel}
          </Text>
        )}
      </View>
      {cta && (
        <View style={[styles.ctaBtn, { borderColor: colors.brand }]}>
          <Ionicons name={cta.icon} size={14} color={colors.brand} />
          <Text style={[styles.ctaText, { color: colors.brand }]} numberOfLines={1}>
            {cta.label}
          </Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      minHeight: 44 },
    stripPressed: {
      opacity: 0.7 },
    stripNeedsAction: {
      backgroundColor: colors.brandSubtle },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: Radius.full },
    stripContent: {
      flex: 1,
      gap: 1 },
    statusLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    deadline: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth },
    ctaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily } });
}
