import { Typography } from '../theme/designTokens';
import React from 'react';
import {
  AnimatedPressable,
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { Space, Radius } from '../theme/designTokens';
import {
  CommerceOrder,
  OrderParcelEvent,
  getOrder,
  getOrderParcelEvents,
  cancelOrder,
  shipOrder,
  deliverOrder,
  refundOrder,
} from '../services/commerceApi';
import { calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import { parseApiError } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Body, Caption, Meta, Headline } from '../components/ui/Text';
import { haptics } from '../utils/haptics';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'OrderDetail'>;

type TrackingStep = {
  id: string;
  label: string;
  subtitle: string;
  date?: string;
  done: boolean;
  active?: boolean;
};


const STATUS_PANEL_BG = Colors.surfaceAlt;
const STATUS_PANEL_BORDER = Colors.border;

type OrderStatus = 'created' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

function normalizeOrderStatus(status?: string): OrderStatus {
  if (status === 'created' || status === 'paid' || status === 'shipped' || status === 'delivered' || status === 'cancelled') {
    return status;
  }

  return 'created';
}

function formatTimelineDate(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getParcelEventDisplay(
  eventType: OrderParcelEvent['eventType'],
  sellerUsername: string
): { label: string; subtitle: string } {
  if (eventType === 'picked_up') {
    return {
      label: 'Picked up',
      subtitle: 'Carrier has collected your parcel from the seller.',
    };
  }

  if (eventType === 'in_transit') {
    return {
      label: 'In transit',
      subtitle: 'Your parcel is moving through the carrier network.',
    };
  }

  if (eventType === 'out_for_delivery') {
    return {
      label: 'Out for delivery',
      subtitle: 'Your parcel is out for delivery today.',
    };
  }

  if (eventType === 'delivered' || eventType === 'collection_confirmed') {
    return {
      label: 'Delivered',
      subtitle: 'Delivery confirmed. You can now leave a review.',
    };
  }

  if (eventType === 'delivery_failed') {
    return {
      label: 'Delivery failed',
      subtitle: 'Carrier attempted delivery but could not complete it.',
    };
  }

  return {
    label: 'Returned to sender',
    subtitle: `${sellerUsername}'s parcel is being returned by the carrier.`,
  };
}

function buildTrackingSteps(
  status: OrderStatus,
  sellerUsername: string,
  order: CommerceOrder | null,
  parcelEvents: OrderParcelEvent[]
): TrackingStep[] {
  if (status === 'cancelled') {
    return [
      {
        id: 'cancelled',
        label: 'Order cancelled',
        subtitle: 'This order was cancelled and no further delivery updates will be shown.',
        done: false,
        active: true,
      },
    ];
  }

  const steps: TrackingStep[] = [
    {
      id: 'order_confirmed',
      label: 'Order confirmed',
      subtitle: 'Payment received. Seller has been notified.',
      date: formatTimelineDate(order?.createdAt),
      done: status !== 'created',
      active: status === 'created',
    },
    {
      id: 'seller_preparing',
      label: 'Seller preparing',
      subtitle: `${sellerUsername} is packing your order.`,
      date: formatTimelineDate(status !== 'created' ? order?.updatedAt : null),
      done: status === 'shipped' || status === 'delivered',
      active: status === 'paid',
    },
  ];

  if (parcelEvents.length > 0) {
    for (const event of parcelEvents) {
      const display = getParcelEventDisplay(event.eventType, sellerUsername);
      steps.push({
        id: `carrier_${event.id}`,
        label: display.label,
        subtitle: display.subtitle,
        date: formatTimelineDate(event.occurredAt ?? event.receivedAt),
        done: true,
      });
    }

    if (status === 'shipped' && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      steps[steps.length - 1] = {
        ...lastStep,
        done: false,
        active: true,
      };
    }
  } else if (status === 'shipped' || status === 'delivered') {
    steps.push({
      id: 'in_transit_fallback',
      label: 'In transit',
      subtitle: 'Your parcel is on the way.',
      date: formatTimelineDate(order?.shippedAt ?? order?.updatedAt),
      done: status === 'delivered',
      active: status === 'shipped',
    });
  }

  const hasDeliveredStep = steps.some((step) => step.label === 'Delivered');
  if (status === 'delivered' && !hasDeliveredStep) {
    steps.push({
      id: 'delivered_fallback',
      label: 'Delivered',
      subtitle: 'Delivery marked complete. You can now leave a review.',
      date: formatTimelineDate(order?.deliveredAt ?? order?.updatedAt),
      done: true,
    });
  }

  return steps;
}

function getStatusBanner(status: OrderStatus, sellerUsername: string) {
  if (status === 'created') {
    return {
      label: 'Awaiting payment',
      subtitle: 'Complete payment to confirm this order and notify the seller.',
    };
  }

  if (status === 'paid') {
    return {
      label: 'Seller preparing',
      subtitle: `${sellerUsername} is preparing your parcel for dispatch.`,
    };
  }

  if (status === 'delivered') {
    return {
      label: 'Delivered',
      subtitle: 'Delivery marked complete. You can now leave a review.',
    };
  }

  if (status === 'cancelled') {
    return {
      label: 'Cancelled',
      subtitle: 'This order has been cancelled.',
    };
  }

  return {
    label: 'In transit',
    subtitle: 'Your parcel is moving through the carrier network.',
  };
}

export default function OrderDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();
  const { orderId } = route.params;
  const [backendOrder, setBackendOrder] = React.useState<CommerceOrder | null>(null);
  const [parcelEvents, setParcelEvents] = React.useState<OrderParcelEvent[]>([]);
  const [isSyncingOrder, setIsSyncingOrder] = React.useState(false);
  const reducedMotionEnabled = useReducedMotion();
  const { show } = useToast();

  const syncOrder = React.useCallback(async () => {
    setIsSyncingOrder(true);
    try {
      const [order, events] = await Promise.all([
        getOrder(orderId),
        getOrderParcelEvents(orderId).catch(() => [] as OrderParcelEvent[]),
      ]);
      setBackendOrder(order);
      setParcelEvents(events);
    } catch {
      setBackendOrder(null);
      setParcelEvents([]);
    } finally {
      setIsSyncingOrder(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    void syncOrder();
    const refreshInterval = setInterval(() => {
      void syncOrder();
    }, 30_000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [syncOrder]);

  const listingId = backendOrder?.listingId;
  const existingListing = listingId ? listings.find((item) => item.id === listingId) : undefined;
  const listing = existingListing ?? {
    id: listingId ?? '',
    title: backendOrder?.listingTitle || 'Order details unavailable',
    brand: '',
    size: '',
    condition: '',
    price: backendOrder?.subtotalGbp ?? 0,
    priceWithProtection: backendOrder?.totalGbp ?? 0,
    images: backendOrder?.listingImageUrl ? [backendOrder.listingImageUrl] : [],
    likes: 0,
    sellerId: backendOrder?.sellerId ?? '',
    category: '',
    subcategory: '',
    description: '',
  };

  const orderStatus = normalizeOrderStatus(backendOrder?.status);

  const resolvedSeller = backendOrder?.seller ?? existingListing?.seller ?? {
    id: backendOrder?.sellerId ?? listing.sellerId ?? '',
    username: null,
    avatar: null,
    rating: null,
    reviewCount: null,
    location: null,
  };
  const sellerName = resolvedSeller.username ?? `Seller ${resolvedSeller.id.slice(0, 8)}`;

  const currentUser = useStore((state) => state.currentUser);
  const isBuyer = currentUser?.id === backendOrder?.buyerId;
  const isSeller = currentUser?.id === backendOrder?.sellerId;
  const canCancel = isBuyer && (orderStatus === 'paid' || orderStatus === 'created');
  const canShip = isSeller && orderStatus === 'paid';
  const canDeliver = isBuyer && orderStatus === 'shipped';
  const canRefund = isBuyer && (orderStatus === 'paid' || orderStatus === 'shipped');

  const subtotal = backendOrder?.subtotalGbp ?? listing.price;
  const platformCharge =
    backendOrder?.platformChargeGbp ??
    backendOrder?.buyerProtectionFeeGbp ??
    calculatePlatformChargeGbp(listing.price);
  const postageFee = backendOrder?.postageFeeGbp ?? 2.89;
  const totalPaid = backendOrder?.totalGbp ?? subtotal + platformCharge + postageFee;

  const trackingSteps = buildTrackingSteps(orderStatus, sellerName, backendOrder, parcelEvents);
  const statusBanner = getStatusBanner(orderStatus, sellerName);
  const latestParcelEvent = parcelEvents.length > 0 ? parcelEvents[parcelEvents.length - 1] : null;
  const shipmentLastUpdated = formatTimelineDate(
    latestParcelEvent?.occurredAt ?? latestParcelEvent?.receivedAt ?? backendOrder?.updatedAt
  );
  const showShipmentMeta = Boolean(
    backendOrder?.shippingProvider || backendOrder?.trackingNumber || backendOrder?.shippingLabelUrl || shipmentLastUpdated
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <ScreenHeader
        title="Order Details"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable onPress={() => navigation.navigate('HelpSupport')}>
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textPrimary} />
          </AnimatedPressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* -- Item Card -- */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(0)}>
        <ElevatedSurface variant="surface" style={styles.itemCard}>
        <AnimatedPressable
          onPress={() => { haptics.tap(); navigation.push('ItemDetail', { itemId: listing.id }); }}
          activeOpacity={0.88}
        >
          <SharedTransitionView
            style={styles.itemThumb}
            sharedTransitionTag={`image-${listing.id}-0`}
          >
            <CachedImage uri={getListingCoverUri(listing.images, '')} style={styles.itemThumbImage} contentFit="cover" />
          </SharedTransitionView>
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={2}>{listing.title}</Text>
            {listing.size || listing.condition ? (
              <Text style={styles.itemMeta}>{[listing.size, listing.condition].filter(Boolean).join(' - ')}</Text>
            ) : null}
            <Text style={styles.itemPrice}>{formatFromFiat(subtotal, 'GBP', { displayMode: 'fiat' })}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </AnimatedPressable>
        </ElevatedSurface>
        </Reanimated.View>

        {/* -- Status Banner -- */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(60)}>
        <ElevatedSurface variant="tint" style={styles.statusBanner}>
          <PremiumStatusPill
            tone={orderStatus === 'cancelled' ? 'error' : orderStatus === 'delivered' ? 'delivered' : orderStatus === 'paid' ? 'paid' : orderStatus === 'shipped' ? 'shipped' : 'pending'}
            label={statusBanner.label}
            icon="cube-outline"
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.statusSub}>{statusBanner.subtitle}</Text>
          </View>
        </ElevatedSurface>
        </Reanimated.View>
        {isSyncingOrder ? <Text style={styles.syncHint}>Syncing live order status...</Text> : null}

        {showShipmentMeta ? (
          <>
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(120)}>
            <Text style={styles.sectionTitle}>Shipment details</Text>
            <ElevatedSurface variant="surface" style={styles.shipmentMetaCard}>
              {backendOrder?.shippingProvider ? (
                <ShipmentMetaRow label="Carrier" value={backendOrder.shippingProvider} />
              ) : null}
              {backendOrder?.trackingNumber ? (
                <ShipmentMetaRow label="Tracking #" value={backendOrder.trackingNumber} />
              ) : null}
              {shipmentLastUpdated ? (
                <ShipmentMetaRow label="Last update" value={shipmentLastUpdated} />
              ) : null}

              {backendOrder?.shippingLabelUrl ? (
                <AppButton
                  title="Open shipping label"
                  icon={<Ionicons name="open-outline" size={16} color={Colors.brand} />}
                  style={styles.shipmentLinkBtn}
                  titleStyle={styles.shipmentLinkBtnText}
                  iconContainerStyle={styles.shipmentLinkIconWrap}
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    if (!backendOrder.shippingLabelUrl) {
                      return;
                    }

                    void Linking.openURL(backendOrder.shippingLabelUrl).catch(() => {
                      show('Unable to open shipping label URL', 'error');
                    });
                  }}
                  accessibilityLabel="Open shipping label"
                />
              ) : null}
            </ElevatedSurface>
            </Reanimated.View>
          </>
        ) : null}

        {/* -- Tracking Timeline -- */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(180)}>
        <Text style={styles.sectionTitle}>Tracking</Text>
        <ElevatedSurface variant="surface" style={styles.timelineCard}>
          {trackingSteps.map((step, index) => (
            <View key={step.id} style={styles.timelineRow}>
              {/* Left column: dot + line */}
              <View style={styles.timelineLeft}>
                <View style={[
                  styles.dot,
                  step.active && styles.dotActive,
                  !step.done && !step.active && styles.dotInactive,
                ]} />
                {index < trackingSteps.length - 1 && (
                  <View style={[styles.line, !step.done && styles.lineInactive]} />
                )}
              </View>
              {/* Right column: content */}
              <View style={styles.timelineContent}>
                <View style={styles.timelineTop}>
                  <Text style={[styles.stepLabel, !step.done && !step.active && styles.stepLabelInactive]}>
                    {step.label}
                  </Text>
                  {step.date && <Text style={styles.stepDate}>{step.date}</Text>}
                </View>
                <Text style={[styles.stepSub, !step.done && !step.active && styles.stepSubInactive]}>
                  {step.subtitle}
                </Text>
              </View>
            </View>
          ))}
        </ElevatedSurface>
        </Reanimated.View>

        {/* -- Seller Info -- */}
        {resolvedSeller.id && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(240)}>
          <Text style={styles.sectionTitle}>Seller</Text>
          <ElevatedSurface variant="surface" style={styles.sellerCard}>
            <AnimatedPressable
              style={styles.sellerIdentityTap}
              onPress={() => { haptics.tap(); navigation.navigate('UserProfile', { userId: resolvedSeller.id }); }}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={`Open @${sellerName} profile`}
              accessibilityHint="Shows seller profile details"
            >
              <CachedImage uri={resolvedSeller.avatar ?? ''} style={styles.sellerAvatar} contentFit="cover" />
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>@{sellerName}</Text>
                {(resolvedSeller as any).location && (
                  <Text style={styles.sellerLocation} numberOfLines={1}>{(resolvedSeller as any).location}</Text>
                )}
                {(resolvedSeller as any).rating != null && (resolvedSeller as any).reviewCount != null && (
                  <View style={styles.sellerMeta}>
                    <Ionicons name="star" size={13} color={Colors.brand} />
                    <Text style={styles.sellerRating}>{(resolvedSeller as any).rating} ({(resolvedSeller as any).reviewCount} reviews)</Text>
                  </View>
                )}
              </View>
            </AnimatedPressable>

            <AppButton
              title="Message"
              style={styles.msgBtn}
              titleStyle={styles.msgBtnText}
              variant="secondary"
              size="sm"
              onPress={() => navigation.navigate('Chat', {
                conversationId: `${resolvedSeller.id}_${listing.id}`,
                focusQuery: sellerName,
                partnerUserId: resolvedSeller.id,
              })}
              accessibilityLabel="Message seller"
              accessibilityHint="Opens conversation with this seller"
            />
          </ElevatedSurface>
          </Reanimated.View>
        )}

        {/* -- Transaction Info -- */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(300)}>
        <Text style={styles.sectionTitle}>Transaction</Text>
        <ElevatedSurface variant="surface" style={styles.txCard}>
          <TxRow label="Item price" value={formatFromFiat(subtotal, 'GBP', { displayMode: 'fiat' })} />
          <TxRow label="Platform charge" value={formatFromFiat(platformCharge, 'GBP', { displayMode: 'fiat' })} />
          <TxRow label="Postage" value={`from ${formatFromFiat(postageFee, 'GBP', { displayMode: 'fiat' })}`} />
          <View style={styles.txDivider} />
          <TxRow label="Total paid" value={formatFromFiat(totalPaid, 'GBP', { displayMode: 'fiat' })} bold />
        </ElevatedSurface>
        </Reanimated.View>

        {/* -- Actions -- */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(360)}>
        <ElevatedSurface variant="subtle" style={styles.actionsRow}>
          {canCancel && (
            <AppButton
              title="Cancel order"
              icon={<Ionicons name="close-circle-outline" size={18} color={Colors.danger} />}
              style={[styles.actionBtnSecondary, { borderColor: Colors.danger }]}
              titleStyle={[styles.actionBtnSecondaryText, { color: Colors.danger }]}
              iconContainerStyle={styles.actionSecondaryIconWrap}
              variant="secondary"
              size="md"
              onPress={async () => {
                try {
                  await cancelOrder(orderId);
                  show('Order cancelled', 'info');
                  void syncOrder();
                } catch (e) {
                  show(parseApiError(e).message, 'error');
                }
              }}
              accessibilityLabel="Cancel order"
            />
          )}
          {canShip && (
            <AppButton
              title="Mark shipped"
              icon={<Ionicons name="cube-outline" size={18} color={Colors.textPrimary} />}
              style={styles.actionBtnSecondary}
              titleStyle={styles.actionBtnSecondaryText}
              iconContainerStyle={styles.actionSecondaryIconWrap}
              variant="secondary"
              size="md"
              onPress={async () => {
                try {
                  await shipOrder(orderId);
                  show('Order marked as shipped', 'success');
                  void syncOrder();
                } catch (e) {
                  show(parseApiError(e).message, 'error');
                }
              }}
              accessibilityLabel="Mark order as shipped"
            />
          )}
          {canDeliver && (
            <AppButton
              title="Mark delivered"
              style={styles.actionBtnPrimary}
              titleStyle={styles.actionBtnPrimaryText}
              variant="primary"
              size="md"
              onPress={async () => {
                try {
                  await deliverOrder(orderId);
                  show('Delivery confirmed', 'success');
                  void syncOrder();
                } catch (e) {
                  show(parseApiError(e).message, 'error');
                }
              }}
              accessibilityLabel="Confirm delivery"
            />
          )}
          {canRefund && (
            <AppButton
              title="Request refund"
              icon={<Ionicons name="refresh-outline" size={18} color={Colors.danger} />}
              style={[styles.actionBtnSecondary, { borderColor: Colors.danger }]}
              titleStyle={[styles.actionBtnSecondaryText, { color: Colors.danger }]}
              iconContainerStyle={styles.actionSecondaryIconWrap}
              variant="secondary"
              size="md"
              onPress={async () => {
                try {
                  await refundOrder(orderId);
                  show('Refund processed', 'info');
                  void syncOrder();
                } catch (e) {
                  show(parseApiError(e).message, 'error');
                }
              }}
              accessibilityLabel="Request refund"
            />
          )}
          {!canCancel && !canShip && !canDeliver && !canRefund && (
            <AppButton
              title="Report issue"
              icon={<Ionicons name="alert-circle-outline" size={18} color={Colors.textPrimary} />}
              style={styles.actionBtnSecondary}
              titleStyle={styles.actionBtnSecondaryText}
              iconContainerStyle={styles.actionSecondaryIconWrap}
              variant="secondary"
              size="md"
              onPress={() => navigation.navigate('Report', { type: 'item' })}
              accessibilityLabel="Report issue"
            />
          )}
        </ElevatedSurface>
        </Reanimated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TxRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={txStyles.row}>
      <Text style={[txStyles.label, bold && txStyles.bold]}>{label}</Text>
      <Text style={[txStyles.value, bold && txStyles.bold]}>{value}</Text>
    </View>
  );
}

function ShipmentMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.shipmentMetaRow}>
      <Text style={styles.shipmentMetaLabel}>{label}</Text>
      <Text style={styles.shipmentMetaValue}>{value}</Text>
    </View>
  );
}

const txStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  label: { fontSize: 14, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  value: { fontSize: 14, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  bold: { fontFamily: Typography.family.bold, color: Colors.textPrimary, fontSize: 15 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },


  content: { paddingHorizontal: 20, paddingTop: 8 },

  itemCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md - Space.xs,
    alignItems: 'center',
    gap: Space.sm + 2,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  itemThumb: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden' },
  itemThumbImage: { width: '100%', height: '100%' },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4 },
  itemMeta: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textMuted, marginBottom: 4 },
  itemPrice: { fontSize: 16, fontFamily: Typography.family.bold, color: Colors.textPrimary },

  statusBanner: {
    flexDirection: 'row',
    backgroundColor: STATUS_PANEL_BG,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
    alignItems: 'flex-start',
    marginBottom: 22,
    borderWidth: 0.5,
    borderColor: STATUS_PANEL_BORDER,
  },
  statusLabel: { fontSize: 15, fontFamily: Typography.family.bold, color: Colors.brand, marginBottom: 4 },
  statusSub: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary, lineHeight: 20 },
  syncHint: {
    marginTop: -12,
    marginBottom: 18,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },

  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  shipmentMetaCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.xl,
    padding: Space.md,
    marginBottom: Space.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    gap: 10,
  },
  shipmentMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  shipmentMetaLabel: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    flex: 1,
  },
  shipmentMetaValue: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  shipmentLinkBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.brand,
  },
  shipmentLinkIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  shipmentLinkBtnText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },

  // Timeline
  timelineCard: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.lg, padding: Space.lg, marginBottom: Space.lg + Space.sm, borderWidth: 0.5, borderColor: Colors.border },
  timelineRow: { flexDirection: 'row', gap: 16 },
  timelineLeft: { alignItems: 'center', width: 20 },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.brand,
    marginTop: 2,
  },
  dotActive: {
    backgroundColor: Colors.brand,
    shadowColor: Colors.brand,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  dotInactive: { backgroundColor: Colors.border },
  line: { width: 2, flex: 1, backgroundColor: Colors.brand, marginVertical: 4, minHeight: 24 },
  lineInactive: { backgroundColor: Colors.border },
  timelineContent: { flex: 1, paddingBottom: 20 },
  timelineTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  stepLabel: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  stepLabelInactive: { color: Colors.textMuted },
  stepDate: { fontSize: 12, fontFamily: Typography.family.regular, color: Colors.textMuted },
  stepSub: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary, lineHeight: 18 },
  stepSubInactive: { color: Colors.textMuted },

  // Seller card
  sellerCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.lg + Space.sm,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  sellerIdentityTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  sellerAvatar: { width: 48, height: 48, borderRadius: 24 },
  sellerInfo: { flex: 1 },
  sellerName: { fontSize: 16, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4 },
  sellerLocation: { fontSize: 12, fontFamily: Typography.family.medium, color: Colors.textMuted, marginBottom: 2 },
  sellerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerRating: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  sellerLastSeen: { fontSize: 11, fontFamily: Typography.family.regular, color: Colors.textMuted, marginTop: 3 },
  msgBtn: {
    minHeight: 40,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.brand,
  },
  msgBtnText: { fontSize: 13, fontFamily: Typography.family.semibold, color: Colors.brand },

  // Transaction card
  txCard: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.lg, paddingHorizontal: Space.lg, paddingVertical: Space.sm, marginBottom: Space.lg + Space.sm, borderWidth: 0.5, borderColor: Colors.border },
  txDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: 6 },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtnSecondary: {
    flex: 1,
    minHeight: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  actionSecondaryIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  actionBtnSecondaryText: { fontSize: 14, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  actionBtnPrimary: {
    flex: 2,
    minHeight: 56,
    borderRadius: Radius.lg,
    borderWidth: 0,
    backgroundColor: Colors.brand,
  },
  actionBtnPrimaryText: { fontSize: 15, fontFamily: Typography.family.bold, color: Colors.background },
});
