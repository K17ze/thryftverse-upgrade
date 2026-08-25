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
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
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
  type ShippingProviderErrorCode,
} from '../services/shippingProviderRegistry';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { haptics } from '../utils/haptics';
import { t } from '../i18n';


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
  const [labelErrorCode, setLabelErrorCode] = useState<ShippingProviderErrorCode | null>(null);

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
  const labelGenerationUnavailable =
    isIntegrated && labelErrorCode === 'LABEL_GENERATION_UNAVAILABLE' && !generatedLabelUrl;

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
    setLabelErrorCode(null);
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
      setLabelErrorCode(errorCode);
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

  // ─── Manual shipping form (rendered as primary content in manual mode,
  //     and as the fallback path when integrated label generation is
  //     unavailable). Extracted so both branches share one authored block. ───
  const renderManualForm = () => (
    <>
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
  );

  // ─── Escrow footnote: quiet, single line, only when the server provides an
  //     evidenced estimatedReleaseAt. No invented countdown, no decorative
  //     panel, no "safely held" narrative. ───
  const escrowFootnote = (() => {
    const isHeld =
      normalised === 'paid' ||
      normalised === 'shipped' ||
      normalised === 'in transit' ||
      normalised === 'out for delivery';
    if (!isHeld) return null;
    const releaseAt = (order as any)?.moneyProjection?.estimatedReleaseAt;
    const releaseTime = releaseAt ? new Date(releaseAt).getTime() : null;
    if (!releaseTime || Number.isNaN(releaseTime)) return null;
    const daysLeft = Math.ceil((releaseTime - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysLeft == null || daysLeft <= 0) return null;
    return `Funds held in escrow · Auto-releases in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  })();

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={`Order #${shortOrderId}`} onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
      >
        {/* ─── A. Item-dominant header ───
            Merges the former deadline panel, item row, and service card into
            one authored composition. The item image is the visual anchor; the
            ship-by urgency colour applies to the "Ship by" text only, not a
            full panel background. No separate deadline panel, no separate
            service card. */}
        <View style={styles.itemHeader}>
          {order.listingImageUrl ? (
            <CachedImage uri={order.listingImageUrl} style={styles.itemImage} contentFit="cover" />
          ) : (
            <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
              <Ionicons name="image-outline" size={24} color={colors.textMuted} aria-hidden={true} />
            </View>
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {order.listingTitle || 'Ordered item'}
            </Text>
            <Text
              style={[
                styles.shipByLine,
                {
                  color: shipByOverdue
                    ? colors.danger
                    : shipByUrgent
                      ? colors.warning
                      : colors.textSecondary,
                },
              ]}
            >
              {shipByLabel
                ? shipByOverdue
                  ? `Past deadline · ${shipByLabel}`
                  : `Ship by ${shipByLabel}${shipByDaysLeft != null && shipByDaysLeft >= 0
                    ? ` · ${shipByDaysLeft === 0 ? 'today' : `${shipByDaysLeft} day${shipByDaysLeft === 1 ? '' : 's'} left`}`
                    : ''}`
                : 'Dispatch deadline unavailable'}
            </Text>
            {serviceName && (
              <Text style={styles.serviceLine} numberOfLines={1}>
                {serviceName}
                {snapshot?.trackingIncluded ? ' · Tracked' : ''}
                {etaWindow ? ` · ETA ${etaWindow}` : ''}
              </Text>
            )}
          </View>
        </View>

        {/* ─── D. Escrow footnote ─── */}
        {escrowFootnote && <Text style={styles.escrowFootnote}>{escrowFootnote}</Text>}

        {/* ─── B. One next action ───
            Only the current next action is shown. Completed steps are
            replaced, not retained as "done" cards. */}
        {!canDispatch ? (
          /* ─── Cannot dispatch ─── */
          <View style={styles.warningInline}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
            <Text style={styles.warningText}>
              This order cannot be dispatched from its current status ({statusLabel}).
            </Text>
          </View>
        ) : isIntegrated && !labelGenerationUnavailable ? (
          /* ─── Integrated shipping ─── */
          generatedLabelUrl ? (
            /* Label ready — REPLACES the get-label button with QR/drop-off
               state. No "Step 1: done" card above. */
            <View style={styles.actionSection}>
              <Pressable
                style={styles.qrPreview}
                onPress={handleShowQR}
                accessibilityRole="button"
                accessibilityLabel="Show shipping label QR code"
              >
                <Ionicons name="qr-code-outline" size={48} color={colors.brand} aria-hidden={true} />
                <Text style={styles.qrPreviewText}>Tap to view label / QR code</Text>
              </Pressable>

              <Text style={styles.dropOffLine}>
                Drop off by {shipByLabel ?? 'soon'}
              </Text>

              <Pressable
                style={styles.findLocationLink}
                onPress={handleFindDropOff}
                accessibilityRole="link"
                accessibilityLabel="Find a drop-off location"
              >
                <Text style={styles.findLocationText}>Find a drop-off location</Text>
              </Pressable>

              <Text style={styles.waitingLine}>Waiting for carrier scan</Text>
              <Text style={styles.waitingHint}>
                The carrier's first scan will update the order to "in transit" automatically.
              </Text>

              {/* ─── E. Recovery — quiet text link, no footer panel, no
                   Alert.alert. The handoff assertion is visibly labelled as
                   the seller's claim; carrier truth remains the scan. ─── */}
              <Pressable
                style={styles.recoveryLink}
                onPress={handleDroppedOffRecovery}
                disabled={isDispatching}
                accessibilityRole="button"
                accessibilityLabel="Mark as dropped off — handoff assertion"
              >
                {isDispatching ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={styles.recoveryLinkText}>
                    I dropped it off but tracking hasn't updated
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            /* No label yet — one dominant action. */
            <View style={styles.actionSection}>
              <Text style={styles.actionContext}>Pack the item</Text>
              <Pressable
                style={[styles.dominantBtn, isGeneratingLabel && styles.dominantBtnDisabled]}
                onPress={handleGenerateLabel}
                disabled={isGeneratingLabel}
                accessibilityRole="button"
                accessibilityLabel="Get shipping label"
              >
                {isGeneratingLabel ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.dominantBtnText}>Get shipping label</Text>
                )}
              </Pressable>

              {/* Label errors stay attached to the label action with retry. */}
              {labelError && (
                <View style={styles.labelErrorInline}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
                  <Text style={styles.labelErrorText}>{labelError}</Text>
                </View>
              )}
            </View>
          )
        ) : (
          /* ─── Manual mode OR label generation unavailable ───
              The carrier picker + tracking input is the primary content, not
              a secondary section. When label generation is unavailable, the
              error is shown above the manual form as the alternative path. */
          <View style={styles.actionSection}>
            {labelGenerationUnavailable && labelError && (
              <View style={styles.labelErrorInline}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
                <Text style={styles.labelErrorText}>{labelError}</Text>
              </View>
            )}
            {labelGenerationUnavailable && (
              <Text style={styles.manualAltHint}>
                Integrated label unavailable. Arrange a tracked service below.
              </Text>
            )}
            {renderManualForm()}
          </View>
        )}
      </ScrollView>

      {/* ─── F. Footer: manual dispatch confirm ───
          Integrated shipping has no manual confirm button (the carrier scan
          advances state). The button says "Confirm dispatch" — the tracking
          input is already visible above. */}
      {canDispatch && (!isIntegrated || labelGenerationUnavailable) && (
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
            accessibilityLabel="Confirm dispatch"
          >
            {isDispatching ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.dispatchBtnText}>Confirm dispatch</Text>
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
      paddingTop: Space.md,
    },
    // ─── A. Item-dominant header ───
    itemHeader: {
      flexDirection: 'row',
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    itemImage: {
      width: 64,
      height: 64,
      borderRadius: Radius.md,
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
      fontSize: Type.itemTitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      lineHeight: Type.itemTitle.lineHeight,
    },
    shipByLine: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.medium,
      lineHeight: Type.captionElevated.lineHeight,
    },
    serviceLine: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: Type.caption.lineHeight,
    },
    // ─── D. Escrow footnote ───
    escrowFootnote: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
      marginBottom: Space.lg,
    },
    // ─── B. One next action ───
    actionSection: {
      marginTop: Space.md,
      gap: Space.sm,
    },
    actionContext: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: Space.xs,
    },
    // Dominant button — the single next action
    dominantBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      minHeight: Control.hit + Space.sm,
    },
    dominantBtnDisabled: {
      opacity: 0.6,
    },
    dominantBtnText: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.bold,
      color: colors.textInverse,
    },
    // Label error — attached to the label action, not a separate banner
    labelErrorInline: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      paddingVertical: Space.xs + 2,
    },
    labelErrorText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.danger,
      lineHeight: Type.caption.size + 4,
    },
    manualAltHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
      marginBottom: Space.xs,
    },
    // QR / label preview (replaces the get-label button)
    qrPreview: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.lg,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      minHeight: Control.hit + Space.lg,
    },
    qrPreviewText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    dropOffLine: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    findLocationLink: {
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    findLocationText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    waitingLine: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginTop: Space.xs,
    },
    waitingHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: Type.caption.size + 4,
    },
    // Recovery — quiet text link, not a footer panel
    recoveryLink: {
      minHeight: Control.hit,
      justifyContent: 'center',
      marginTop: Space.xs,
    },
    recoveryLinkText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
    // ─── Manual shipping form ───
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
      height: Control.hit,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
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
      height: Control.hit,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    hintText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
      lineHeight: Type.caption.size + 5,
    },
    // ─── Warning (cannot dispatch) ───
    warningInline: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 2,
      marginTop: Space.md,
      paddingVertical: Space.sm,
    },
    warningText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.danger,
      lineHeight: Type.caption.size + 4,
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
  });
}
