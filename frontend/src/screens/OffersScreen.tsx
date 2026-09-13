/**
 * OffersScreen — the single surface where the offer lifecycle is visible
 * and actionable.
 *
 * Data comes from GET /users/me/offers, which returns both directions:
 * rows where the viewer is the seller ("Received") and rows where the
 * viewer is the buyer ("Sent"), including counter-offer rows on both
 * sides of a negotiation (keyed by `offeredByUserId`).
 *
 * Actions follow the server's authorization rules exactly:
 *   - seller may accept / decline / counter a pending offer they did not
 *     author;
 *   - buyer may counter or cancel a pending offer they did not author
 *     (i.e. a seller's counter), and may cancel their own pending offer.
 *
 * Truthfulness (AGENTS.md §11):
 *   - The backend expires offers lazily; a `pending` row past `expiresAt`
 *     is rendered as expired and shows no actions.
 *   - Accept uses the returned checkout payload — the orderId is real —
 *     and routes to OrderDetail (Checkout cannot consume an orderId yet;
 *     see useConversationCommerce for the documented seam).
 *   - After accept, the list is refetched because first-accept-wins
 *     declines sibling pending offers on the same listing.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { OfflineBanner } from '../components/OfflineBanner';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { OfferRow, effectiveOfferStatus, type OfferRowAction } from '../components/offers/OfferRow';
import {
  acceptListingOfferOnApi,
  cancelListingOfferOnApi,
  declineListingOfferOnApi,
  fetchMyOffersFromApi,
  type ListingOffer,
} from '../services/listingOffersApi';
import { fetchListingByIdFromApi } from '../services/listingsApi';
import { fetchPublicProfile } from '../services/profileApi';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { useConnectivity } from '../hooks/useConnectivity';
import { useNotifications } from '../hooks/useNotifications';
import { useHaptic } from '../hooks/useHaptic';
import { useVisuallyComplete } from '../performance/visuallyComplete';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'Offers'>;
type Segment = 'received' | 'sent';

/** Caps on the batched detail lookups — bounds worst-case fan-out. */
const MAX_LISTING_LOOKUPS = 12;
const MAX_PROFILE_LOOKUPS = 10;
const TICK_MS = 30_000;

interface ListingMeta {
  title?: string;
  image?: string | null;
}

export default function OffersScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const scopeListingId = route.params?.listingId;
  const { isOffline } = useConnectivity();
  const { showSuccess, showError, showInfo } = useNotifications();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const reportReady = useVisuallyComplete('Offers');
  const { listings } = useBackendData();
  const currentUser = useStore((s) => s.currentUser);
  const conversations = useStore((s) => s.conversations);
  const currentUserId = currentUser?.id;

  const [offers, setOffers] = useState<ListingOffer[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actingOfferId, setActingOfferId] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>('received');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<{
    visible: boolean;
    offer: ListingOffer | null;
    action: 'accept' | 'decline' | 'cancel';
  }>({ visible: false, offer: null, action: 'accept' });

  // Resolved context: listing covers/titles and counterparty names are not
  // embedded in the offer payload, so they are resolved against the local
  // caches first and only then fetched — bounded and deduplicated.
  const [listingMetaOverride, setListingMetaOverride] = useState<Map<string, ListingMeta>>(new Map());
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map());

  const didAutoSelectSegment = useRef(false);

  const loadOffers = useCallback(async () => {
    setLoadError('');
    try {
      const result = await fetchMyOffersFromApi({ limit: 50 });
      setOffers(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('offers.error.subtitle');
      setLoadError(message);
      // With rows already on screen the empty-state error never renders —
      // surface a failed refresh honestly instead of leaving stale data.
      setOffers((prev) => {
        if (prev && prev.length > 0) {
          showError(t('offers.error.title'), message);
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useFocusEffect(
    useCallback(() => {
      void loadOffers();
    }, [loadOffers]),
  );

  // Shared countdown clock — one interval for the whole list.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      reportReady('data-ready');
      reportReady('interaction-ready');
    }
  }, [isLoading, reportReady]);

  const scopedOffers = useMemo(() => {
    if (!offers) return [];
    if (!scopeListingId) return offers;
    return offers.filter((o) => o.listingId === scopeListingId);
  }, [offers, scopeListingId]);

  // Actionable-first ordering: pending offers awaiting MY response lead
  // (soonest expiry first); everything else follows by recency. Effective
  // status is used so a lazily-expired row renders as expired rather than
  // sorting into the "awaiting my response" group.
  const orderRows = useCallback(
    (rows: ListingOffer[]): ListingOffer[] => {
      const awaiting = rows.filter(
        (o) => effectiveOfferStatus(o, nowMs) === 'pending' && o.offeredByUserId !== currentUserId,
      );
      const rest = rows.filter(
        (o) => !(effectiveOfferStatus(o, nowMs) === 'pending' && o.offeredByUserId !== currentUserId),
      );
      awaiting.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
      rest.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      return [...awaiting, ...rest];
    },
    [currentUserId, nowMs],
  );

  const receivedOffers = useMemo(
    () => orderRows(scopedOffers.filter((o) => o.sellerId === currentUserId)),
    [scopedOffers, currentUserId, orderRows],
  );
  const sentOffers = useMemo(
    () => orderRows(scopedOffers.filter((o) => o.buyerId === currentUserId)),
    [scopedOffers, currentUserId, orderRows],
  );

  // On first successful load, land the user on the segment that actually
  // has content (received wins ties). Only auto-selects once — afterwards
  // the user's tab choice is respected.
  useEffect(() => {
    if (didAutoSelectSegment.current || offers === null || scopeListingId) return;
    didAutoSelectSegment.current = true;
    if (receivedOffers.length === 0 && sentOffers.length > 0) {
      setSegment('sent');
    }
  }, [offers, scopeListingId, receivedOffers.length, sentOffers.length]);

  // ── Listing meta resolution ──────────────────────────────────────────
  const listingMeta = useMemo(() => {
    const map = new Map<string, ListingMeta>();
    for (const listing of listings) {
      map.set(listing.id, { title: listing.title, image: listing.images?.[0] ?? null });
    }
    listingMetaOverride.forEach((meta, id) => {
      if (!map.has(id) || !map.get(id)?.title) map.set(id, meta);
    });
    return map;
  }, [listings, listingMetaOverride]);

  useEffect(() => {
    if (!offers) return;
    const missing = [...new Set(offers.map((o) => o.listingId))].filter(
      (id) => !listingMeta.has(id) && !listingMetaOverride.has(id),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(
      missing.slice(0, MAX_LISTING_LOOKUPS).map((id) => fetchListingByIdFromApi(id)),
    ).then((results) => {
      if (cancelled) return;
      setListingMetaOverride((prev) => {
        const next = new Map(prev);
        results.forEach((res, i) => {
          const id = missing[i];
          if (res.status === 'fulfilled' && res.value?.listing) {
            const l = res.value.listing;
            next.set(id, { title: l.title ?? undefined, image: l.images?.[0] ?? l.imageUrl ?? null });
          } else {
            // Record the miss so we don't refetch on every render.
            next.set(id, {});
          }
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [offers, listingMeta, listingMetaOverride]);

  // ── Counterparty name resolution ─────────────────────────────────────
  const counterpartyNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const conversation of conversations) {
      for (const participant of conversation.participantProfiles ?? []) {
        const name = participant.displayName || participant.username;
        if (name) map.set(participant.id, name);
      }
    }
    profileNames.forEach((name, id) => {
      if (!map.has(id)) map.set(id, name);
    });
    return map;
  }, [conversations, profileNames]);

  useEffect(() => {
    if (!offers || !currentUserId) return;
    const ids = new Set<string>();
    for (const offer of offers) {
      const counterparty = offer.sellerId === currentUserId ? offer.buyerId : offer.sellerId;
      if (!counterpartyNames.has(counterparty) && !profileNames.has(counterparty)) {
        ids.add(counterparty);
      }
    }
    if (ids.size === 0) return;
    let cancelled = false;
    void Promise.allSettled(
      [...ids].slice(0, MAX_PROFILE_LOOKUPS).map((id) => fetchPublicProfile(id)),
    ).then((results) => {
      if (cancelled) return;
      setProfileNames((prev) => {
        const next = new Map(prev);
        const idList = [...ids].slice(0, MAX_PROFILE_LOOKUPS);
        results.forEach((res, i) => {
          const id = idList[i];
          if (res.status === 'fulfilled' && res.value) {
            next.set(id, res.value.displayName || res.value.username);
          } else {
            next.set(id, '');
          }
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [offers, currentUserId, counterpartyNames, profileNames]);

  const counterpartyLabel = useCallback(
    (offer: ListingOffer): string => {
      const id = offer.sellerId === currentUserId ? offer.buyerId : offer.sellerId;
      const name = counterpartyNames.get(id);
      if (name) return name;
      // Honest role fallback when no profile has resolved yet — never a
      // fabricated name.
      return offer.sellerId === currentUserId ? t('offers.role.buyer') : t('offers.role.seller');
    },
    [currentUserId, counterpartyNames],
  );

  const visibleOffers = segment === 'received' ? receivedOffers : sentOffers;
  const scopedListingTitle = scopeListingId ? listingMeta.get(scopeListingId)?.title : undefined;

  // ── Actions ──────────────────────────────────────────────────────────
  const openCounterFlow = useCallback(
    (offer: ListingOffer) => {
      navigation.navigate('MakeOffer', {
        itemId: offer.listingId,
        price: offer.originalPriceGbp,
        title: listingMeta.get(offer.listingId)?.title ?? t('offers.row.listingFallback'),
        counterOffer: true,
        previousOffer: offer.offerPriceGbp,
        counterRound: offer.counterRound + 1,
        parentOfferId: offer.id,
        conversationId: offer.conversationId ?? undefined,
      });
    },
    [navigation, listingMeta],
  );

  const runConfirmedAction = useCallback(
    async (offer: ListingOffer, action: 'accept' | 'decline' | 'cancel') => {
      if (actingOfferId) return;
      setActingOfferId(offer.id);
      try {
        if (action === 'accept') {
          const result = await acceptListingOfferOnApi(offer.id);
          showSuccess(t('offers.toast.acceptedTitle'), t('offers.toast.acceptedBody'));
          // First-accept-wins declines sibling pending offers — refetch so
          // every row's status stays truthful before navigating away.
          await loadOffers();
          const orderId = result.checkout?.orderId;
          if (orderId) {
            navigation.navigate('OrderDetail', { orderId });
          }
        } else if (action === 'decline') {
          await declineListingOfferOnApi(offer.id);
          setOffers((prev) =>
            prev?.map((o) =>
              o.id === offer.id
                ? { ...o, status: 'declined' as const, declinedAt: new Date().toISOString() }
                : o,
            ) ?? prev,
          );
          showInfo(t('offers.toast.declinedTitle'));
        } else {
          await cancelListingOfferOnApi(offer.id);
          setOffers((prev) =>
            prev?.map((o) =>
              o.id === offer.id
                ? { ...o, status: 'cancelled' as const, cancelledAt: new Date().toISOString() }
                : o,
            ) ?? prev,
          );
          showInfo(t('offers.toast.cancelledTitle'));
        }
      } catch (error) {
        showError(
          t('offers.toast.actionFailedTitle'),
          error instanceof Error ? error.message : t('offers.toast.actionFailedBody'),
        );
        // Restore server truth — a 409/410 means another actor moved first.
        await loadOffers();
      } finally {
        setActingOfferId(null);
      }
    },
    [actingOfferId, loadOffers, navigation, showSuccess, showError, showInfo],
  );

  const handleAction = useCallback(
    (offer: ListingOffer, action: OfferRowAction) => {
      if (isOffline) {
        showError(t('offers.error.offlineTitle'), t('offers.error.offlineBody'));
        return;
      }
      haptic.light();
      if (action === 'counter') {
        openCounterFlow(offer);
        return;
      }
      setConfirm({ visible: true, offer, action });
    },
    [isOffline, showError, haptic, openCounterFlow],
  );

  const handleRowPress = useCallback(
    (offer: ListingOffer) => {
      if (offer.conversationId) {
        navigation.navigate('Chat', { conversationId: offer.conversationId });
      } else {
        navigation.navigate('ItemDetail', { itemId: offer.listingId });
      }
    },
    [navigation],
  );

  const handleRefresh = useCallback(async () => {
    haptic.patterns.refresh();
    setRefreshing(true);
    await loadOffers();
    setRefreshing(false);
  }, [haptic, loadOffers]);

  const confirmCopy = useMemo(() => {
    if (!confirm.offer) return { title: '', message: '', confirmLabel: '' };
    const amount = formatFromFiat(confirm.offer.offerPriceGbp, 'GBP', { displayMode: 'fiat' });
    switch (confirm.action) {
      case 'accept':
        return {
          title: t('offers.confirm.acceptTitle', { amount }),
          message: t('offers.confirm.acceptBody'),
          confirmLabel: t('offers.action.accept'),
        };
      case 'decline':
        return {
          title: t('offers.confirm.declineTitle', { amount }),
          message: t('offers.confirm.declineBody'),
          confirmLabel: t('offers.action.decline'),
        };
      case 'cancel':
      default:
        return {
          title: t('offers.confirm.cancelTitle', { amount }),
          message: t('offers.confirm.cancelBody'),
          confirmLabel: t('offers.action.cancel'),
        };
    }
  }, [confirm.offer, confirm.action, formatFromFiat]);

  const renderRow = useCallback(
    ({ item }: { item: ListingOffer }) => (
      <OfferRow
        offer={item}
        direction={segment === 'received' ? 'received' : 'sent'}
        currentUserId={currentUserId}
        listingTitle={listingMeta.get(item.listingId)?.title}
        listingImageUri={listingMeta.get(item.listingId)?.image ?? null}
        counterpartyLabel={counterpartyLabel(item)}
        nowMs={nowMs}
        isActing={actingOfferId !== null}
        onPress={handleRowPress}
        onAction={handleAction}
      />
    ),
    [segment, currentUserId, listingMeta, counterpartyLabel, nowMs, actingOfferId, handleRowPress, handleAction],
  );

  const emptyState = (() => {
    if (loadError) {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('offers.error.title')}
          subtitle={isOffline ? t('offers.error.offlineBody') : t('offers.error.subtitle')}
          ctaLabel={t('offers.error.retry')}
          onCtaPress={() => {
            setIsLoading(true);
            void loadOffers();
          }}
        />
      );
    }
    if (segment === 'received') {
      return (
        <EmptyState
          icon="pricetag-outline"
          title={t('offers.empty.receivedTitle')}
          subtitle={t('offers.empty.receivedBody')}
        />
      );
    }
    return (
      <EmptyState
        icon="paper-plane-outline"
        title={t('offers.empty.sentTitle')}
        subtitle={t('offers.empty.sentBody')}
      />
    );
  })();

  return (
    <SafeAreaView testID="offers-screen" edges={['top']} style={styles.root}>
      <ScreenHeader
        title={t('offers.header.title')}
        subtitle={scopeListingId ? scopedListingTitle ?? t('offers.header.scopedSub') : undefined}
        onBack={() => navigation.goBack()}
      />

      {/* Segment rail — flat text tabs, selection hairline. When scoped to a
          listing the rail still shows both counts-free tabs; scoping only
          filters the rows. */}
      <View style={styles.segmentRail}>
        {(['received', 'sent'] as const).map((key) => {
          const isActive = segment === key;
          return (
            <AnimatedPressable
              key={key}
              style={styles.segmentTab}
              onPress={() => {
                haptic.light();
                setSegment(key);
              }}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="none"
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={key === 'received' ? t('offers.segment.receivedA11y') : t('offers.segment.sentA11y')}
            >
              <Text
                style={[styles.segmentLabel, isActive ? styles.segmentLabelActive : styles.segmentLabelIdle]}
              >
                {key === 'received' ? t('offers.segment.received') : t('offers.segment.sent')}
              </Text>
              <View style={[styles.segmentIndicator, isActive && styles.segmentIndicatorActive]} />
            </AnimatedPressable>
          );
        })}
      </View>

      {isOffline ? <OfflineBanner message={t('offers.error.offlineBanner')} /> : null}

      {isLoading && offers === null ? (
        <View style={styles.skeletonList} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonLoader width={44} height={44} borderRadius={RadiusRoleValue.mediaThumbnail} />
              <View style={styles.skeletonBody}>
                <SkeletonLoader width="65%" height={15} borderRadius={RadiusRoleValue.compactControl} />
                <SkeletonLoader width="45%" height={12} borderRadius={RadiusRoleValue.compactControl} />
              </View>
              <SkeletonLoader width={56} height={15} borderRadius={RadiusRoleValue.compactControl} />
            </View>
          ))}
        </View>
      ) : (
        <FlashList
          data={visibleOffers}
          keyExtractor={(offer) => offer.id}
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.textMuted}
            />
          }
          ListEmptyComponent={emptyState}
        />
      )}

      <ConfirmationSheet
        visible={confirm.visible}
        onDismiss={() => setConfirm((s) => ({ ...s, visible: false }))}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel || t('offers.confirm.fallback')}
        variant={confirm.action === 'decline' || confirm.action === 'cancel' ? 'danger' : 'default'}
        onConfirm={() => {
          const offer = confirm.offer;
          const action = confirm.action;
          setConfirm((s) => ({ ...s, visible: false }));
          if (offer) void runConfirmedAction(offer, action);
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    segmentRail: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    segmentTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      gap: Space.xxs,
    },
    segmentLabel: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    },
    segmentLabelActive: {
      color: colors.textPrimary,
    },
    segmentLabelIdle: {
      color: colors.textSecondary,
    },
    segmentIndicator: {
      height: 2,
      alignSelf: 'stretch',
      marginHorizontal: Space.xl,
      backgroundColor: 'transparent',
    },
    segmentIndicatorActive: {
      backgroundColor: colors.brand,
    },
    listContent: {
      flexGrow: 1,
      paddingBottom: Space.xxl,
    },
    skeletonList: {
      paddingTop: Space.xs,
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      minHeight: Control.hit + Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    skeletonBody: {
      flex: 1,
      gap: Space.xs,
    },
  });
