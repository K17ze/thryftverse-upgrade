import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Pressable,
  RefreshControl,
  Share,
  Clipboard,
  Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Control, LetterSpacing, IconGrammar } from '../theme/designTokens';
import { IconSize } from '../theme/iconTokens';
import { AppIcon } from '../components/common/AppIcon';
import { TypographyV2 } from '../theme/typography.v2';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { getOrder, type CommerceOrder } from '../services/commerceApi';
import { CachedImage } from '../components/CachedImage';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { normaliseOrderStatus, humaniseStatus, isTerminalStatus, getStatusColor } from '../components/orders/orderCapabilities';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { haptics } from '../utils/haptics';
import { useConnectivity } from '../hooks/useConnectivity';


type OrderReceiptRoute = RouteProp<{ OrderReceipt: { orderId: string } }, 'OrderReceipt'>;

function formatReceiptDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit' });
}

export default function OrderReceiptScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<OrderReceiptRoute>();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const { colors, isDark } = useAppTheme();
  const { isOffline } = useConnectivity();

  // Theme-aware color overrides for the static styles.
  const themed = React.useMemo(() => ({
    container: { backgroundColor: colors.background },
    errorTitle: { color: colors.textPrimary },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    successIconWrap: { backgroundColor: colors.successSubtle },
    successTitle: { color: colors.textPrimary },
    successSubtitle: { color: colors.textMuted },
    orderIdLabel: { color: colors.textPrimary },
    sectionLabel: { color: colors.textMuted },
    receiptRowLabel: { color: colors.textSecondary },
    receiptRowValue: { color: colors.textPrimary },
    receiptDivider: { backgroundColor: colors.border },
    totalLabel: { color: colors.textPrimary },
    totalValue: { color: colors.textPrimary },
    immutableText: { color: colors.textMuted },
    pendingText: { color: colors.textMuted },
    nextStepsCard: { borderTopColor: colors.border },
    nextStepsTitle: { color: colors.textPrimary },
    nextStepDotActive: { backgroundColor: colors.brand },
    nextStepDotPending: { backgroundColor: colors.border },
    nextStepText: { color: colors.textPrimary },
    nextStepTextMuted: { color: colors.textMuted },
    viewDetailBtnText: { color: colors.brand } }), [colors]);

  const { orderId } = route.params ?? {};

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  // A ref, not state: adding `order` to fetchOrder's deps would re-create
  // the callback on every successful fetch and loop the load effect.
  const hasLoadedOrderRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const fetched = await getOrder(orderId);
      if (!isMountedRef.current) return;
      setOrder(fetched);
      hasLoadedOrderRef.current = true;
      setLoadError(null);
    } catch (error) {
      if (!isMountedRef.current) return;
      // A failed refresh must not destroy a receipt already on screen —
      // keep the document and surface the failure as a toast instead.
      if (hasLoadedOrderRef.current) {
        show('Could not refresh receipt', 'error');
      } else {
        setLoadError('Receipt could not be loaded. Check your connection and try again.');
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [orderId, show]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  // Pull-to-refresh — the "this receipt will update" promise below is only
  // true if the document can actually be re-fetched on demand.
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchOrder();
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
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
        message: `Thryftverse Order #${shortId}\n${status}\n${date}\nTotal: ${total}` });
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
      <View style={[styles.container, themed.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Receipt"
          onBack={() => navigation.goBack()}
          style={{ paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
        />
        <View style={styles.skeletonContainer}>
          {/* Receipt header skeleton */}
          <SkeletonLoader width={100} height={12} borderRadius={Radius.sm} />
          <SkeletonLoader width={140} height={20} borderRadius={Radius.lg} style={{ marginTop: Space.sm }} />
          <SkeletonLoader width="80%" height={14} borderRadius={Radius.md} style={{ marginTop: 6 }} />
          {/* Item row skeleton */}
          <View style={styles.skeletonItemRow}>
            <SkeletonLoader width={56} height={56} borderRadius={Radius.md} />
            <View style={{ flex: 1, gap: Space.xs + 2 }}>
              <SkeletonLoader width="70%" height={14} borderRadius={Radius.md} />
              <SkeletonLoader width="40%" height={12} borderRadius={Radius.sm} />
            </View>
          </View>
          {/* Transaction rows skeleton */}
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonTxRow}>
              <SkeletonLoader width="50%" height={12} borderRadius={Radius.sm} />
              <SkeletonLoader width={70} height={12} borderRadius={Radius.sm} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, themed.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Receipt"
          onBack={() => navigation.goBack()}
          style={{ paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
        />
        <View style={styles.errorContainer}>
          <AppIcon name={isOffline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={IconSize.hero} color="textMuted" />
          <Text style={[styles.errorTitle, themed.errorTitle]} maxFontSizeMultiplier={2}>{isOffline ? 'You are offline' : 'Receipt could not be loaded'}</Text>
          {!isOffline && <Text style={[themed.pendingText, { color: colors.textMuted, marginTop: 4 }]} maxFontSizeMultiplier={2}>Check your connection and try again.</Text>}
          <Pressable style={({ pressed }) => [styles.retryBtn, themed.retryBtn, pressed && styles.retryBtnPressed]} onPress={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={[styles.retryBtnText, themed.retryBtnText]} maxFontSizeMultiplier={2}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, themed.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Receipt"
          onBack={() => navigation.goBack()}
          style={{ paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
        />
        <View style={styles.errorContainer}>
          <AppIcon name="document-text-outline" size={IconSize.hero} color="textMuted" />
          <Text style={[styles.errorTitle, themed.errorTitle]} maxFontSizeMultiplier={2}>Order not found</Text>
          <Text style={[themed.pendingText, { color: colors.textMuted, marginTop: 4 }]} maxFontSizeMultiplier={2}>This order may have been removed or is no longer available.</Text>
        </View>
      </View>
    );
  }

  if (!isBuyer && !isSeller) {
    return (
      <View style={[styles.container, themed.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Receipt"
          onBack={() => navigation.goBack()}
          style={{ paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
        />
        <View style={styles.errorContainer}>
          <AppIcon name="lock-closed-outline" size={IconSize.hero} color="textMuted" />
          <Text style={[styles.errorTitle, themed.errorTitle]}>You do not have access to this receipt</Text>
        </View>
      </View>
    );
  }

  const shortOrderId = order.id.slice(0, 8).toUpperCase();
  const statusLabel = humaniseStatus(order.status);
  const normalisedStatus = normaliseOrderStatus(order.status);
  const isReceiptFinal = isTerminalStatus(normalisedStatus);
  // Status stamp — the document's headline fact, rendered in the canonical
  // order-status tone (same getStatusColor grammar as the orders ledger).
  const statusColor = getStatusColor(order.status, colors);
  const fulfilment = order.fulfilmentSnapshot ?? null;
  const hasDeliveryFacts = Boolean(
    order.trackingNumber
    || fulfilment?.destinationSummary
    || fulfilment?.serviceName
    || order.shippingProvider
    || order.shipByDate
    || order.shippedAt
    || order.deliveredAt);
  const etaLabel = fulfilment?.etaMinDays != null && fulfilment?.etaMaxDays != null
    ? fulfilment.etaMinDays === fulfilment.etaMaxDays
      ? `${fulfilment.etaMinDays} day${fulfilment.etaMinDays === 1 ? '' : 's'}`
      : `${fulfilment.etaMinDays}–${fulfilment.etaMaxDays} days`
    : null;
  // Escrow projection — the seller's most-asked question on a receipt.
  const releaseLabel = isSeller
    ? order.moneyProjection?.releasedAt
      ? `Released ${formatReceiptDate(order.moneyProjection.releasedAt)}`
      : order.moneyProjection?.estimatedReleaseAt
        ? `Estimated ${formatReceiptDate(order.moneyProjection.estimatedReleaseAt)}`
        : null
    : null;

  const fiatOpts = { displayMode: 'fiat' as const };
  const subtotal = formatFromFiat(order.subtotalGbp, 'GBP', fiatOpts);
  const platformCharge = formatFromFiat(order.platformChargeGbp, 'GBP', fiatOpts);
  const postage = formatFromFiat(order.postageFeeGbp, 'GBP', fiatOpts);
  const total = formatFromFiat(order.totalGbp, 'GBP', fiatOpts);
  const buyerProtectionFee = order.buyerProtectionFeeGbp;
  const hasBuyerProtection = buyerProtectionFee != null && buyerProtectionFee !== 0;
  // The backend stores the buyer-protection fee in both columns
  // (buyer_protection_fee_gbp === platform_charge_gbp) — rendering both
  // rows would double-count one fee. A single "Buyer protection" row is
  // the unified label; "Platform charge" only appears when a legacy order
  // genuinely carries a different figure (mirrors TransactionBreakdown).
  const feesAreDuplicate = hasBuyerProtection && buyerProtectionFee === order.platformChargeGbp;

  const counterpartyRole = isBuyer ? 'Seller' : 'Buyer';
  const counterparty = isBuyer ? order.seller : order.buyer;
  const counterpartyName = counterparty?.username ?? 'Unknown';

  return (
    <View style={[styles.container, themed.container]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <ScreenHeader
        title="Receipt"
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={styles.headerRight}>
            {Platform.OS === 'web' && (
              <Pressable
                style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
                onPress={handlePrint}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Print receipt"
              >
                <AppIcon name="print-outline" size={IconGrammar.standard} color="textPrimary" />
              </Pressable>
            )}
            <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]} onPress={handleShare} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Share receipt">
              <AppIcon name="share-outline" size={IconGrammar.standard} color="textPrimary" />
            </Pressable>
          </View>
        }
        style={{ paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.textMuted}
          />
        }
      >
        {/* Success header for completed orders */}
        {isReceiptFinal && normalisedStatus !== 'cancelled' && normalisedStatus !== 'refunded' ? (
          <View style={styles.successHeader}>
            <View style={[styles.successIconWrap, themed.successIconWrap]}>
              <AppIcon name="checkmark" size={IconSize.xl} color="successText" />
            </View>
            <Text style={[styles.successTitle, themed.successTitle]}>
              {isBuyer ? 'Order complete' : 'Payment received'}
            </Text>
            <Text style={[styles.successSubtitle, themed.successSubtitle]}>Receipt #{shortOrderId}</Text>
          </View>
        ) : null}

        {/* The receipt document — the one contained panel on this surface.
            Identifier on the left, status stamp on the right: the two facts
            a receipt must answer at a glance. No inner title duplicating
            the screen header. */}
        <View style={[styles.receiptCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.receiptHeader}>
            <Pressable
              onPress={handleCopyOrderId}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Copy order ID ${shortOrderId}`}
            >
              <View style={styles.orderIdRow}>
                <Text style={[styles.orderIdLabel, themed.orderIdLabel]}>#{shortOrderId}</Text>
                <AppIcon name="copy-outline" size={IconSize.xs} color="textMuted" />
              </View>
            </Pressable>
            <View style={[styles.statusStamp, { backgroundColor: `${statusColor}15` }]}>
              <View style={[styles.statusStampDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusStampText, { color: statusColor }]} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <View style={styles.receiptSection}>
            <ReceiptRow label="Date" value={formatReceiptDate(order.createdAt)} />
            {order.paidAt ? (
              <ReceiptRow label="Paid" value={formatReceiptDate(order.paidAt)} />
            ) : null}
            <ReceiptRow label={counterpartyRole} value={`@${counterpartyName}`} />
            {releaseLabel ? (
              <ReceiptRow label="Funds" value={releaseLabel} />
            ) : null}
            {order.inspectionDeadlineAt ? (
              <ReceiptRow label="Inspection ends" value={formatReceiptDate(order.inspectionDeadlineAt)} />
            ) : null}
          </View>

          <View style={[styles.receiptDivider, themed.receiptDivider]} />

          {/* Itemized item — image + title + price for visual verification */}
          <View style={styles.receiptSection}>
            <Text style={[styles.sectionLabel, themed.sectionLabel]}>Item</Text>
            <View style={styles.itemizedRow}>
              {order.listingImageUrl ? (
                <CachedImage
                  uri={order.listingImageUrl}
                  style={styles.itemThumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.itemThumb, styles.itemThumbPlaceholder]}>
                  <AppIcon name="image-outline" size={IconSize.md} color="textMuted" />
                </View>
              )}
              <View style={styles.itemizedInfo}>
                <Text style={[styles.itemizedTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {order.listingTitle}
                </Text>
                <Text style={[styles.itemizedPrice, { color: colors.textSecondary }]}>
                  {subtotal}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.receiptDivider, themed.receiptDivider]} />

          <View style={styles.receiptSection}>
            <Text style={[styles.sectionLabel, themed.sectionLabel]}>Order breakdown</Text>
            <ReceiptRow label="Item" value={subtotal} />
            {hasBuyerProtection && (
              <ReceiptRow label="Buyer protection" value={formatFromFiat(buyerProtectionFee!, 'GBP', fiatOpts)} />
            )}
            {!feesAreDuplicate && (
              <ReceiptRow label="Platform charge" value={platformCharge} />
            )}
            <ReceiptRow label="Delivery" value={postage} />
            <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.totalLabel, themed.totalLabel]}>Total</Text>
              <Text style={[styles.totalValue, themed.totalValue]}>{total}</Text>
            </View>
          </View>

          {hasDeliveryFacts ? (
            <>
              <View style={[styles.receiptDivider, themed.receiptDivider]} />
              <View style={styles.receiptSection}>
                <Text style={[styles.sectionLabel, themed.sectionLabel]}>Delivery</Text>
                {fulfilment?.destinationSummary ? (
                  <ReceiptRow label="Deliver to" value={fulfilment.destinationSummary} />
                ) : null}
                {fulfilment?.serviceName ? (
                  <ReceiptRow label="Service" value={fulfilment.serviceName} />
                ) : null}
                {order.shippingProvider ? (
                  <ReceiptRow label="Carrier" value={order.shippingProvider} />
                ) : null}
                {etaLabel ? (
                  <ReceiptRow label="ETA" value={etaLabel} />
                ) : null}
                {!isReceiptFinal && order.shipByDate && !order.shippedAt ? (
                  <ReceiptRow label="Ship by" value={formatReceiptDate(order.shipByDate)} />
                ) : null}
                {order.trackingNumber ? (
                  <ReceiptRow label="Tracking" value={order.trackingNumber} />
                ) : null}
                {order.shippedAt ? (
                  <ReceiptRow label="Shipped" value={formatReceiptDate(order.shippedAt)} />
                ) : null}
                {order.deliveredAt ? (
                  <ReceiptRow label="Delivered" value={formatReceiptDate(order.deliveredAt)} />
                ) : null}
              </View>
            </>
          ) : null}

          <View style={[styles.receiptDivider, themed.receiptDivider]} />

          <View style={styles.immutableNotice}>
            <AppIcon name="lock-closed-outline" size={IconSize.micro} color="textMuted" />
            <Text style={[styles.immutableText, themed.immutableText]}>
              This receipt is an immutable record of the order.
            </Text>
          </View>

          {!isReceiptFinal && (
            <View style={styles.pendingNotice}>
              <AppIcon name="time-outline" size={IconSize.micro} color="textMuted" />
              <Text style={[styles.pendingText, themed.pendingText]}>
                This order is still in progress. The receipt will update as the order progresses.
              </Text>
            </View>
          )}

          {/* What happens next — contextual next-step hint for pending orders */}
          {!isReceiptFinal && isBuyer && (
            <View style={[styles.nextStepsCard, themed.nextStepsCard]}>
              <Text style={[styles.nextStepsTitle, themed.nextStepsTitle]}>What happens next</Text>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, themed.nextStepDotActive]} />
                <Text style={[styles.nextStepText, themed.nextStepText]}>Seller prepares and dispatches your item</Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, themed.nextStepDotPending]} />
                <Text style={[styles.nextStepTextMuted, themed.nextStepTextMuted]}>Carrier delivers to your address</Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={[styles.nextStepDot, themed.nextStepDotPending]} />
                <Text style={[styles.nextStepTextMuted, themed.nextStepTextMuted]}>You confirm receipt and can leave a review</Text>
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
          <Text style={[styles.viewDetailBtnText, themed.viewDetailBtnText]}>View order details</Text>
          <AppIcon name="chevron-forward" size={IconSize.sm} color="brand" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
          onPress={handleShare}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Save or share receipt"
        >
          <AppIcon name="share-social-outline" size={18} color="brand" />
          <Text style={[styles.saveBtnText, themed.viewDetailBtnText]}>Share receipt</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const rowThemed = React.useMemo(() => ({
    label: { color: colors.textSecondary },
    value: { color: colors.textPrimary } }), [colors]);
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptRowLabel, rowThemed.label]}>{label}</Text>
      <Text style={[styles.receiptRowValue, rowThemed.value]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  headerBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  headerBtnPressed: {
    opacity: 0.5 },
  retryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }] },
  viewDetailBtnPressed: {
    opacity: 0.6 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center' },
  skeletonContainer: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.md },
  skeletonItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm },
  skeletonTxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  errorTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center' },
  retryBtn: {
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center' },
  retryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md },
  successHeader: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: Space.xs + 2 },
  successIconWrap: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs },
  successTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  successSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  receiptCard: {
    padding: Space.md,
    // The receipt is a document — the single contained panel this surface
    // is allowed. Surface fill + hairline gives the ledger object-hood
    // without decorative chrome.
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  orderIdLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  // Status stamp — canonical dot+label pill in getStatusColor tone, the
  // same grammar as the orders ledger badge.
  statusStamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs - 2,
    borderRadius: Radius.full },
  statusStampDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full },
  statusStampText: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: TypographyV2.captionElevated.fontFamily },
  receiptSection: {
    gap: Space.sm },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + 0.38,
    marginBottom: Space.xs },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
    gap: Space.md },
  receiptRowLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  receiptRowValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'right',
    flex: 1 },
  receiptDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.md },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.xs,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
  totalLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // The total is the document's dominant figure — priceList tabular bold,
  // clearly ranked above the body-size fee rows.
  totalValue: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing },
  immutableNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2 },
  immutableText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    marginTop: Space.xs },
  pendingText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  nextStepsCard: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth },
  nextStepsTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.sm,
    letterSpacing: TypographyV2.body.letterSpacing },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs },
  nextStepDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full },
  nextStepDotActive: {},
  nextStepDotPending: {},
  nextStepText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  nextStepTextMuted: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  viewDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
    marginTop: Space.md,
    minHeight: Space.xxl },
  viewDetailBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Itemized item row ──
  itemizedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  itemThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md },
  itemThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent' },
  itemizedInfo: {
    flex: 1,
    gap: Space.xs - 2 },
  itemizedTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  itemizedPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Save / share button ──
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md - 2,
    minHeight: Space.xxl - Space.sm },
  saveBtnPressed: {
    opacity: 0.6 },
  saveBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily } });
