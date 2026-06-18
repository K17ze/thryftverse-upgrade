import { Typography } from '../theme/designTokens';
import React, { useEffect, useState } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  Platform
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { isCheckoutReady } from '../utils/checkoutFlow';
import { formatCountryPolicyScope, isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import { useBackendData } from '../context/BackendDataContext';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { AddCardSheet } from '../components/checkout/AddCardSheet';
import { AddAddressSheet } from '../components/checkout/AddAddressSheet';
import {
  createCommercePaymentIntent,
  createOrder,
  getPaymentIntentStatus,
  getShippingQuote,
  listUserAddresses,
  listUserPaymentMethods,
} from '../services/commerceApi';
import { CapabilityCarrier, getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { CachedImage } from '../components/CachedImage';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Body, Caption, Meta, Headline } from '../components/ui/Text';
import { haptics } from '../utils/haptics';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { getListingCoverUri } from '../utils/media';
import { t } from '../i18n';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { PremiumActionBar } from '../components/ui/PremiumActionBar';

type RouteT = RouteProp<RootStackParamList, 'Checkout'>;
const BRAND = Colors.brand;
const PANEL_BG = Colors.surfaceAlt;
const PANEL_SOFT_BG = Colors.surfaceAlt;
const PANEL_BORDER = Colors.border;
const FOOTER_BG = Colors.background;

interface CheckoutPostageOption {
  carrierId: string | null;
  label: string;
  etaLabel: string;
  priceFromGbp: number;
  liveQuote: boolean;
}

const DEFAULT_POSTAGE_OPTION: CheckoutPostageOption = {
  carrierId: null,
  label: t('checkout.postage.default.label'),
  etaLabel: t('checkout.postage.default.eta'),
  priceFromGbp: 2.89,
  liveQuote: false,
};

const UNAVAILABLE_REGION_POSTAGE_OPTION: CheckoutPostageOption = {
  carrierId: null,
  label: 'Shipping quote not available for your region',
  etaLabel: 'Unavailable',
  priceFromGbp: 0,
  liveQuote: false,
};

function toEtaLabelFromRange(etaMinDays: number, etaMaxDays: number): string {
  if (etaMinDays === etaMaxDays) {
    return t('checkout.postage.eta.single', {
      days: etaMinDays,
      plural: etaMinDays === 1 ? '' : 's',
    });
  }

  return t('checkout.postage.eta.range', {
    min: etaMinDays,
    max: etaMaxDays,
  });
}

function toEtaLabel(carrier: CapabilityCarrier): string {
  return toEtaLabelFromRange(carrier.etaMinDays, carrier.etaMaxDays);
}

const PAYMENT_INTENT_POLL_ATTEMPTS = 12;
const PAYMENT_INTENT_POLL_INTERVAL_MS = 1_500;

type CheckoutPaymentSettlementStatus = 'succeeded' | 'failed' | 'pending';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForPaymentIntentSettlement(
  intentId: string
): Promise<CheckoutPaymentSettlementStatus> {
  for (let attempt = 0; attempt < PAYMENT_INTENT_POLL_ATTEMPTS; attempt += 1) {
    try {
      const latestIntent = await getPaymentIntentStatus(intentId);
      const normalizedStatus = latestIntent.status.trim().toLowerCase();

      if (normalizedStatus === 'succeeded') {
        return 'succeeded';
      }

      if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') {
        return 'failed';
      }
    } catch {
      // Continue polling until timeout to absorb transient API/network failures.
    }

    if (attempt < PAYMENT_INTENT_POLL_ATTEMPTS - 1) {
      await wait(PAYMENT_INTENT_POLL_INTERVAL_MS);
    }
  }

  return 'pending';
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId } = route.params;
  const { listings } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savePaymentMethod = useStore((state) => state.savePaymentMethod);
  const [isHydratingCheckout, setIsHydratingCheckout] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [addCardSheetVisible, setAddCardSheetVisible] = useState(false);
  const [addAddressSheetVisible, setAddAddressSheetVisible] = useState(false);
  const [postageOption, setPostageOption] = useState<CheckoutPostageOption>(DEFAULT_POSTAGE_OPTION);
  const [checkoutCapabilities, setCheckoutCapabilities] = useState<UserCountryCapabilities | null>(null);
  const reducedMotionEnabled = useReducedMotion();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();

  const item = listings.find((l) => l.id === itemId);

  if (!item) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <ScreenHeader title={t('checkout.header.title')} onBack={() => navigation.goBack()} backIcon="close" />
        <EmptyState icon="cube-outline" title="Item not found" subtitle="This listing is no longer available." ctaLabel="Go back" onCtaPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const resolvedSeller = item.seller ?? {
    id: item.sellerId ?? '',
    username: null,
    avatar: null,
    rating: null,
    reviewCount: null,
    location: null,
  };
  const sellerName = resolvedSeller.username ?? resolvedSeller.id.slice(0, 8);

  const PLATFORM_CHARGE = calculatePlatformChargeGbp(item.price);
  const POSTAGE_FEE = postageOption.priceFromGbp;
  const TOTAL = item.price + PLATFORM_CHARGE + POSTAGE_FEE;
  const checkoutReady = isCheckoutReady(savedAddress, savedPaymentMethod);
  const allowCardPayments = isPaymentMethodAllowed(checkoutCapabilities, 'card');
  const paymentPolicyLabel = formatCountryPolicyScope(checkoutCapabilities);

  useEffect(() => {
    let cancelled = false;

    const hydratePostageOption = async () => {
      if (!currentUser?.id) {
        setPostageOption(DEFAULT_POSTAGE_OPTION);
        setCheckoutCapabilities(null);
        return;
      }

      try {
        const capabilities = await getUserCountryCapabilities(currentUser.id);
        if (cancelled) {
          return;
        }

        setCheckoutCapabilities(capabilities);

        const primaryCarrier = capabilities.postage.carriers[0];
        if (!primaryCarrier) {
          setPostageOption(UNAVAILABLE_REGION_POSTAGE_OPTION);
          return;
        }

        const fallbackOption: CheckoutPostageOption = {
          carrierId: primaryCarrier.id,
          label: primaryCarrier.label,
          etaLabel: toEtaLabel(primaryCarrier),
          priceFromGbp: primaryCarrier.priceFromGbp,
          liveQuote: false,
        };

        setPostageOption(fallbackOption);

        if (!savedAddress?.id && !savedAddress?.postalCode) {
          return;
        }

        try {
          const quoteResponse = await getShippingQuote({
            buyerId: currentUser.id,
            listingId: item.id,
            addressId: savedAddress?.id,
            destinationPostcode: savedAddress?.postalCode,
            preferredCarrierId: primaryCarrier.id,
            declaredValueGbp: item.price,
          });

          if (cancelled) {
            return;
          }

          const selectedQuote = quoteResponse.recommendedQuote ?? quoteResponse.quotes[0];
          if (!selectedQuote) {
            return;
          }

          setPostageOption({
            carrierId: selectedQuote.carrierId,
            label: selectedQuote.label,
            etaLabel: toEtaLabelFromRange(selectedQuote.etaMinDays, selectedQuote.etaMaxDays),
            priceFromGbp: selectedQuote.priceFromGbp,
            liveQuote: selectedQuote.live,
          });
        } catch {
          // Keep fallback carrier pricing when quote API is unavailable.
        }
      } catch {
        if (!cancelled) {
          setPostageOption(DEFAULT_POSTAGE_OPTION);
          setCheckoutCapabilities(null);
        }
      }
    };

    void hydratePostageOption();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, savedAddress?.id, savedAddress?.postalCode, item.id, item.price]);

  const checkoutStatus = React.useMemo(() => {
    if (isSubmittingPayment) {
      return {
        tone: 'syncing' as const,
        label: t('checkout.status.processing'),
      };
    }

    if (isHydratingCheckout) {
      return {
        tone: 'syncing' as const,
        label: t('checkout.status.syncingDetails'),
      };
    }

    if (checkoutReady) {
      return {
        tone: 'live' as const,
        label: t('checkout.status.ready'),
      };
    }

    return {
      tone: 'offline' as const,
      label: t('checkout.status.incomplete'),
    };
  }, [checkoutReady, isHydratingCheckout, isSubmittingPayment]);

  useEffect(() => {
    let cancelled = false;

    const hydrateCheckoutDefaults = async () => {
      const userId = currentUser?.id;
      if (!userId) {
        setIsHydratingCheckout(false);
        return;
      }

      setIsHydratingCheckout(true);
      try {
        const [addresses, paymentMethods] = await Promise.all([
          listUserAddresses(userId),
          listUserPaymentMethods(userId),
        ]);

        if (cancelled) {
          return;
        }

        if (!savedAddress && addresses.length > 0) {
          const preferredAddress = addresses.find((entry) => entry.isDefault) ?? addresses[0];
          saveAddress({
            id: preferredAddress.id,
            name: preferredAddress.name,
            streetAddress: preferredAddress.streetAddress,
            apartment: preferredAddress.apartment,
            city: preferredAddress.city,
            region: preferredAddress.region,
            postalCode: preferredAddress.postalCode,
            countryCode: preferredAddress.countryCode,
            country: preferredAddress.country,
            isDefault: preferredAddress.isDefault,
          });
        }

        if (!savedPaymentMethod && paymentMethods.length > 0) {
          const preferredPaymentMethod =
            paymentMethods.find((entry) => entry.isDefault) ?? paymentMethods[0];
          savePaymentMethod({
            id: preferredPaymentMethod.id,
            type: preferredPaymentMethod.type,
            label: preferredPaymentMethod.label,
            details: preferredPaymentMethod.details ?? undefined,
            isDefault: preferredPaymentMethod.isDefault,
          });
        }
      } catch {
        // Keep local checkout state if backend data is unavailable.
      } finally {
        if (!cancelled) {
          setIsHydratingCheckout(false);
        }
      }
    };

    void hydrateCheckoutDefaults();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, saveAddress, savePaymentMethod, savedAddress, savedPaymentMethod]);

  const handlePay = async () => {
    if (!checkoutReady) {
      show(t('checkout.toast.addAddressPayment'), 'error');
      return;
    }

    if (isSubmittingPayment) {
      return;
    }

    const userId = currentUser?.id;
    if (!userId) {
      show(t('checkout.toast.signInRequired'), 'error');
      setIsSubmittingPayment(false);
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const order = await createOrder({
        buyerId: userId,
        listingId: item.id,
        addressId: savedAddress?.id,
        paymentMethodId: savedPaymentMethod?.id,
        platformChargeGbp: PLATFORM_CHARGE,
        postageFeeGbp: POSTAGE_FEE,
        shippingCarrierId: postageOption.carrierId ?? undefined,
      });

      const intent = await createCommercePaymentIntent({ orderId: order.id });

      if (intent.nextActionUrl) {
        try {
          const supported = await Linking.canOpenURL(intent.nextActionUrl);
          if (!supported) {
            show('Unable to open payment action URL.', 'error');
            setIsSubmittingPayment(false);
            return;
          }
          await Linking.openURL(intent.nextActionUrl);
          show(t('checkout.toast.paymentActionRequired'), 'info');
        } catch {
          show('Could not open payment page. Please try again.', 'error');
          setIsSubmittingPayment(false);
          return;
        }
      }

      const settlementStatus = await waitForPaymentIntentSettlement(intent.intentId);
      if (settlementStatus === 'succeeded') {
        show(t('checkout.toast.paymentCompleted'), 'success');
        navigation.replace('Success', { orderId: order.id });
        return;
      }

      if (settlementStatus === 'pending') {
        show(t('checkout.toast.paymentPending'), 'info');
        navigation.replace('OrderDetail', { orderId: order.id });
        return;
      }

      throw new Error('payment-intent-failed');
    } catch (error: any) {
      const message = error?.message === 'payment-intent-failed'
        ? t('checkout.toast.paymentFailed')
        : (error?.message || t('checkout.toast.paymentFailed'));
      show(message, 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleMessageSeller = React.useCallback(() => {
    if (!resolvedSeller.id || !item) return;
    navigation.navigate('Chat', {
      conversationId: `checkout_${resolvedSeller.id}_${item.id}`,
      focusQuery: item.title,
      partnerUserId: resolvedSeller.id,
    });
    show('Opening seller chat.', 'info');
  }, [item, navigation, resolvedSeller.id, show]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <ScreenHeader
        title={t('checkout.header.title')}
        onBack={() => navigation.goBack()}
        backIcon="close"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Item Summary Card */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(0)}>
        <ElevatedSurface variant="surface" style={styles.itemCard}>
          <CachedImage uri={getListingCoverUri(item.images, '')} style={styles.itemThumb} contentFit="cover" />
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.itemSellerRow}>
              {resolvedSeller.id ? (
                <AnimatedPressable
                  style={styles.sellerIdentityChip}
                  onPress={() => { haptics.tap(); navigation.navigate('UserProfile', { userId: resolvedSeller.id }); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Open @${sellerName} profile`}
                  accessibilityHint="Shows seller profile"
                >
                  <CachedImage
                    uri={resolvedSeller.avatar ?? ''}
                    style={styles.sellerIdentityAvatar}
                    containerStyle={styles.sellerIdentityAvatarWrap}
                    contentFit="cover"
                  />
                  <Text style={styles.itemSeller}>{t('checkout.header.fromSeller', { seller: sellerName })}</Text>
                </AnimatedPressable>
              ) : (
                <Text style={styles.itemSeller}>{t('checkout.header.fromSeller', { seller: sellerName })}</Text>
              )}

              {resolvedSeller.id && (
                <AnimatedPressable
                  style={styles.sellerMessageBtn}
                  onPress={() => { haptics.tap(); handleMessageSeller(); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Message seller"
                  accessibilityHint="Opens chat with this seller"
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={12} color={Colors.textPrimary} />
                </AnimatedPressable>
              )}
            </View>
            <Text style={styles.itemPrice}>{formatFromFiat(item.price, 'GBP')}</Text>
          </View>
        </ElevatedSurface>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(60)}>
        <ElevatedSurface variant="tint" style={styles.readinessCard}>
          <View style={styles.readinessTopRow}>
            <Text style={styles.readinessTitle}>{t('checkout.readiness.title')}</Text>
            <SyncStatusPill tone={checkoutStatus.tone} label={checkoutStatus.label} compact />
          </View>

          <View style={styles.readinessChipsRow}>
            <View style={[styles.readinessChip, savedAddress ? styles.readinessChipReady : styles.readinessChipPending]}>
              <Text style={[styles.readinessChipText, savedAddress ? styles.readinessChipTextReady : styles.readinessChipTextPending]}>
                {t('checkout.readiness.address')}
              </Text>
            </View>
            <View style={[styles.readinessChip, savedPaymentMethod ? styles.readinessChipReady : styles.readinessChipPending]}>
              <Text style={[styles.readinessChipText, savedPaymentMethod ? styles.readinessChipTextReady : styles.readinessChipTextPending]}>
                {t('checkout.readiness.payment')}
              </Text>
            </View>
            <View style={[styles.readinessChip, checkoutReady ? styles.readinessChipReady : styles.readinessChipPending]}>
              <Text style={[styles.readinessChipText, checkoutReady ? styles.readinessChipTextReady : styles.readinessChipTextPending]}>
                {t('checkout.readiness.confirm')}
              </Text>
            </View>
          </View>
        </ElevatedSurface>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(120)}>
        <Text style={styles.sectionTitle}>{t('checkout.section.delivery')}</Text>
        <ElevatedSurface variant="surface" style={styles.blockBtn}>
        <AnimatedPressable
          activeOpacity={0.8}
          onPress={() => setAddAddressSheetVisible(true)}
          accessibilityLabel={savedAddress
            ? t('checkout.a11y.deliveryAddress', { street: savedAddress.streetAddress })
            : t('checkout.a11y.addDeliveryAddress')}
        >
          <View style={styles.blockLeft}>
            <Ionicons name="location-outline" size={24} color={Colors.textPrimary} />
            <View style={styles.blockTextCol}>
              <Text style={styles.blockTitle}>
                {savedAddress ? `${savedAddress.streetAddress}${savedAddress.apartment ? `, ${savedAddress.apartment}` : ''}` : t('checkout.delivery.addAddress')}
              </Text>
              <Text style={styles.blockSub}>
                {savedAddress
                  ? `${savedAddress.city}${savedAddress.region ? `, ${savedAddress.region}` : ''} | ${savedAddress.postalCode} | ${savedAddress.country}`
                  : t('checkout.delivery.required')}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </AnimatedPressable>
        </ElevatedSurface>

        <ElevatedSurface variant="surface" style={styles.blockBtn}>
        <AnimatedPressable activeOpacity={0.8} onPress={() => navigation.navigate('Postage')}>
          <View style={styles.blockLeft}>
            <Ionicons name="cube-outline" size={24} color={Colors.textPrimary} />
            <View style={styles.blockTextCol}>
              <Text style={styles.blockTitle}>{postageOption.label}</Text>
              <Text style={styles.blockSub}>
                {postageOption.liveQuote
                  ? postageOption.etaLabel
                  : `${postageOption.etaLabel} (${t('checkout.postage.estimated')})`}
              </Text>
            </View>
          </View>
          <Text style={styles.blockRightPrice}>{formatFromFiat(POSTAGE_FEE, 'GBP')}</Text>
        </AnimatedPressable>
        </ElevatedSurface>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(180)}>
        <Text style={styles.sectionTitle}>{t('checkout.section.payment')}</Text>
        {paymentPolicyLabel ? (
          <Text style={styles.policyHint}>{t('checkout.payment.policyScope', { scope: paymentPolicyLabel })}</Text>
        ) : null}
        <ElevatedSurface variant="surface" style={styles.blockBtn}>
        <AnimatedPressable
          activeOpacity={0.8}
          onPress={() => {
            if (!allowCardPayments) {
              show(t('checkout.toast.cardsUnavailable'), 'error');
              navigation.navigate('Payments');
              return;
            }

            setAddCardSheetVisible(true);
          }}
        >
          <View style={styles.blockLeft}>
            <Ionicons name="card-outline" size={24} color={Colors.textPrimary} />
            <View style={styles.blockTextCol}>
              <Text style={styles.blockTitle}>{savedPaymentMethod ? savedPaymentMethod.label : t('checkout.payment.addMethod')}</Text>
              <Text style={styles.blockSub}>
                {!allowCardPayments
                  ? t('checkout.payment.cardsUnavailableRegion')
                  : (savedPaymentMethod?.details ?? t('checkout.payment.cardRailsFallback'))}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </AnimatedPressable>
        </ElevatedSurface>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(240)}>
        <Text style={styles.sectionTitle}>{t('checkout.section.orderSummary')}</Text>
        <ElevatedSurface variant="surface" style={styles.summaryCard}>
          <SummaryRow label={t('checkout.summary.itemPrice')} value={formatFromFiat(item.price, 'GBP')} />
          <SummaryRow label={t('checkout.summary.platformCharge')} value={formatFromFiat(PLATFORM_CHARGE, 'GBP')} info />
          <SummaryRow
            label={
              postageOption.liveQuote
                ? t('checkout.summary.postage')
                : `${t('checkout.summary.postage')} (${t('checkout.postage.estimated')})`
            }
            value={formatFromFiat(POSTAGE_FEE, 'GBP')}
          />
          <View style={styles.divider} />
          <SummaryRow label={t('checkout.summary.total')} value={formatFromFiat(TOTAL, 'GBP')} bold />
        </ElevatedSurface>
        </Reanimated.View>

        <Text style={styles.termsText}>
          {t('checkout.terms')}
        </Text>

        {!checkoutReady && (
          <Text style={styles.requirementText}>{t('checkout.requirement')}</Text>
        )}
        {isHydratingCheckout && (
          <Text style={styles.syncText}>{t('checkout.sync.savedDetails')}</Text>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky Bottom Footer */}
      <PremiumActionBar
        primaryLabel={isSubmittingPayment ? t('checkout.cta.processing') : t('checkout.cta.paySecurely')}
        onPrimaryPress={() => { haptics.press(); handlePay(); }}
        primaryLoading={isSubmittingPayment}
        primaryDisabled={!checkoutReady || isSubmittingPayment}
        errorText={!checkoutReady && !isHydratingCheckout ? t('checkout.requirement') : undefined}
      />

      <AddCardSheet visible={addCardSheetVisible} onDismiss={() => setAddCardSheetVisible(false)} />
      <AddAddressSheet visible={addAddressSheetVisible} onDismiss={() => setAddAddressSheetVisible(false)} />
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, bold, info }: { label: string; value: string; bold?: boolean; info?: boolean }) {
  return (
    <View style={summaryStyles.row}>
      <View style={summaryStyles.labelRow}>
        <Text style={[summaryStyles.label, bold && summaryStyles.bold]}>{label}</Text>
        {info && <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} style={{ marginLeft: 6 }} />}
      </View>
      <Text style={[summaryStyles.value, bold && summaryStyles.bold]}>{value}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 14, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  value: { fontSize: 14, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  bold: { fontSize: 16, fontFamily: Typography.family.bold, color: Colors.textPrimary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },

  itemCard: {
    flexDirection: 'row',
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    borderRadius: 16,
    padding: 12,
    marginBottom: 32,
    gap: 16,
    alignItems: 'center',
  },
  itemThumb: { width: 64, height: 64, borderRadius: 12 },
  itemInfo: { flex: 1, justifyContent: 'center' },
  itemTitle: { fontSize: 16, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4 },
  itemSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  sellerIdentityChip: {
    flex: 1,
    minHeight: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: PANEL_SOFT_BG,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerIdentityAvatarWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  sellerIdentityAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  itemSeller: { flex: 1, fontSize: 12, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  sellerMessageBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: PANEL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPrice: { fontSize: 15, fontFamily: Typography.family.bold, color: Colors.textPrimary },

  readinessCard: {
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  readinessTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  readinessTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: Typography.family.bold,
  },
  readinessChipsRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  readinessChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessChipReady: {
    backgroundColor: Colors.surfaceAlt,
    borderColor: Colors.border,
  },
  readinessChipPending: {
    backgroundColor: PANEL_SOFT_BG,
    borderColor: PANEL_BORDER,
  },
  readinessChipText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  readinessChipTextReady: {
    color: BRAND,
  },
  readinessChipTextPending: {
    color: Colors.textSecondary,
  },

  sectionTitle: { fontSize: 13, fontFamily: Typography.family.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
  policyHint: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    marginBottom: 10,
    marginLeft: 4,
  },

  blockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PANEL_BG,
    borderWidth: 0.5,
    borderColor: PANEL_BORDER,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  blockLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  blockTextCol: { justifyContent: 'center' },
  blockTitle: { fontSize: 16, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4 },
  blockSub: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  blockRightPrice: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.textPrimary },

  summaryCard: { backgroundColor: PANEL_BG, borderWidth: 0.5, borderColor: PANEL_BORDER, padding: 24, borderRadius: 20, marginBottom: 24 },
  divider: { height: 1, backgroundColor: PANEL_BORDER, marginVertical: 12 },

  termsText: { fontSize: 12, fontFamily: Typography.family.regular, color: Colors.textMuted, lineHeight: 18, textAlign: 'center', paddingHorizontal: 16 },
  requirementText: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.danger,
    textAlign: 'center',
  },
  syncText: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PANEL_BORDER,
    backgroundColor: FOOTER_BG,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  footerPriceCol: { flex: 1 },
  footerTotalLabel: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  footerTotalPrice: { fontSize: 24, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  payBtn: { minWidth: 186, marginLeft: 16 },
});
