import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { getOrder, type CommerceOrder } from '../services/commerceApi';
import { CachedImage } from '../components/CachedImage';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { normaliseOrderStatus, humaniseStatus, isTerminalStatus } from '../components/orders/orderCapabilities';

type OrderReceiptRoute = RouteProp<{ OrderReceipt: { orderId: string } }, 'OrderReceipt'>;

const haptics = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};

function formatReceiptDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderReceiptScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<OrderReceiptRoute>();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);

  const { orderId } = route.params;

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const fetched = await getOrder(orderId);
      if (!isMountedRef.current) return;
      setOrder(fetched);
      setLoadError(null);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError('Receipt could not be loaded. Check your connection and try again.');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const isBuyer = currentUser?.id === order?.buyerId;
  const isSeller = currentUser?.id === order?.sellerId;

  const handleShare = useCallback(async () => {
    if (!order) return;
    haptics.tap();
    const shortId = order.id.slice(0, 8).toUpperCase();
    const total = formatFromFiat(order.totalGbp, 'GBP', { displayMode: 'fiat' });
    const status = humaniseStatus(order.status);
    const date = formatReceiptDate(order.createdAt);
    try {
      await Share.share({
        message: `Thryftverse Order #${shortId}\n${status}\n${date}\nTotal: ${total}`,
      });
    } catch {
      show('Could not share receipt', 'error');
    }
  }, [order, formatFromFiat, show]);

  const handleCopyOrderId = useCallback(async () => {
    if (!order) return;
    haptics.tap();
    try {
      await Clipboard.setString(order.id);
      show('Order ID copied', 'success');
    } catch {
      show('Could not copy order ID', 'error');
    }
  }, [order, show]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.skeletonContainer}>
          {/* Receipt header skeleton */}
          <SkeletonLoader width={100} height={12} borderRadius={6} />
          <SkeletonLoader width={140} height={20} borderRadius={10} style={{ marginTop: 8 }} />
          <SkeletonLoader width="80%" height={14} borderRadius={7} style={{ marginTop: 6 }} />
          {/* Item row skeleton */}
          <View style={styles.skeletonItemRow}>
            <SkeletonLoader width={56} height={56} borderRadius={8} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLoader width="70%" height={14} borderRadius={7} />
              <SkeletonLoader width="40%" height={12} borderRadius={6} />
            </View>
          </View>
          {/* Transaction rows skeleton */}
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonTxRow}>
              <SkeletonLoader width="50%" height={12} borderRadius={6} />
              <SkeletonLoader width={70} height={12} borderRadius={6} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (loadError || !order) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>Receipt could not be loaded</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isBuyer && !isSeller) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>You do not have access to this receipt</Text>
        </View>
      </View>
    );
  }

  const shortOrderId = order.id.slice(0, 8).toUpperCase();
  const statusLabel = humaniseStatus(order.status);
  const normalisedStatus = normaliseOrderStatus(order.status);
  const isReceiptFinal = isTerminalStatus(normalisedStatus);

  const fiatOpts = { displayMode: 'fiat' as const };
  const subtotal = formatFromFiat(order.subtotalGbp, 'GBP', fiatOpts);
  const platformCharge = formatFromFiat(order.platformChargeGbp, 'GBP', fiatOpts);
  const postage = formatFromFiat(order.postageFeeGbp, 'GBP', fiatOpts);
  const total = formatFromFiat(order.totalGbp, 'GBP', fiatOpts);

  const counterpartyRole = isBuyer ? 'Seller' : 'Buyer';
  const counterparty = isBuyer ? order.seller : order.buyer;
  const counterpartyName = counterparty?.username ?? 'Unknown';

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Receipt</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.headerBtn} onPress={handleShare} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Share receipt">
            <Ionicons name="share-outline" size={22} color={Colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
      >
        {/* Success header for completed orders */}
        {isReceiptFinal && normalisedStatus !== 'cancelled' && normalisedStatus !== 'refunded' ? (
          <View style={styles.successHeader}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={28} color={Colors.success} />
            </View>
            <Text style={styles.successTitle}>
              {isBuyer ? 'Order complete' : 'Payment received'}
            </Text>
            <Text style={styles.successSubtitle}>Receipt #{shortOrderId}</Text>
          </View>
        ) : null}

        <View style={styles.receiptCard}>
          <View style={styles.receiptHeader}>
            <Text style={styles.receiptTitle}>Order Receipt</Text>
            <Pressable
              onPress={handleCopyOrderId}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Copy order ID ${shortOrderId}`}
            >
              <View style={styles.orderIdRow}>
                <Text style={styles.orderIdLabel}>#{shortOrderId}</Text>
                <Ionicons name="copy-outline" size={14} color={Colors.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={styles.receiptSection}>
            <ReceiptRow label="Date" value={formatReceiptDate(order.createdAt)} />
            <ReceiptRow label="Status" value={statusLabel} />
            <ReceiptRow label={counterpartyRole} value={`@${counterpartyName}`} />
          </View>

          <View style={styles.receiptDivider} />

          <View style={styles.receiptSection}>
            <Text style={styles.sectionLabel}>Transaction breakdown</Text>
            <ReceiptRow label="Item" value={subtotal} />
            <ReceiptRow label="Platform charge" value={platformCharge} />
            <ReceiptRow label="Delivery" value={postage} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{total}</Text>
            </View>
          </View>

          {order.trackingNumber && (
            <>
              <View style={styles.receiptDivider} />
              <View style={styles.receiptSection}>
                <Text style={styles.sectionLabel}>Shipping</Text>
                {order.shippingProvider && (
                  <ReceiptRow label="Carrier" value={order.shippingProvider} />
                )}
                <ReceiptRow label="Tracking" value={order.trackingNumber} />
                {order.shippedAt && (
                  <ReceiptRow label="Shipped" value={formatReceiptDate(order.shippedAt)} />
                )}
                {order.deliveredAt && (
                  <ReceiptRow label="Delivered" value={formatReceiptDate(order.deliveredAt)} />
                )}
              </View>
            </>
          )}

          <View style={styles.receiptDivider} />

          <View style={styles.immutableNotice}>
            <Ionicons name="lock-closed-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.immutableText}>
              This receipt is an immutable record of the transaction at the time of the order.
            </Text>
          </View>

          {!isReceiptFinal && (
            <View style={styles.pendingNotice}>
              <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.pendingText}>
                This order is still in progress. The receipt will update as the order progresses.
              </Text>
            </View>
          )}

          {/* What happens next — contextual next-step hint for pending orders */}
          {!isReceiptFinal && isBuyer && (
            <View style={styles.nextStepsCard}>
              <Text style={styles.nextStepsTitle}>What happens next</Text>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, styles.nextStepDotActive]} />
                <Text style={styles.nextStepText}>Seller prepares and dispatches your item</Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, styles.nextStepDotPending]} />
                <Text style={styles.nextStepTextMuted}>Carrier delivers to your address</Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, styles.nextStepDotPending]} />
                <Text style={styles.nextStepTextMuted}>You confirm receipt and can leave a review</Text>
              </View>
            </View>
          )}
        </View>

        <Pressable
          style={styles.viewDetailBtn}
          onPress={() => navigation.replace('OrderDetail', { orderId })}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel="View order details"
        >
          <Text style={styles.viewDetailBtnText}>View order details</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.brand} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptRowLabel}>{label}</Text>
      <Text style={styles.receiptRowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 44,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.md,
  },
  skeletonItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  skeletonTxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 14,
    paddingHorizontal: Space.xl,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  successHeader: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: 6,
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.success}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  successSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  receiptCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Space.md,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  receiptTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderIdLabel: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  receiptSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  receiptRowLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  receiptRowValue: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    textAlign: 'right',
    flex: 1,
  },
  receiptDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Space.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.xs,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  immutableNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  immutableText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: Space.xs,
  },
  pendingText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  nextStepsCard: {
    marginTop: Space.md,
    padding: Space.md,
    backgroundColor: `${Colors.brand}08`,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${Colors.brand}20`,
  },
  nextStepsTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: Space.sm,
    letterSpacing: -0.2,
  },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  nextStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nextStepDotActive: {
    backgroundColor: Colors.brand,
  },
  nextStepDotPending: {
    backgroundColor: Colors.border,
  },
  nextStepText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    lineHeight: 16,
  },
  nextStepTextMuted: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  viewDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Space.md,
    marginTop: Space.md,
    minHeight: 48,
  },
  viewDetailBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
});
