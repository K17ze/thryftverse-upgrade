import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Space, Radius, Type, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { getOrder, shipOrder, assertHandoff, type CommerceOrder } from '../services/commerceApi';
import { parseApiError } from '../lib/apiClient';
import { fetchJson } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import {
  normaliseOrderStatus,
  humaniseStatus,
  resolveCapabilities,
  type FulfilmentSnapshot,
} from '../components/orders/orderCapabilities';
import {
  classifyShippingError,
  SHIPPING_ERROR_RECOVERY,
  getDropOffUrl,
  getProviderMetadata,
} from '../services/shippingProviderRegistry';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { haptics } from '../utils/haptics';

type SellerFulfilmentRoute = RouteProp<{ SellerFulfilment: { orderId: string } }, 'SellerFulfilment'>;

// Carriers offered only for MANUAL shipping (when the buyer did NOT purchase
// an integrated service). For integrated purchases, the buyer-selected
// service is shown and the picker is suppressed.
const MANUAL_CARRIERS = [
  'Royal Mail',
  'DPD',
  'Evri',
  'Yodel',
  'UPS',
  'DHL',
  'FedEx',
];

function formatShipByDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Ship-by deadline is server truth only.
 * No client-invented fallback. If the server hasn't provided a deadline,
 * we return null and show "Deadline unavailable" rather than inventing one.
 */
function getShipByDate(order: CommerceOrder): string | null {
  if (order.shipByDate) return order.shipByDate;
  const snap = order.fulfilmentSnapshot;
  if (snap?.shipByDate) return snap.shipByDate;
  return null;
}

export default function SellerFulfilmentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<SellerFulfilmentRoute>();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { orderId } = route.params;

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Manual shipping form state
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingProvider, setShippingProvider] = useState('');
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);

  // Label generation state (integrated shipping)
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [generatedLabelUrl, setGeneratedLabelUrl] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);

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

      // Pre-fill from existing order data (for resume after app kill)
      if (fetched.trackingNumber) setTrackingNumber(fetched.trackingNumber);
      if (fetched.shippingProvider) setShippingProvider(fetched.shippingProvider);
      if (fetched.shippingLabelUrl) setGeneratedLabelUrl(fetched.shippingLabelUrl);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError('Order could not be loaded. Check your connection and try again.');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const isSeller = currentUser?.id === order?.sellerId;
  const normalised = normaliseOrderStatus(order?.status ?? '');

  // Dispatch eligibility comes from the canonical capability resolver,
  // never from a local `status === 'paid'` check.
  const capabilities = useMemo(() => {
    if (!order) return null;
    return resolveCapabilities({
      status: order.status,
      role: isSeller ? 'seller' : 'buyer',
      hasOpenResolution: false,
      hasReview: false,
      hasTracking: Boolean(order.trackingNumber),
      fulfilmentSnapshot: order.fulfilmentSnapshot ?? null,
    });
  }, [order, isSeller]);
  const canDispatch = capabilities?.canDispatch ?? false;

  // Determine shipping mode from the immutable fulfilment snapshot.
  // Integrated = buyer purchased a carrier-managed service (label/QR available).
  // Manual = buyer paid for postage but seller arranges their own tracked service.
  const snapshot: FulfilmentSnapshot | null = order?.fulfilmentSnapshot ?? null;
  const deliveryMode: 'integrated' | 'manual' | 'local' | 'unknown' =
    snapshot?.deliveryMode ?? 'unknown';
  const isIntegrated = deliveryMode === 'integrated';
  const isManualMode = deliveryMode === 'manual' || (!isIntegrated && deliveryMode === 'unknown');

  const shipByDate = order ? getShipByDate(order) : null;
  const shipByLabel = formatShipByDate(shipByDate);
  const shipByDaysLeft = daysUntil(shipByDate);
  const shipByUrgent = shipByDaysLeft != null && shipByDaysLeft <= 1;
  const shipByOverdue = shipByDaysLeft != null && shipByDaysLeft < 0;

  const serviceName = snapshot?.serviceName ?? snapshot?.carrierId ?? order?.shippingProvider ?? null;
  const etaWindow = snapshot?.etaMinDays != null && snapshot?.etaMaxDays != null
    ? (snapshot.etaMinDays !== snapshot.etaMaxDays
        ? `${snapshot.etaMinDays}–${snapshot.etaMaxDays} days`
        : `${snapshot.etaMinDays} day${snapshot.etaMinDays === 1 ? '' : 's'}`)
    : null;

  // --- Dispatch handlers ---

  const handleGenerateLabel = useCallback(async () => {
    if (isGeneratingLabel) return;
    setIsGeneratingLabel(true);
    setLabelError(null);
    haptics.tap();
    try {
      const carrier = (snapshot?.carrierId ?? shippingProvider) || 'Royal Mail';
      const res = await fetchJson<{ shippingLabelUrl?: string; trackingNumber?: string }>(
        `/orders/${orderId}/shipping-label`,
        { method: 'POST', body: JSON.stringify({ carrier }) }
      );
      if (!isMountedRef.current) return;
      if (res.shippingLabelUrl) {
        setGeneratedLabelUrl(res.shippingLabelUrl);
        show('Shipping label ready. Show the QR code at drop-off.', 'success');
      }
      if (res.trackingNumber && !trackingNumber) {
        setTrackingNumber(res.trackingNumber);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      // Typed error classification via provider registry — no free-text matching.
      const errorCode = classifyShippingError(error);
      setLabelError(SHIPPING_ERROR_RECOVERY[errorCode]);
    } finally {
      if (isMountedRef.current) setIsGeneratingLabel(false);
    }
  }, [isGeneratingLabel, orderId, snapshot, shippingProvider, trackingNumber, show]);

  const handleShowQR = useCallback(() => {
    if (!generatedLabelUrl) return;
    haptics.tap();
    navigation.navigate('ChatMediaPreview', {
      mediaUri: generatedLabelUrl,
      mediaType: 'image',
      senderLabel: 'Shipping label / QR code',
    });
  }, [generatedLabelUrl, navigation]);

  const handlePrintLabel = useCallback(async () => {
    if (!generatedLabelUrl) return;
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(generatedLabelUrl);
      if (!supported) {
        show('Unable to open label for printing', 'error');
        return;
      }
      await Linking.openURL(generatedLabelUrl);
    } catch {
      show('Unable to open label for printing', 'error');
    }
  }, [generatedLabelUrl, show]);

  const handleFindDropOff = useCallback(() => {
    const carrierId = snapshot?.carrierId ?? shippingProvider ?? null;
    const url = getDropOffUrl(carrierId);
    if (!url) {
      show('Drop-off finder not available for this carrier. Check the carrier\'s website.', 'info');
      return;
    }
    haptics.tap();
    void Linking.openURL(url).catch(() => {
      show('Unable to open drop-off finder', 'error');
    });
  }, [snapshot, shippingProvider, show]);

  const handleMessageBuyer = useCallback(() => {
    if (!order) return;
    haptics.tap();
    navigation.navigate('Chat', {
      conversationId: `${order.buyerId}_${order.listingId}`,
      partnerUserId: order.buyerId,
      itemId: order.listingId,
    });
  }, [order, navigation]);

  // Manual dispatch: seller enters tracking and confirms.
  const handleManualDispatch = useCallback(async () => {
    if (!canDispatch || isDispatching) return;
    const tn = trackingNumber.trim();
    const carrier = shippingProvider.trim();
    if (!tn) {
      show('Enter a tracking number to confirm dispatch', 'info');
      return;
    }
    if (!carrier) {
      show('Select a carrier to confirm dispatch', 'info');
      return;
    }
    setIsDispatching(true);
    haptics.heavyPress();
    try {
      await shipOrder(orderId, {
        trackingNumber: tn,
        shippingProvider: carrier,
      });
      show('Item dispatched. The buyer will be notified.', 'success');
      navigation.goBack();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsDispatching(false);
    }
  }, [canDispatch, isDispatching, orderId, trackingNumber, shippingProvider, show, navigation]);

  // Integrated shipping: the carrier's first scan is authoritative.
  // The seller does NOT confirm dispatch — the scan webhook advances state.
  // This is a recovery action for when the seller has dropped off the parcel
  // but the carrier scan hasn't appeared after a reasonable delay.
  // It does NOT mutate the canonical order status — it only records the
  // seller's handoff claim for reconciliation purposes.
  const handleDroppedOffRecovery = useCallback(async () => {
    if (isDispatching) return;
    setIsDispatching(true);
    haptics.heavyPress();
    try {
      await assertHandoff(orderId, {
        trackingNumber: trackingNumber.trim() || undefined,
        shippingProvider: serviceName ?? undefined,
        labelUrl: generatedLabelUrl ?? undefined,
      });
      show('Handoff recorded. Waiting for carrier scan to confirm tracking.', 'success');
      navigation.goBack();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsDispatching(false);
    }
  }, [canDispatch, isDispatching, orderId, trackingNumber, serviceName, show, navigation]);

  // --- Loading / error / permission states ---

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  if (loadError || !order) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="error"
          icon="cloud-offline-outline"
          title="Order could not be loaded"
          actionLabel="Retry"
          onAction={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }}
        />
      </FlagshipScreen>
    );
  }

  if (!isSeller) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="empty"
          icon="lock-closed-outline"
          title="Only the seller can dispatch this order"
        />
      </FlagshipScreen>
    );
  }

  const shortOrderId = order.id.slice(0, 8).toUpperCase();
  const statusLabel = humaniseStatus(order.status);
  const itemPrice = formatFromFiat(order.totalGbp, 'GBP', { displayMode: 'fiat' });

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Ship this order" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
      >
        {/* ─── 1. Ship-by deadline headline ─── */}
        <View style={[
            styles.deadlineHeader,
            shipByOverdue
              ? { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }
              : shipByUrgent
                ? { backgroundColor: `${colors.warning}10`, borderColor: `${colors.warning}30` }
                : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
            <View style={styles.deadlineText}>
              <Text style={[
                styles.deadlineDate,
                { color: shipByOverdue ? colors.danger : shipByUrgent ? colors.warning : colors.textPrimary },
              ]}>
                {shipByLabel
                  ? shipByOverdue
                    ? `Past dispatch deadline · ${shipByLabel}`
                    : shipByUrgent
                      ? `Ship by ${shipByLabel}`
                      : `Ship by ${shipByLabel}`
                  : 'Dispatch deadline unavailable'}
              </Text>
              {shipByDaysLeft != null && !shipByOverdue && (
                <Text style={styles.deadlineSub}>
                  {shipByDaysLeft === 0
                    ? 'Dispatch today to stay within policy'
                    : shipByDaysLeft === 1
                      ? '1 day left to dispatch'
                      : `${shipByDaysLeft} days left to dispatch`}
                </Text>
              )}
              {shipByOverdue && (
                <Text style={styles.deadlineSub}>
                  Dispatch immediately or the buyer may cancel.
                </Text>
              )}
            </View>
          </View>

        {/* ─── 2. Item summary ─── */}
        <View style={styles.itemRow}>
            {order.listingImageUrl ? (
              <CachedImage uri={order.listingImageUrl} style={styles.itemImage} contentFit="cover" />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <Ionicons name="image-outline" size={22} color={colors.textMuted} aria-hidden={true} />
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle} numberOfLines={2}>{order.listingTitle || 'Ordered item'}</Text>
              <Text style={styles.itemMeta}>ORDER #{shortOrderId} · {statusLabel}</Text>
              <Text style={styles.itemPrice}>{itemPrice}</Text>
            </View>
        </View>

        {/* ─── 3. Buyer-selected service (immutable snapshot) ─── */}
        {serviceName ? (
          <View style={styles.serviceCard}>
            <Text style={styles.serviceName}>{serviceName}</Text>
              <View style={styles.serviceMetaRow}>
                {etaWindow && (
                  <View style={styles.serviceMetaItem}>
                    <Ionicons name="time-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                    <Text style={styles.serviceMetaText}>ETA {etaWindow}</Text>
                  </View>
                )}
                {snapshot?.trackingIncluded && (
                  <View style={styles.serviceMetaItem}>
                    <Ionicons name="location-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                    <Text style={styles.serviceMetaText}>Tracked</Text>
                  </View>
                )}
                {isIntegrated && (
                  <View style={styles.serviceMetaItem}>
                    <Ionicons name="qr-code-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                    <Text style={styles.serviceMetaText}>Label included</Text>
                  </View>
                )}
              </View>
              {snapshot?.destinationSummary && (
                <Text style={styles.destinationText}>To: {snapshot.destinationSummary}</Text>
              )}
            </View>
        ) : null}

        {/* ─── 4. Escrow narrative ─── */}
        {(() => {
            const isHeld = normalised === 'paid' || normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery';
            if (!isHeld) return null;
            // Escrow release timing is server-derived, not client-invented.
            // If the server provides an estimatedReleaseAt, show it.
            // If not, show no countdown — do not invent a 14-day fallback.
            const releaseAt = (order as any)?.moneyProjection?.estimatedReleaseAt;
            const releaseTime = releaseAt ? new Date(releaseAt).getTime() : null;
            const now = Date.now();
            const daysLeft = releaseTime && !Number.isNaN(releaseTime)
              ? Math.ceil((releaseTime - now) / (24 * 60 * 60 * 1000))
              : null;
            return (
              <View style={styles.escrowBanner}>
                <Ionicons name="lock-closed" size={16} color={colors.success} aria-hidden={true} />
                <View style={styles.escrowTextWrap}>
                  <Text style={styles.escrowTitle}>Funds held in escrow</Text>
                  <Text style={styles.escrowSub}>
                    {normalised === 'paid'
                      ? 'Buyer\'s payment is safely held. Dispatch your item to start the release process.'
                      : 'Buyer\'s payment is held until they confirm receipt.'}
                  </Text>
                  {daysLeft != null && daysLeft > 0 && (
                    <Text style={styles.escrowCountdown}>
                      Auto-releases to you in {daysLeft} day{daysLeft === 1 ? '' : 's'} if the buyer doesn't act
                    </Text>
                  )}
                </View>
              </View>
            );
          })()}

        <View style={styles.sectionDivider} />

        {/* ─── 5. Integrated shipping: label / QR / drop-off ─── */}
        {isIntegrated && canDispatch && (
          <>
            <Text style={styles.sectionLabel}>Dispatch steps</Text>

            {/* Step 1: Get label */}
            <View style={styles.stepRow}>
              <View style={[styles.stepNumber, generatedLabelUrl && styles.stepNumberDone]}>
                {generatedLabelUrl ? (
                  <Ionicons name="checkmark" size={12} color={colors.success} aria-hidden={true} />
                ) : (
                  <Text style={[styles.stepNumberText, generatedLabelUrl && styles.stepNumberTextDone]}>
                    {'1'}
                  </Text>
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {generatedLabelUrl ? 'Shipping label ready' : 'Get your shipping label'}
                </Text>
                <Text style={styles.stepSub}>
                  {generatedLabelUrl
                    ? 'Show the QR code at drop-off or print the label.'
                    : 'Generate a pre-paid label for the buyer-selected service.'}
                </Text>
              </View>
            </View>

            {!generatedLabelUrl && (
              <Pressable
                style={[styles.primaryStepBtn, isGeneratingLabel && styles.primaryStepBtnDisabled]}
                onPress={handleGenerateLabel}
                disabled={isGeneratingLabel}
                accessibilityRole="button"
                accessibilityLabel="Generate shipping label"
              >
                {isGeneratingLabel ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={22} color={colors.brand} aria-hidden={true} />
                    <Text style={styles.primaryStepBtnText}>Get shipping label</Text>
                  </>
                )}
              </Pressable>
            )}

            {labelError && !generatedLabelUrl && (
              <View style={styles.labelErrorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
                <Text style={styles.labelErrorText}>{labelError}</Text>
              </View>
            )}

            {/* Step 2: Drop-off */}
            {generatedLabelUrl && (
              <>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Drop off the parcel</Text>
                    <Text style={styles.stepSub}>
                      Take the parcel to a {serviceName ?? 'carrier'} drop-off point. Show the QR code or attach the printed label.
                    </Text>
                  </View>
                </View>

                <View style={styles.secondaryActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handleShowQR}
                    accessibilityRole="button"
                    accessibilityLabel="Show drop-off QR code"
                  >
                    <Ionicons name="qr-code-outline" size={22} color={colors.brand} aria-hidden={true} />
                    <Text style={styles.secondaryBtnText}>Show QR code</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handlePrintLabel}
                    accessibilityRole="button"
                    accessibilityLabel="Print shipping label"
                  >
                    <Ionicons name="print-outline" size={22} color={colors.textPrimary} aria-hidden={true} />
                    <Text style={styles.secondaryBtnTextDark}>Print label</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handleFindDropOff}
                    accessibilityRole="button"
                    accessibilityLabel="Find nearest drop-off point"
                  >
                    <Ionicons name="location-outline" size={22} color={colors.textPrimary} aria-hidden={true} />
                    <Text style={styles.secondaryBtnTextDark}>Find drop-off</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handleMessageBuyer}
                    accessibilityRole="button"
                    accessibilityLabel="Message the buyer"
                  >
                    <Ionicons name="chatbubble-outline" size={22} color={colors.textPrimary} aria-hidden={true} />
                    <Text style={styles.secondaryBtnTextDark}>Message buyer</Text>
                  </Pressable>
                </View>

                <Text style={styles.waitingStateLabel}>Waiting for carrier scan</Text>
                <Text style={styles.autoScanHint}>
                  The carrier's first scan will automatically update the order to "in transit". You don't need to mark it shipped manually.
                </Text>
              </>
            )}
          </>
        )}

        {/* ─── 6. Manual shipping: tracking input ─── */}
        {isManualMode && canDispatch && (
          <>
            <Text style={styles.sectionLabel}>Arrange shipping</Text>
            <Text style={styles.manualIntro}>
              The buyer paid for tracked shipping. Arrange a tracked service, enter the details below, then confirm dispatch.
            </Text>

            <Text style={styles.inputLabel}>Carrier</Text>
            <Pressable
              style={styles.carrierSelector}
              onPress={() => { haptics.tap(); setShowCarrierDropdown(!showCarrierDropdown); }}
              accessibilityRole="button"
              accessibilityLabel="Select carrier"
            >
              <Text style={[styles.carrierSelectorText, !shippingProvider && styles.placeholderText]}>
                {shippingProvider || 'Select carrier'}
              </Text>
              <Ionicons name={showCarrierDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>

            {showCarrierDropdown && (
              <View style={styles.carrierDropdown}>
                {MANUAL_CARRIERS.map((carrier) => (
                  <Pressable
                    key={carrier}
                    style={styles.carrierOption}
                    onPress={() => {
                      haptics.selection();
                      setShippingProvider(carrier);
                      setShowCarrierDropdown(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${carrier}`}
                  >
                    <Text style={[
                      styles.carrierOptionText,
                      shippingProvider === carrier && styles.carrierOptionTextActive,
                    ]}>
                      {carrier}
                    </Text>
                    {shippingProvider === carrier && (
                      <Ionicons name="checkmark" size={16} color={colors.brand} aria-hidden={true} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.inputLabel}>Tracking number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter tracking number"
              placeholderTextColor={colors.textMuted}
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Tracking number"
            />

            <Text style={styles.hintText}>
              A valid tracking number is required to confirm dispatch. The buyer will receive it automatically.
            </Text>
          </>
        )}

        {/* ─── 7. Cannot dispatch ─── */}
        {!canDispatch && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
            <Text style={styles.warningText}>
              This order cannot be dispatched from its current status ({statusLabel}).
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ─── Footer: manual dispatch (integrated shipping has no manual confirm) ─── */}
      {canDispatch && !isIntegrated && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
          <Pressable
            style={[styles.dispatchBtn, isDispatching && styles.dispatchBtnDisabled]}
            onPress={() => {
              Alert.alert(
                'Confirm dispatch?',
                trackingNumber.trim()
                  ? `The order will be dispatched with ${shippingProvider} tracking number ${trackingNumber.trim()}. The buyer will be notified.`
                  : 'Enter a tracking number and carrier to confirm dispatch.',
                [
                  { text: 'Not yet', style: 'cancel' },
                  ...(trackingNumber.trim() && shippingProvider.trim()
                    ? [{ text: 'Confirm dispatch', style: 'default' as const, onPress: handleManualDispatch }]
                    : []),
                ]
              );
            }}
            disabled={isDispatching}
            accessibilityRole="button"
            accessibilityLabel="Add tracking and confirm dispatch"
          >
            {isDispatching ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.dispatchBtnText}>Add tracking & confirm dispatch</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* ─── Footer: integrated recovery (only after label is generated) ─── */}
      {canDispatch && isIntegrated && generatedLabelUrl && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
          <Text style={styles.recoveryStateLabel}>Still no carrier scan</Text>
          <Pressable
            style={[styles.recoveryBtn, isDispatching && styles.dispatchBtnDisabled]}
            onPress={() => {
              Alert.alert(
                'Still no carrier scan?',
                'If you\'ve handed the parcel to the carrier but tracking hasn\'t updated yet, mark it as handed over. The carrier scan will confirm tracking automatically. You can also check the label, contact the carrier, or report a drop-off issue.',
                [
                  { text: 'Not yet', style: 'cancel' },
                  { text: 'I dropped it off', style: 'default', onPress: handleDroppedOffRecovery },
                ]
              );
            }}
            disabled={isDispatching}
            accessibilityRole="button"
            accessibilityLabel="Still no carrier scan — mark as dropped off"
          >
            {isDispatching ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <>
                <Ionicons name="help-circle-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
                <Text style={styles.recoveryBtnText}>I dropped it off but tracking hasn't updated</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
    },
    // ─── Deadline header ───
    deadlineHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
    },
    deadlineText: {
      flex: 1,
      gap: 2,
    },
    deadlineDate: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
    },
    deadlineSub: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
    },
    // ─── Item row ───
    itemRow: {
      flexDirection: 'row',
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    itemImage: {
      width: Space.xl * 2,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.sm,
    },
    itemImagePlaceholder: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemInfo: {
      flex: 1,
      gap: Space.xs / 2,
      justifyContent: 'center',
    },
    itemTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      lineHeight: Type.bodyStrong.size + 5,
    },
    itemMeta: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    itemPrice: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      marginTop: 2,
    },
    // ─── Service card ───
    serviceCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
      marginBottom: Space.sm,
    },
    serviceName: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      marginBottom: Space.xs,
    },
    serviceMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    serviceMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
    },
    serviceMetaText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    destinationText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
    },
    // ─── Escrow ───
    escrowBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 2,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.lg,
      backgroundColor: `${colors.success}08`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.success}25`,
      marginBottom: Space.sm,
    },
    escrowTextWrap: {
      flex: 1,
      gap: Space.xs / 2,
    },
    escrowTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    escrowSub: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
    },
    escrowCountdown: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      marginTop: Space.xs / 2,
    },
    // ─── Sections ───
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.sm,
    },
    sectionLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      marginBottom: Space.sm,
    },
    // ─── Steps (integrated) ───
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      marginBottom: Space.sm,
    },
    stepNumber: {
      width: Space.lg + 4,
      height: Space.lg + 4,
      borderRadius: Radius.full,
      backgroundColor: `${colors.brand}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberDone: {
      backgroundColor: `${colors.success}20`,
    },
    stepNumberText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.bold,
      color: colors.brand,
    },
    stepNumberTextDone: {
      color: colors.success,
    },
    stepContent: {
      flex: 1,
      gap: 2,
    },
    stepTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    stepSub: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
    },
    primaryStepBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.brand,
      backgroundColor: `${colors.brand}08`,
      marginBottom: Space.sm,
    },
    primaryStepBtnDisabled: {
      opacity: 0.6,
    },
    primaryStepBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    labelErrorBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      padding: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: `${colors.danger}08`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.danger}20`,
      marginBottom: Space.sm,
    },
    labelErrorText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.danger,
      lineHeight: Type.caption.size + 4,
    },
    secondaryActions: {
      gap: Space.xs,
      marginBottom: Space.sm,
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      minHeight: Control.hit,
    },
    secondaryBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    secondaryBtnTextDark: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    autoScanHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: Type.caption.size + 4,
      marginTop: Space.xs,
    },
    waitingStateLabel: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginTop: Space.sm,
    },
    // ─── Manual shipping ───
    manualIntro: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
      marginBottom: Space.sm,
    },
    inputLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      marginBottom: Space.xs + 2,
      marginTop: Space.sm,
    },
    carrierSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: Space.xl + Space.xl - 4,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      minHeight: Space.xl + Space.xl - 4,
    },
    carrierSelectorText: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    placeholderText: {
      color: colors.textMuted,
    },
    carrierDropdown: {
      marginTop: Space.xs,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    carrierOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: Control.hit,
    },
    carrierOptionText: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
    },
    carrierOptionTextActive: {
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
    },
    textInput: {
      paddingHorizontal: Space.md,
      height: Space.xl + Space.xl - 4,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
      minHeight: Space.xl + Space.xl - 4,
    },
    hintText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
      lineHeight: Type.caption.size + 5,
    },
    // ─── Warning ───
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      marginTop: Space.md,
      padding: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.surface,
    },
    warningText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.danger,
    },
    // ─── Footer ───
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    dispatchBtn: {
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit + Space.sm,
    },
    dispatchBtnDisabled: {
      opacity: 0.6,
    },
    dispatchBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textInverse,
    },
    recoveryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      minHeight: Control.hit,
    },
    recoveryBtnText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    recoveryStateLabel: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: Space.sm,
      textAlign: 'center',
    },
  });
}
