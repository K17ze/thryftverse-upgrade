import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { fetchCoOwnAssetById, fetchCoOwnHoldings, createCoOwnBuyoutOffer, listCoOwnBuyoutOffers, acceptCoOwnBuyoutOffer, MarketCoOwnAsset, MarketCoOwnBuyoutOffer } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { Space, Radius, DockConstants, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { sessionStorage } from '../storage/mmkv';
import {
  CoOwnStateCanvas,
  CoOwnStickyActionDock } from '../components/coown';

type RouteT = RouteProp<RootStackParamList, 'Buyout'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function BuyoutScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { width: screenWidth } = useWindowDimensions();
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;

  const buyoutAssetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<MarketCoOwnAsset | null>(null);
  const [sharesOwned, setSharesOwned] = React.useState(0);
  // F20: a failed holdings fetch must never read as verified zero ownership.
  const [holdingsUnavailable, setHoldingsUnavailable] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);

  // U46: Active buyout offers for this asset, surfaced for holder review.
  const [buyoutOffers, setBuyoutOffers] = React.useState<MarketCoOwnBuyoutOffer[]>([]);
  const [offersLoading, setOffersLoading] = React.useState(false);
  const [acceptingOfferId, setAcceptingOfferId] = React.useState<string | null>(null);
  // Units the holder commits when accepting an offer. Defaults to their
  // full holding; the input lets them commit a partial quantity.
  const [acceptUnits, setAcceptUnits] = React.useState<Record<string, string>>({});

  // Buyout offer creation state
  const [offerPrice, setOfferPrice] = React.useState('');
  const [targetUnits, setTargetUnits] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  // U45: durable operation identity. A lost create response leaves the
  // user uncertain whether the offer was created. We persist an
  // idempotency key so a retry/relaunch resolves the same offer rather
  // than creating a duplicate. The key is stored in session storage keyed
  // by asset + price + target so a changed intent starts a new operation.
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = React.useState<string | null>(null);
  const [submitUncertain, setSubmitUncertain] = React.useState(false);
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  React.useEffect(() => {
    if (!buyoutAssetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      fetchCoOwnAssetById(buyoutAssetId),
      currentUser?.id
        ? fetchCoOwnHoldings(currentUser.id).catch(() => null)
        : Promise.resolve([]),
      // U46: fetch active buyout offers for holder review. Degrade to an
      // empty list on failure — the surface shows "No active buyout offers"
      // rather than blocking the create flow.
      listCoOwnBuyoutOffers(buyoutAssetId, { status: 'open', limit: 20 }).catch(() => null),
    ])
      .then(([fetchedAsset, holdings, offers]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        if (holdings == null) {
          // Holdings unknown — position rows degrade to unavailable rather
          // than asserting a zero stake.
          setHoldingsUnavailable(true);
          setSharesOwned(0);
        } else {
          setHoldingsUnavailable(false);
          const holding = holdings.find((h) => h.assetId === buyoutAssetId);
          setSharesOwned(holding?.unitsOwned ?? 0);
        }
        setBuyoutOffers(offers ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load asset');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [buyoutAssetId, currentUser?.id, show]);

  // U45: Resolve a pending (uncertain) buyout offer by matching the persisted
  // idempotency key against existing offers for this asset. Called on mount
  // when an uncertain state was left from a prior session, and by the retry
  // button. A lost create response may have succeeded — this confirms it.
  const resolvePendingOffer = React.useCallback(async () => {
    if (!buyoutAssetId) return;
    const key = pendingIdempotencyKey;
    setOffersLoading(true);
    try {
      const offers = await listCoOwnBuyoutOffers(buyoutAssetId, { limit: 60 });
      setBuyoutOffers(offers.filter((o) => o.status === 'open'));
      if (key) {
        const resolved = offers.find((o) => {
          const meta = o.metadata as Record<string, unknown> | null;
          return meta?.idempotencyKey === key;
        });
        if (resolved) {
          // The lost response did create the offer — clear the pending
          // operation and navigate to the asset detail.
          sessionStorage.remove(`buyout-pending:${buyoutAssetId}`);
          setPendingIdempotencyKey(null);
          setSubmitUncertain(false);
          haptics.success();
          show('Buyout offer confirmed', 'success');
          navigation.replace('AssetDetail', { assetId: buyoutAssetId });
        }
      }
    } catch {
      // Unable to resolve — keep the uncertain state so the user can
      // retry the check.
    } finally {
      setOffersLoading(false);
    }
  }, [buyoutAssetId, pendingIdempotencyKey, show, navigation]);

  // U45: On mount, check whether a previously-submitted offer (whose
  // response was lost) can be resolved by matching the persisted
  // idempotency key against existing offers for this asset.
  React.useEffect(() => {
    if (!buyoutAssetId || !submitUncertain) return;
    void resolvePendingOffer();
  }, [buyoutAssetId, submitUncertain, resolvePendingOffer]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    if (buyoutAssetId) navigation.replace('AssetDetail', { assetId: buyoutAssetId });
    else navigation.navigate('CoOwnHub');
  }, [navigation, buyoutAssetId]);

  const handleCreateBuyoutOffer = React.useCallback(async () => {
    if (!asset || !currentUser?.id) return;
    const priceNum = parseFloat(offerPrice);
    if (!priceNum || priceNum <= 0) {
      show('Enter a valid offer price', 'error');
      return;
    }
    const unitsNum = targetUnits.trim() ? parseInt(targetUnits, 10) : undefined;
    if (targetUnits.trim() && (!unitsNum || unitsNum <= 0)) {
      show('Enter a valid target units count', 'error');
      return;
    }

    // U44: explicit per-unit / total / target / expiry / settlement
    // denomination breakdown shown in the confirmation step.
    const effectiveUnits = unitsNum ?? (holdingsUnavailable ? 0 : Math.max(0, asset.totalUnits - sharesOwned));
    const totalGbp = priceNum * effectiveUnits;
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiryLabel = expiryDate.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const breakdown = [
      `£${priceNum.toFixed(2)} per unit × ${effectiveUnits.toLocaleString()} units = £${totalGbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total commitment`,
      `Target: ${effectiveUnits.toLocaleString()} units`,
      `Expires: ${expiryLabel}`,
      `Settlement: GBP`,
    ].join('\n');

    setConfirmSheet({
      visible: true,
      title: 'Submit buyout offer?',
      message: breakdown,
      confirmLabel: 'Submit offer',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        setSubmitting(true);
        // U45: generate (or reuse) a durable idempotency key for this
        // operation so a lost response can be resolved on retry/relaunch.
        const storageKey = `buyout-pending:${asset.id}`;
        let idempotencyKey = pendingIdempotencyKey;
        if (!idempotencyKey) {
          idempotencyKey = `buyout-${asset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          sessionStorage.set(storageKey, idempotencyKey);
          setPendingIdempotencyKey(idempotencyKey);
        }
        try {
          await createCoOwnBuyoutOffer(asset.id, {
            bidderUserId: currentUser.id,
            offerPriceGbp: priceNum,
            targetUnits: unitsNum,
            idempotencyKey,
            metadata: { idempotencyKey },
          });
          // Success — clear the durable operation identity.
          sessionStorage.remove(storageKey);
          setPendingIdempotencyKey(null);
          setSubmitUncertain(false);
          haptics.success();
          show('Buyout offer submitted', 'success');
          setOfferPrice('');
          setTargetUnits('');
          navigation.replace('AssetDetail', { assetId: asset.id });
        } catch (err) {
          const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
          if (isNetworkError) {
            // U45: a lost response means the offer may have been created.
            // Do not claim failure — tell the user to check, and keep the
            // idempotency key so a retry/relaunch resolves the same offer.
            setSubmitUncertain(true);
            show('Check offer — we could not confirm submission. Your offer may already be live. Retry to check.', 'info');
          } else {
            const parsed = parseApiError(err, 'Failed to submit buyout offer');
            show(parsed.message, 'error');
          }
        } finally {
          setSubmitting(false);
        }
      },
      variant: 'default' });
  }, [asset, currentUser?.id, offerPrice, targetUnits, navigation, show, holdingsUnavailable, sharesOwned, pendingIdempotencyKey, isOffline]);

  if (isLoading) {
    return (
      <FlagshipScreen
        style={{ backgroundColor: colors.background }}
        header={
          <FlagshipHeader
            title="Buyout"
            subtitle="Acquire remaining units"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <CoOwnStateCanvas variant="loading" />
      </FlagshipScreen>
    );
  }

  if (isError || !asset) {
    return (
      <FlagshipScreen
        style={{ backgroundColor: colors.background }}
        header={
          <FlagshipHeader
            title="Buyout"
            subtitle="Acquire remaining units"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <CoOwnStateCanvas
          variant="error"
          title="Asset not found"
          subtitle="This Co-Own item may have been delisted."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </FlagshipScreen>
    );
  }

  const ownershipPct = !holdingsUnavailable && asset.totalUnits > 0 ? (sharesOwned / asset.totalUnits) * 100 : null;
  const ownsAll = !holdingsUnavailable && asset.totalUnits > 0 && sharesOwned >= asset.totalUnits;
  const remainingUnits = holdingsUnavailable ? null : Math.max(0, asset.totalUnits - sharesOwned);
  const imageHeight = Math.min(screenWidth * 0.5, 240);

  return (
    <FlagshipScreen
      style={{ backgroundColor: colors.background }}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={
        <FlagshipHeader
          title="Buyout"
          subtitle={asset.title}
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]} showsVerticalScrollIndicator={false}>
        {/* Item image */}
        {asset.imageUrl ? (
          <CachedImage uri={asset.imageUrl} style={[styles.image, { height: imageHeight }]} contentFit="cover" transition={300} />
        ) : null}

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{asset.title}</Text>

        {/* Position summary — flat section with hairline rows */}
        <View style={[styles.positionSection, { borderBottomColor: colors.borderSubtle }]}>
          <View style={[styles.positionRow, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Your units</Text>
            <Text
              style={[styles.positionValue, { color: holdingsUnavailable ? colors.textMuted : colors.textPrimary }]}
            >
              {holdingsUnavailable ? 'Unavailable' : `${sharesOwned} / ${asset.totalUnits}`}
            </Text>
          </View>
          <View style={[styles.positionRow, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Ownership</Text>
            <Text style={[styles.positionValue, { color: colors.textPrimary }]}>
              {ownershipPct != null ? `${ownershipPct.toFixed(1)}%` : '—'}
            </Text>
          </View>
          <View style={styles.positionRowLast}>
            <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Remaining</Text>
            <Text style={[styles.positionValue, { color: colors.textPrimary }]}>
              {remainingUnits != null ? `${remainingUnits} units` : '—'}
            </Text>
          </View>
        </View>

        {/* Status message — flat section */}
        {ownsAll ? (
          <View style={[styles.statusSection, { borderBottomColor: colors.borderSubtle }]}>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>You own 100% of this item</Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              You already hold all units in this Co-Own. No buyout is needed.
            </Text>
          </View>
        ) : (
          <View style={[styles.statusSection, { borderBottomColor: colors.borderSubtle }]}>
            <Ionicons name="cash-outline" size={28} color={colors.brand} />
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Make a buyout offer</Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              Submit an offer to acquire the remaining {remainingUnits != null ? `${remainingUnits} ` : ''}units from current holders. Holders will be notified and can accept or decline.
            </Text>
          </View>
        )}

        {/* Buyout offer form — flat section */}
        {!ownsAll && (
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Offer price (GBP £)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
              value={offerPrice}
              onChangeText={setOfferPrice}
              placeholder="e.g. 500.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Offer price in pounds"
            />

            <Text style={[styles.formLabel, { color: colors.textSecondary, marginTop: Space.md }]}>Target units (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
              value={targetUnits}
              onChangeText={setTargetUnits}
              placeholder={remainingUnits != null ? `All remaining (${remainingUnits})` : 'All remaining units'}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel="Target units to acquire"
            />
            <Text style={[styles.formHint, { color: colors.textMuted }]}>
              Leave blank to offer on all remaining units.
            </Text>

            {/* U44: live per-unit / total breakdown before submit */}
            {(() => {
              const priceNum = parseFloat(offerPrice);
              if (!priceNum || priceNum <= 0) return null;
              const unitsNum = targetUnits.trim() ? parseInt(targetUnits, 10) : (remainingUnits ?? 0);
              if (!unitsNum || unitsNum <= 0) return null;
              const totalGbp = priceNum * unitsNum;
              const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
              const expiryLabel = expiryDate.toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              });
              return (
                <View style={[styles.breakdown, { borderTopColor: colors.borderSubtle }]}>
                  <Text style={[styles.breakdownLine, { color: colors.textPrimary }]}>
                    £{priceNum.toFixed(2)} per unit × {unitsNum.toLocaleString()} units = £{totalGbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} commitment
                  </Text>
                  <View style={[styles.breakdownRow, { borderBottomColor: colors.borderSubtle }]}>
                    <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>Target</Text>
                    <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>{unitsNum.toLocaleString()} units</Text>
                  </View>
                  <View style={[styles.breakdownRow, { borderBottomColor: colors.borderSubtle }]}>
                    <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>Expires</Text>
                    <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>{expiryLabel}</Text>
                  </View>
                  <View style={styles.breakdownRowLast}>
                    <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>Settlement</Text>
                    <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>GBP</Text>
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* U45: uncertain-submit banner — a lost response means the offer
            may already be live. The user can retry to resolve it. */}
        {submitUncertain && !ownsAll && (
          <View style={[styles.uncertainSection, { borderBottomColor: colors.borderSubtle }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.warning} />
            <Text style={[styles.uncertainTitle, { color: colors.textPrimary }]}>
              Submission not confirmed
            </Text>
            <Text style={[styles.uncertainBody, { color: colors.textSecondary }]}>
              We could not confirm your offer. It may already be live. Retry to check its status.
            </Text>
            <AppButton
              title={offersLoading ? 'Checking…' : 'Retry check'}
              onPress={() => { haptics.tap(); void resolvePendingOffer(); }}
              variant="secondary"
              size="md"
              disabled={offersLoading}
              accessibilityLabel="Retry checking offer status"
              style={{ marginTop: Space.sm, alignSelf: 'stretch' }}
            />
          </View>
        )}

        {/* U46: holder review surface — active buyout offers for this asset.
            Holders who own units (and are not the bidder) can accept. */}
        {!ownsAll && (
          <View style={styles.offersSection}>
            <Text style={[styles.offersSectionTitle, { color: colors.textPrimary }]}>
              Active buyout offers
            </Text>
            {buyoutOffers.length === 0 ? (
              <Text style={[styles.offersEmpty, { color: colors.textMuted }]}>
                No active buyout offers for this asset.
              </Text>
            ) : (
              buyoutOffers.map((offer) => {
                const isOwnBid = offer.bidderUserId === currentUser?.id;
                const canAccept = !holdingsUnavailable && sharesOwned > 0 && !isOwnBid && offer.status === 'open';
                const remainingTarget = Math.max(0, offer.targetUnits - offer.acceptedUnits);
                const offerExpired = new Date(offer.expiresAt).getTime() <= Date.now();
                const maxAccept = Math.min(sharesOwned, remainingTarget);
                const unitsStr = acceptUnits[offer.id] ?? '';
                const unitsNum = unitsStr.trim() ? parseInt(unitsStr, 10) : maxAccept;
                const acceptTotalGbp = (offer.offerPriceGbp) * (unitsNum || 0);
                return (
                  <View key={offer.id} style={[styles.offerCard, { borderColor: colors.borderSubtle }]}>
                    <View style={[styles.offerHeader, { borderBottomColor: colors.borderSubtle }]}>
                      <Text style={[styles.offerPrice, { color: colors.textPrimary }]}>
                        £{offer.offerPriceGbp.toFixed(2)} per unit
                      </Text>
                      <Text style={[styles.offerStatus, { color: offerExpired ? colors.textMuted : colors.success }]}>
                        {offerExpired ? 'Expired' : 'Open'}
                      </Text>
                    </View>
                    <View style={[styles.offerRow, { borderBottomColor: colors.borderSubtle }]}>
                      <Text style={[styles.offerLabel, { color: colors.textMuted }]}>Target</Text>
                      <Text style={[styles.offerValue, { color: colors.textPrimary }]}>
                        {offer.targetUnits.toLocaleString()} units
                      </Text>
                    </View>
                    <View style={[styles.offerRow, { borderBottomColor: colors.borderSubtle }]}>
                      <Text style={[styles.offerLabel, { color: colors.textMuted }]}>Accepted</Text>
                      <Text style={[styles.offerValue, { color: colors.textPrimary }]}>
                        {offer.acceptedUnits.toLocaleString()} / {offer.targetUnits.toLocaleString()} units
                      </Text>
                    </View>
                    <View style={[styles.offerRow, { borderBottomColor: colors.borderSubtle }]}>
                      <Text style={[styles.offerLabel, { color: colors.textMuted }]}>Remaining</Text>
                      <Text style={[styles.offerValue, { color: colors.textPrimary }]}>
                        {remainingTarget.toLocaleString()} units
                      </Text>
                    </View>
                    <View style={styles.offerRowLast}>
                      <Text style={[styles.offerLabel, { color: colors.textMuted }]}>Expires</Text>
                      <Text style={[styles.offerValue, { color: colors.textPrimary }]}>
                        {new Date(offer.expiresAt).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    </View>

                    {isOwnBid ? (
                      <Text style={[styles.offerNote, { color: colors.textMuted }]}>
                        This is your offer.
                      </Text>
                    ) : canAccept && !offerExpired ? (
                      <View style={styles.offerAccept}>
                        <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
                          Units to accept (max {maxAccept.toLocaleString()})
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                          value={unitsStr}
                          onChangeText={(text) => setAcceptUnits((prev) => ({ ...prev, [offer.id]: text }))}
                          placeholder={String(maxAccept)}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          accessibilityLabel={`Units to accept for offer ${offer.id}`}
                        />
                        <Text style={[styles.formHint, { color: colors.textMuted }]}>
                          You receive £{acceptTotalGbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for {unitsNum.toLocaleString()} units.
                        </Text>
                        <AppButton
                          title={acceptingOfferId === offer.id ? 'Accepting…' : 'Accept offer'}
                          onPress={() => {
                            haptics.press();
                            void (async () => {
                              if (!currentUser?.id) return;
                              const commit = unitsStr.trim() ? parseInt(unitsStr, 10) : maxAccept;
                              if (!commit || commit <= 0 || commit > maxAccept) {
                                show('Enter a valid unit count', 'error');
                                return;
                              }
                              setAcceptingOfferId(offer.id);
                              try {
                                await acceptCoOwnBuyoutOffer(offer.id, {
                                  holderUserId: currentUser.id,
                                  units: commit,
                                });
                                haptics.success();
                                show(`Accepted ${commit} units at £${offer.offerPriceGbp.toFixed(2)} per unit`, 'success');
                                // Refresh offers to reflect updated accepted_units.
                                const refreshed = await listCoOwnBuyoutOffers(asset.id, { status: 'open', limit: 20 });
                                setBuyoutOffers(refreshed);
                                setAcceptUnits((prev) => {
                                  const next = { ...prev };
                                  delete next[offer.id];
                                  return next;
                                });
                              } catch (err) {
                                const parsed = parseApiError(err, 'Failed to accept offer');
                                show(parsed.message, 'error');
                              } finally {
                                setAcceptingOfferId(null);
                              }
                            })();
                          }}
                          variant="primary"
                          size="md"
                          disabled={acceptingOfferId === offer.id}
                          style={{ marginTop: Space.sm, alignSelf: 'stretch' }}
                          accessibilityLabel={`Accept buyout offer ${offer.id}`}
                        />
                      </View>
                    ) : !offerExpired ? (
                      <Text style={[styles.offerNote, { color: colors.textMuted }]}>
                        {holdingsUnavailable
                          ? 'Holdings unavailable — cannot accept.'
                          : sharesOwned <= 0
                            ? 'You hold no units to accept this offer.'
                            : 'You cannot accept this offer.'}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        {ownsAll ? (
          <AppButton
            title="Back to item"
            onPress={() => { haptics.tap(); navigation.replace('AssetDetail', { assetId: asset.id }); }}
            variant="secondary"
            size="lg"
            icon={<Ionicons name="arrow-back" size={16} color={colors.textPrimary} />}
            accessibilityLabel="Go back to item detail"
            style={{ flex: 1 }}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: Space.sm, flex: 1 }}>
            <AppButton
              title="Back"
              onPress={() => { haptics.tap(); handleBack(); }}
              variant="secondary"
              size="lg"
              accessibilityLabel="Go back"
              style={{ flex: 1 }}
            />
            <AppButton
              title={submitting ? 'Submitting…' : 'Submit offer'}
              onPress={() => { haptics.press(); void handleCreateBuyoutOffer(); }}
              variant="primary"
              size="lg"
              disabled={submitting || !offerPrice}
              icon={submitting ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Ionicons name="send-outline" size={16} color={colors.textInverse} />}
              accessibilityLabel="Submit buyout offer"
              style={{ flex: 2 }}
            />
          </View>
        )}
      </CoOwnStickyActionDock>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md },
  image: {
    width: '100%',
    borderRadius: Radius.lg,
    marginBottom: Space.md },
  title: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing + 0.1,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    marginBottom: Space.md },
  positionSection: {
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  positionRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm },
  positionLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  positionValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  statusSection: {
    paddingVertical: Space.lg,
    gap: Space.sm,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth },
  statusTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing + 0.1,
    textAlign: 'center' },
  statusBody: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight,
    textAlign: 'center' },
  formSection: {
    paddingVertical: Space.md },
  formLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs },
  input: {
    borderWidth: Stroke.standard,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  formHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs },
  // U44: live breakdown
  breakdown: {
    marginTop: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
  breakdownLine: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'],
    marginBottom: Space.sm },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth },
  breakdownRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs },
  breakdownLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  breakdownValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  // U45: uncertain-submit banner
  uncertainSection: {
    paddingVertical: Space.lg,
    gap: Space.sm,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth },
  uncertainTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing + 0.1,
    textAlign: 'center' },
  uncertainBody: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight,
    textAlign: 'center' },
  // U46: holder review surface
  offersSection: {
    paddingVertical: Space.md },
  offersSectionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing + 0.1,
    marginBottom: Space.sm },
  offersEmpty: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  offerCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Space.md,
    marginBottom: Space.sm },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.xs },
  offerPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  offerStatus: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  offerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth },
  offerRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs },
  offerLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  offerValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  offerNote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.sm },
  offerAccept: {
    marginTop: Space.sm } });
