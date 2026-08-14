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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Typography, Radius, Type, Control, LetterSpacing } from '../theme/designTokens';
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
  const { colors, isDark } = useAppTheme();

  // Theme-aware color overrides for the static styles.
  const t = React.useMemo(() => ({
    container: { backgroundColor: colors.background },
    header: { borderBottomColor: colors.border },
    headerTitle: { color: colors.textPrimary },
    loadingText: { color: colors.textMuted },
    errorTitle: { color: colors.textPrimary },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    successIconWrap: { backgroundColor: `${colors.success}15` },
    successTitle: { color: colors.textPrimary },
    successSubtitle: { color: colors.textMuted },
    receiptCard: { backgroundColor: colors.surface },
    receiptTitle: { color: colors.textPrimary },
    orderIdLabel: { color: colors.textSecondary },
    sectionLabel: { color: colors.textMuted },
    receiptRowLabel: { color: colors.textSecondary },
    receiptRowValue: { color: colors.textPrimary },
    receiptDivider: { backgroundColor: colors.border },
    totalLabel: { color: colors.textPrimary },
    totalValue: { color: colors.textPrimary },
    immutableText: { color: colors.textMuted },
    pendingText: { color: colors.textMuted },
    nextStepsCard: { backgroundColor: `${colors.brand}08`, borderColor: `${colors.brand}20` },
    nextStepsTitle: { color: colors.textPrimary },
    nextStepDotActive: { backgroundColor: colors.brand },
    nextStepDotPending: { backgroundColor: colors.border },
    nextStepText: { color: colors.textPrimary },
    nextStepTextMuted: { color: colors.textMuted },
    viewDetailBtnText: { color: colors.brand },
  }), [colors]);

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

  // Print is only available on web platforms where window.print() exists.
  // On native platforms this button is not rendered (no inert affordance).
  const handlePrint = useCallback(() => {
    haptics.tap();
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.container, t.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.skeletonContainer}>
          {/* Receipt header skeleton */}
          <SkeletonLoader width={100} height={12} borderRadius={6} />
          <SkeletonLoader width={140} height={20} borderRadius={10} style={{ marginTop: Space.sm }} />
          <SkeletonLoader width="80%" height={14} borderRadius={7} style={{ marginTop: 6 }} />
          {/* Item row skeleton */}
          <View style={styles.skeletonItemRow}>
            <SkeletonLoader width={56} height={56} borderRadius={8} />
            <View style={{ flex: 1, gap: Space.xs + 2 }}>
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
      <View style={[styles.container, t.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, t.errorTitle]}>Receipt could not be loaded</Text>
          <Pressable style={({ pressed }) => [styles.retryBtn, t.retryBtn, pressed && styles.retryBtnPressed]} onPress={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={[styles.retryBtnText, t.retryBtnText]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isBuyer && !isSeller) {
    return (
      <View style={[styles.container, t.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, t.errorTitle]}>You do not have access to this receipt</Text>
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
    <View style={[styles.container, t.container]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
        <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, t.headerTitle]}>Receipt</Text>
        <View style={styles.headerRight}>
          {Platform.OS === 'web' && (
            <Pressable
              style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
              onPress={handlePrint}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Print receipt"
            >
              <Ionicons name="print-outline" size={22} color={colors.textPrimary} />
            </Pressable>
          )}
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]} onPress={handleShare} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Share receipt">
            <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
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
            <View style={[styles.successIconWrap, t.successIconWrap]}>
              <Ionicons name="checkmark" size={28} color={colors.success} />
            </View>
            <Text style={[styles.successTitle, t.successTitle]}>
              {isBuyer ? 'Order complete' : 'Payment received'}
            </Text>
            <Text style={[styles.successSubtitle, t.successSubtitle]}>Receipt #{shortOrderId}</Text>
          </View>
        ) : null}

        <View style={[styles.receiptCard, t.receiptCard]}>
          <View style={styles.receiptHeader}>
            <Text style={[styles.receiptTitle, t.receiptTitle]}>Order Receipt</Text>
            <Pressable
              onPress={handleCopyOrderId}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Copy order ID ${shortOrderId}`}
            >
              <View style={styles.orderIdRow}>
                <Text style={[styles.orderIdLabel, t.orderIdLabel]}>#{shortOrderId}</Text>
                <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={styles.receiptSection}>
            <ReceiptRow label="Date" value={formatReceiptDate(order.createdAt)} />
            <ReceiptRow label="Status" value={statusLabel} />
            <ReceiptRow label={counterpartyRole} value={`@${counterpartyName}`} />
          </View>

          <View style={[styles.receiptDivider, t.receiptDivider]} />

          <View style={styles.receiptSection}>
            <Text style={[styles.sectionLabel, t.sectionLabel]}>Transaction breakdown</Text>
            <ReceiptRow label="Item" value={subtotal} />
            <ReceiptRow label="Platform charge" value={platformCharge} />
            <ReceiptRow label="Delivery" value={postage} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, t.totalLabel]}>Total</Text>
              <Text style={[styles.totalValue, t.totalValue]}>{total}</Text>
            </View>
          </View>

          {order.trackingNumber && (
            <>
              <View style={[styles.receiptDivider, t.receiptDivider]} />
              <View style={styles.receiptSection}>
                <Text style={[styles.sectionLabel, t.sectionLabel]}>Shipping</Text>
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

          <View style={[styles.receiptDivider, t.receiptDivider]} />

          <View style={styles.immutableNotice}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.immutableText, t.immutableText]}>
              This receipt is an immutable record of the transaction at the time of the order.
            </Text>
          </View>

          {!isReceiptFinal && (
            <View style={styles.pendingNotice}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.pendingText, t.pendingText]}>
                This order is still in progress. The receipt will update as the order progresses.
              </Text>
            </View>
          )}

          {/* What happens next — contextual next-step hint for pending orders */}
          {!isReceiptFinal && isBuyer && (
            <View style={[styles.nextStepsCard, t.nextStepsCard]}>
              <Text style={[styles.nextStepsTitle, t.nextStepsTitle]}>What happens next</Text>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, t.nextStepDotActive]} />
                <Text style={[styles.nextStepText, t.nextStepText]}>Seller prepares and dispatches your item</Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, t.nextStepDotPending]} />
                <Text style={[styles.nextStepTextMuted, t.nextStepTextMuted]}>Carrier delivers to your address</Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, t.nextStepDotPending]} />
                <Text style={[styles.nextStepTextMuted, t.nextStepTextMuted]}>You confirm receipt and can leave a review</Text>
              </View>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.viewDetailBtn, pressed && styles.viewDetailBtnPressed]}
          onPress={() => navigation.replace('OrderDetail', { orderId })}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel="View order details"
        >
          <Text style={[styles.viewDetailBtnText, t.viewDetailBtnText]}>View order details</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.brand} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const rowThemed = React.useMemo(() => ({
    label: { color: colors.textSecondary },
    value: { color: colors.textPrimary },
  }), [colors]);
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptRowLabel, rowThemed.label]}>{label}</Text>
      <Text style={[styles.receiptRowValue, rowThemed.value]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnPressed: {
    opacity: 0.5,
  },
  retryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  viewDetailBtnPressed: {
    opacity: 0.6,
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
  },
  headerSpacer: {
    width: Control.hit,
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
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
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
    paddingVertical: Space.xs,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  errorTitle: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  successHeader: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: Space.xs + 2,
  },
  successIconWrap: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  successTitle: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyLarge.letterSpacing,
  },
  successSubtitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
  },
  receiptCard: {
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  receiptTitle: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
  },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  orderIdLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  receiptSection: {
    gap: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + 0.38,
    marginBottom: Space.xs,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
    gap: Space.md,
  },
  receiptRowLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  receiptRowValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    textAlign: 'right',
    flex: 1,
  },
  receiptDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.xs,
  },
  totalLabel: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
  },
  totalValue: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
  },
  immutableNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
  },
  immutableText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
  },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    marginTop: Space.xs,
  },
  pendingText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
  },
  nextStepsCard: {
    marginTop: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nextStepsTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
    letterSpacing: Type.body.letterSpacing,
  },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  nextStepDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.sm,
  },
  nextStepDotActive: {
  },
  nextStepDotPending: {
  },
  nextStepText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    lineHeight: Type.caption.lineHeight,
  },
  nextStepTextMuted: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
  },
  viewDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
    marginTop: Space.md,
    minHeight: Space.xxl,
  },
  viewDetailBtnText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
});
