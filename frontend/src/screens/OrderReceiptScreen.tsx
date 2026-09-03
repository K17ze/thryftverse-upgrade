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
  Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { getOrder, type CommerceOrder } from '../services/commerceApi';
import { CachedImage } from '../components/CachedImage';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { normaliseOrderStatus, humaniseStatus, isTerminalStatus } from '../components/orders/orderCapabilities';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { haptics } from '../utils/haptics';
import { t } from '../i18n';


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
  const { currencyCode, formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const { colors, isDark } = useAppTheme();

  // Theme-aware color overrides for the static styles.
  const themed = React.useMemo(() => ({
    container: { backgroundColor: colors.background },
    loadingText: { color: colors.textMuted },
    errorTitle: { color: colors.textPrimary },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    successIconWrap: { backgroundColor: colors.successSubtle },
    successTitle: { color: colors.textPrimary },
    successSubtitle: { color: colors.textMuted },
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
    const total = formatFromFiat(order.totalGbp, currencyCode, { displayMode: 'fiat' });
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

  if (loadError || !order) {
    return (
      <View style={[styles.container, themed.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Receipt"
          onBack={() => navigation.goBack()}
          style={{ paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
        />
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, themed.errorTitle]}>Receipt could not be loaded</Text>
          <Pressable style={({ pressed }) => [styles.retryBtn, themed.retryBtn, pressed && styles.retryBtnPressed]} onPress={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={[styles.retryBtnText, themed.retryBtnText]}>Retry</Text>
          </Pressable>
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
          <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, themed.errorTitle]}>You do not have access to this receipt</Text>
        </View>
      </View>
    );
  }

  const shortOrderId = order.id.slice(0, 8).toUpperCase();
  const statusLabel = humaniseStatus(order.status);
  const normalisedStatus = normaliseOrderStatus(order.status);
  const isReceiptFinal = isTerminalStatus(normalisedStatus);

  const fiatOpts = { displayMode: 'fiat' as const };
  const subtotal = formatFromFiat(order.subtotalGbp, currencyCode, fiatOpts);
  const platformCharge = formatFromFiat(order.platformChargeGbp, currencyCode, fiatOpts);
  const postage = formatFromFiat(order.postageFeeGbp, currencyCode, fiatOpts);
  const total = formatFromFiat(order.totalGbp, currencyCode, fiatOpts);
  const buyerProtectionFee = order.buyerProtectionFeeGbp;
  const hasBuyerProtection = buyerProtectionFee != null && buyerProtectionFee !== 0;

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
                <Ionicons name="print-outline" size={22} color={colors.textPrimary} />
              </Pressable>
            )}
            <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]} onPress={handleShare} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Share receipt">
              <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
        }
        style={{ paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
      >
        {/* Success header for completed orders */}
        {isReceiptFinal && normalisedStatus !== 'cancelled' && normalisedStatus !== 'refunded' ? (
          <View style={styles.successHeader}>
            <View style={[styles.successIconWrap, themed.successIconWrap]}>
              <Ionicons name="checkmark" size={28} color={colors.success} />
            </View>
            <Text style={[styles.successTitle, themed.successTitle]}>
              {isBuyer ? 'Order complete' : 'Payment received'}
            </Text>
            <Text style={[styles.successSubtitle, themed.successSubtitle]}>Receipt #{shortOrderId}</Text>
          </View>
        ) : null}

        <View style={styles.receiptCard}>
          <View style={styles.receiptHeader}>
            <Text style={[styles.receiptTitle, themed.receiptTitle]}>Order Receipt</Text>
            <Pressable
              onPress={handleCopyOrderId}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Copy order ID ${shortOrderId}`}
            >
              <View style={styles.orderIdRow}>
                <Text style={[styles.orderIdLabel, themed.orderIdLabel]}>#{shortOrderId}</Text>
                <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={styles.receiptSection}>
            <ReceiptRow label="Date" value={formatReceiptDate(order.createdAt)} />
            <ReceiptRow label="Status" value={statusLabel} />
            <ReceiptRow label={counterpartyRole} value={`@${counterpartyName}`} />
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
                  <Ionicons name="image-outline" size={20} color={colors.textMuted} />
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
            <Text style={[styles.sectionLabel, themed.sectionLabel]}>Transaction breakdown</Text>
            <ReceiptRow label="Item" value={subtotal} />
            {hasBuyerProtection && (
              <ReceiptRow label="Buyer protection" value={formatFromFiat(buyerProtectionFee!, currencyCode, fiatOpts)} />
            )}
            <ReceiptRow label="Platform charge" value={platformCharge} />
            <ReceiptRow label="Delivery" value={postage} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, themed.totalLabel]}>Total</Text>
              <Text style={[styles.totalValue, themed.totalValue]}>{total}</Text>
            </View>
          </View>

          {order.trackingNumber && (
            <>
              <View style={[styles.receiptDivider, themed.receiptDivider]} />
              <View style={styles.receiptSection}>
                <Text style={[styles.sectionLabel, themed.sectionLabel]}>Shipping</Text>
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

          <View style={[styles.receiptDivider, themed.receiptDivider]} />

          <View style={styles.immutableNotice}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.immutableText, themed.immutableText]}>
              This receipt is an immutable record of the transaction at the time of the order.
            </Text>
          </View>

          {!isReceiptFinal && (
            <View style={styles.pendingNotice}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
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
          <Ionicons name="chevron-forward" size={16} color={colors.brand} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
          onPress={handleShare}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Save or share receipt"
        >
          <Ionicons name="download-outline" size={18} color={colors.brand} />
          <Text style={[styles.saveBtnText, themed.viewDetailBtnText]}>Save or share receipt</Text>
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
      <Text style={[styles.receiptRowValue, rowThemed.value]} numberOfLines={1}>{value}</Text>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md },
  loadingText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
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
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  successSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  receiptCard: {
    padding: Space.md },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md },
  receiptTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  orderIdLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
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
    paddingTop: Space.xs },
  totalLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  totalValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
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
    borderRadius: Radius.sm },
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
