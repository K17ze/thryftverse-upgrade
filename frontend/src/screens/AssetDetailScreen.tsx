import React from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInDown,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Headline } from '../components/ui/Text';
import { FinancialDisclosure } from '../components/FinancialDisclosure';
import { fetchCoOwnAssetById, fetchCoOwnOrderBook, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import { toIze, formatIzeAmount } from '../utils/currency';
import {
  CommerceMediaStage,
  CommerceStickyDock,
  CommerceStateCanvas,
  CommercePartyStrip,
  CategoryEvidence,
} from '../components/commerce';
import { ProductFamilyBadge, RecommendationRail, FullscreenMediaViewer } from '../components/product';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import { resolveCoOwnConversation } from '../utils/coOwnMessaging';
import {
  buildCoOwnViewModel,
  useProductSocialState,
  useRecommendations,
  useSellerTrust,
  isRecommendationLook,
} from '../platform/product';
import type { RecommendationLook } from '../platform/product';
import { Listing } from '../data/mockData';

type RouteT = RouteProp<RootStackParamList, 'AssetDetail'>;
type NavT = StackNavigationProp<RootStackParamList>;

export default function AssetDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const { formatFromFiat, goldRates, displayMode } = useFormattedPrice();
  const { show } = useToast();

  const assetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<any>(null);
  const [orderBook, setOrderBook] = React.useState<{ bids: any[]; asks: any[] }>({ bids: [], asks: [] });
  const [yourUnits, setYourUnits] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);
  const [fullscreenVisible, setFullscreenVisible] = React.useState(false);
  const [orderBookExpanded, setOrderBookExpanded] = React.useState(false);

  const handleOpenFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  };

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  React.useEffect(() => {
    if (!assetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      fetchCoOwnAssetById(assetId),
      fetchCoOwnOrderBook(assetId, { limit: 40 }).catch(() => ({ bids: [], asks: [] })),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([fetchedAsset, fetchedBook, holdings]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        setOrderBook(fetchedBook);
        const holding = holdings.find((h) => h.assetId === assetId);
        setYourUnits(holding?.unitsOwned ?? 0);
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
  }, [assetId, currentUser?.id, show]);

  // ── PRODUCT-01: unified view model + shared social state + recommendations ──
  // NOTE: these hooks MUST run before any conditional return so the hook count
  // stays stable across loading → loaded (Rules of Hooks). They are null-safe.
  const viewModel = React.useMemo(() => {
    if (!asset) return null;
    return buildCoOwnViewModel({
      asset,
      viewerUnits: yourUnits,
      orderBook,
      currentUserId: currentUser?.id,
    });
  }, [asset, yourUnits, orderBook, currentUser?.id]);

  const social = useProductSocialState(viewModel);

  const { data: recommendationsData, isLoading: recsLoading } = useRecommendations(
    asset?.listingId
  );

  // Real issuer identity (brief §8: do not derive identity by slicing a UUID).
  const { data: issuerTrust } = useSellerTrust(asset?.issuerId);

  const headerStyle = useAnimatedStyle(() => {
    const threshold = 200;
    const opacity = interpolate(scrollY.value, [threshold - 60, threshold], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CommerceStateCanvas state="loading" />
      </View>
    );
  }

  if (isError || !asset) {
    return (
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CommerceStateCanvas
          state="error"
          title="Asset not found"
          message="This co-own may have been delisted or does not exist yet."
          onRetry={() => navigation.navigate('CoOwnHub')}
          retryLabel="Back to hub"
        />
      </View>
    );
  }

  const deltaPct = asset.marketMovePct24h ?? 0;
  const isIssuer = currentUser?.id === asset.issuerId;
  const isHolder = yourUnits > 0;
  // Real issuer identity from /sellers/:id; fall back to a truthful label
  // (never a sliced UUID fabricated as a @handle). Brief §8.
  const issuerUsername = issuerTrust?.username || 'issuer';
  const issuerDisplayName = issuerTrust?.username || 'Issuer';
  const canMessageIssuer = currentUser?.id !== asset.issuerId;

  const unitPriceIze = goldRates && displayMode !== 'fiat'
    ? formatIzeAmount(toIze(asset.unitPriceGbp, 'GBP', goldRates))
    : null;

  const yourPositionValue = yourUnits * asset.unitPriceGbp;
  const yourPositionIze = goldRates && displayMode !== 'fiat'
    ? formatIzeAmount(toIze(yourPositionValue, 'GBP', goldRates))
    : null;

  const availableUnits = Math.max(0, asset.availableUnits);
  const totalUnits = asset.totalUnits;
  const availablePct = totalUnits > 0 ? (availableUnits / totalUnits) * 100 : 0;

  const bestBid = orderBook.bids.length > 0 ? orderBook.bids[0] : null;
  const bestAsk = orderBook.asks.length > 0 ? orderBook.asks[0] : null;

  // Ownership distribution: only show authoritative accounts.
  // The backend provides aggregate holder count (asset.holders) but does NOT
  // provide individual holder identities or per-holder unit distribution.
  // Do NOT fabricate "other holders" by subtraction — that invents data.
  const ownerAccounts: Array<{ id: string; handle: string; role: string; units: number; isYou?: boolean }> = [];
  ownerAccounts.push({
    id: `issuer_${asset.issuerId}`,
    handle: `@${issuerUsername}`,
    role: 'Issuer treasury',
    units: availableUnits,
  });
  if (isHolder) {
    ownerAccounts.push({
      id: 'you',
      handle: currentUser ? `@${currentUser.username}` : '@you',
      role: 'Your position',
      units: yourUnits,
      isYou: true,
    });
  }
  const allocatedUnits = ownerAccounts.reduce((sum, account) => sum + account.units, 0);
  const remainingUnits = Math.max(0, totalUnits - allocatedUnits);

  const images = asset.imageUrl ? [asset.imageUrl] : [];

  const recommendationSections = recommendationsData?.sections ?? [];
  const railSections = recommendationSections.filter(
    (s) => s.key !== 'seen_in_looks' && s.key !== 'continue_exploring'
  );
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');

  const handlePressRecommendation = (recItem: Listing) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };
  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  const familyStateAccent = !asset.isOpen ? 'Closed' : availableUnits <= 0 ? 'Unavailable' : 'Open';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      <Reanimated.View style={[styles.collapsedHeader, { paddingTop: Math.max(insets.top, Space.sm) }, headerStyle]}>
        <View style={styles.collapsedRow}>
          <AnimatedPressable
            style={styles.collapsedBackBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.collapsedTitle} numberOfLines={1}>{asset.title}</Text>
          <AnimatedPressable
            style={styles.collapsedBackBtn}
            onPress={() => navigation.navigate('CoOwnOrderHistory')}
            accessibilityLabel="View order history"
            accessibilityRole="button"
          >
            <Ionicons name="time-outline" size={20} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 100 }}
      >
        <CommerceMediaStage
          images={images}
          objectId={asset.id}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={social.openShare}
          onSave={social.openCollectionPicker}
          onToggleFav={social.toggleLike}
          isFav={social.isLiked}
          isSaved={social.isSavedToCollection}
          showSaveControl
          showFavControl
          heightFraction={0.55}
          onOpenFullscreen={handleOpenFullscreen}
          overlayTopContent={
            <View style={styles.familyBadgeOverlay}>
              <ProductFamilyBadge family="co_own" stateAccent={familyStateAccent} compact />
            </View>
          }
        />

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(80)}
          style={styles.identityStage}
        >
          <Text style={styles.assetEyebrow}>Co-own asset</Text>
          <Headline style={styles.assetTitle} numberOfLines={2}>{asset.title}</Headline>

          <View style={styles.priceStage}>
            <View style={styles.pricePrimary}>
              <Text style={styles.priceLabel}>Unit price</Text>
              <Text style={styles.priceValue}>{formatFromFiat(asset.unitPriceGbp, 'GBP')}</Text>
              {unitPriceIze && (
                <Text style={styles.priceIze}>{unitPriceIze}</Text>
              )}
            </View>

            {deltaPct !== 0 && (
              <View style={[styles.deltaPill, deltaPct >= 0 ? styles.deltaUp : styles.deltaDown]}>
                <Ionicons
                  name={deltaPct >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
                  size={13}
                  color={deltaPct >= 0 ? Colors.success : Colors.danger}
                />
                <Text style={[styles.deltaText, { color: deltaPct >= 0 ? Colors.success : Colors.danger }]}>
                  {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%
                </Text>
              </View>
            )}
          </View>

          <View style={styles.availabilityRow}>
            <View style={styles.availabilityInfo}>
              <Text style={styles.availabilityLabel}>Available</Text>
              <Text style={styles.availabilityValue}>
                {availableUnits} / {totalUnits} units
              </Text>
            </View>
            <View style={styles.availabilityBar}>
              <View style={[styles.availabilityFill, { width: `${availablePct}%` }]} />
            </View>
          </View>

          {isHolder && (
            <View style={styles.positionCard}>
              <View style={styles.positionHeader}>
                <Ionicons name="wallet-outline" size={16} color={Colors.brand} />
                <Text style={styles.positionTitle}>Your position</Text>
              </View>
              <View style={styles.positionRow}>
                <View style={styles.positionMetric}>
                  <Text style={styles.positionMetricLabel}>Units</Text>
                  <Text style={styles.positionMetricValue}>{yourUnits}</Text>
                </View>
                <View style={styles.positionMetric}>
                  <Text style={styles.positionMetricLabel}>Value</Text>
                  <Text style={styles.positionMetricValue}>{formatFromFiat(yourPositionValue, 'GBP')}</Text>
                </View>
                {yourPositionIze && (
                  <View style={styles.positionMetric}>
                    <Text style={styles.positionMetricLabel}>1ZE</Text>
                    <Text style={styles.positionMetricValueSmall}>{yourPositionIze}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </Reanimated.View>

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(130)}
        >
          <CommercePartyStrip
            party={{
              id: asset.issuerId,
              username: issuerUsername,
              displayName: issuerDisplayName,
              avatar: issuerTrust?.avatar || null,
              location: issuerTrust?.location || null,
              roleLabel: 'Issuer',
            }}
            facts={[
              { label: 'Settlement', value: asset.settlementMode },
              { label: 'Total supply', value: `${totalUnits}u` },
            ]}
            onOpenProfile={() => navigation.navigate('UserProfile', { userId: asset.issuerId })}
            onMessage={canMessageIssuer ? async () => {
              if (!currentUser?.id) {
                show('Sign in to message the issuer.', 'error');
                return;
              }
              if (isResolvingConversation) return;
              setIsResolvingConversation(true);
              try {
                const conversation = await resolveCoOwnConversation(
                  currentUser.id,
                  asset.issuerId,
                  issuerUsername,
                  asset.listingId,
                );
                upsertConversation(conversation);
                navigation.navigate('Chat', {
                  conversationId: conversation.id,
                  focusQuery: issuerUsername,
                  partnerUserId: asset.issuerId,
                });
              } catch {
                show('Unable to open conversation. Please try again.', 'error');
              } finally {
                setIsResolvingConversation(false);
              }
            } : undefined}
            messageLabel="Message"
          />
        </Reanimated.View>

        {/* ── Asset evidence — editorial details when available ── */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(160)}
        >
          {(() => {
            const evidenceGroups = resolveEvidenceGroups({
              category: asset.category,
              condition: asset.conditionLabel,
              description: asset.description,
            });
            return evidenceGroups.length > 0 ? (
              <CategoryEvidence groups={evidenceGroups} />
            ) : null;
          })()}
        </Reanimated.View>

        {/* ── Ownership summary (before order book — user understands ownership first) ── */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(180)}
          style={styles.sectionWrap}
        >
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Ownership</Text>
            {ownerAccounts.map((account) => (
              <View key={account.id} style={styles.ownerRow}>
                <View style={styles.ownerInfo}>
                  <Text style={[styles.ownerHandle, account.isYou && styles.ownerHandleYou]} numberOfLines={1}>
                    {account.handle}
                  </Text>
                  <Text style={styles.ownerRole}>{account.role}</Text>
                </View>
                <View style={styles.ownerRight}>
                  <Text style={styles.ownerUnits}>{account.units}u</Text>
                  <Text style={styles.ownerPct}>
                    {totalUnits > 0 ? ((account.units / totalUnits) * 100).toFixed(1) : 0}%
                  </Text>
                </View>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total supply</Text>
              <Text style={styles.totalValue}>{totalUnits}u</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total holders</Text>
              <Text style={styles.totalValue}>{asset.holders}</Text>
            </View>
            {isHolder && !isIssuer && (
              <Pressable
                style={styles.buyoutLink}
                onPress={() => navigation.navigate('Buyout', { assetId: asset.id })}
                accessibilityRole="button"
                accessibilityLabel="Open buyout options for your units"
              >
                <Ionicons name="swap-horizontal-outline" size={14} color={Colors.brand} />
                <Text style={styles.buyoutLinkText}>Buyout options</Text>
                <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        </Reanimated.View>

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(280)}
          style={styles.sectionWrap}
        >
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Asset details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Settlement</Text>
              <Text style={styles.detailValue}>{asset.settlementMode}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total units</Text>
              <Text style={styles.detailValue}>{totalUnits}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Available</Text>
              <Text style={styles.detailValue}>{availableUnits}</Text>
            </View>
            {asset.holders != null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Holders</Text>
                <Text style={styles.detailValue}>{asset.holders}</Text>
              </View>
            )}
          </View>
        </Reanimated.View>

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(330)}
          style={styles.sectionWrap}
        >
          <FinancialDisclosure />
        </Reanimated.View>

        {/* ── Order book (secondary, collapsible — after user understands item, issuer, ownership, risk) ── */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(350)}
          style={styles.sectionWrap}
        >
          <Pressable
            style={styles.collapsibleHeader}
            onPress={() => setOrderBookExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={orderBookExpanded ? 'Collapse order book' : 'Expand order book'}
            accessibilityState={{ expanded: orderBookExpanded }}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Text style={styles.sectionTitle}>Live market</Text>
              <Text style={styles.collapsibleSubtext}>
                {orderBook.bids.length + orderBook.asks.length} offers
              </Text>
            </View>
            <Ionicons
              name={orderBookExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={18}
              color={Colors.textSecondary}
            />
          </Pressable>
          {orderBookExpanded && (
            <View style={styles.orderBookGrid}>
              <View style={styles.orderBookCol}>
                <View style={styles.orderBookHeader}>
                  <Ionicons name="arrow-up-circle-outline" size={14} color={Colors.success} />
                  <Text style={styles.orderBookHeaderText}>Buy interest</Text>
                </View>
                {bestBid && (
                  <Text style={styles.orderBookBest}>
                    Best: {formatFromFiat(bestBid.unitPriceGbp, 'GBP')}
                  </Text>
                )}
                {orderBook.bids.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`bid-${i}`} style={styles.orderBookRow}>
                    <Text style={styles.orderBookPrice}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Text>
                    <Text style={styles.orderBookUnits}>{entry.units}u</Text>
                  </View>
                ))}
                {orderBook.bids.length === 0 && (
                  <Text style={styles.orderBookEmpty}>No buy interest yet</Text>
                )}
              </View>

              <View style={styles.orderBookDivider} />

              <View style={styles.orderBookCol}>
                <View style={styles.orderBookHeader}>
                  <Ionicons name="arrow-down-circle-outline" size={14} color={Colors.danger} />
                  <Text style={styles.orderBookHeaderText}>Sell availability</Text>
                </View>
                {bestAsk && (
                  <Text style={styles.orderBookBest}>
                    Best: {formatFromFiat(bestAsk.unitPriceGbp, 'GBP')}
                  </Text>
                )}
                {orderBook.asks.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`ask-${i}`} style={styles.orderBookRow}>
                    <Text style={styles.orderBookPrice}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Text>
                    <Text style={styles.orderBookUnits}>{entry.units}u</Text>
                  </View>
                ))}
                {orderBook.asks.length === 0 && (
                  <Text style={styles.orderBookEmpty}>No sell offers yet</Text>
                )}
              </View>
            </View>
          )}
        </Reanimated.View>

        {/* ── Price history (honest unavailable state) ── */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(370)}
          style={styles.sectionWrap}
        >
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Price history</Text>
            <View style={styles.priceHistoryEmpty}>
              <Ionicons name="analytics-outline" size={24} color={Colors.textMuted} />
              <Text style={styles.priceHistoryEmptyText}>
                Price history is not available
              </Text>
              <Text style={styles.priceHistoryEmptySub}>
                Historical price data will appear here once the secondary market has sufficient trading activity.
              </Text>
            </View>
          </View>
        </Reanimated.View>

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(380)}
          style={styles.sectionWrap}
        >
          <Pressable
            style={styles.reportLink}
            onPress={() => navigation.navigate('CoOwnIssue', { assetId: asset.id })}
            accessibilityRole="button"
            accessibilityLabel="Report an issue with this asset"
          >
            <Ionicons name="flag-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.reportLinkText}>Report issue</Text>
          </Pressable>
        </Reanimated.View>

        {/* ── PRODUCT-01: Seen in Looks ── */}
        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={asset.listingId}
              onPressItem={(recItem) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as Listing);
                }
              }}
            />
          </View>
        )}

        {/* ── PRODUCT-01: Personalised recommendation rails via underlying listingId ── */}
        {recsLoading && railSections.length === 0 ? null : (
          railSections.map((section) => (
            <View key={section.key} style={styles.recommendationSection}>
              <RecommendationRail
                section={section}
                listingId={asset.listingId}
                onPressItem={(recItem) => {
                  if (isRecommendationLook(recItem)) {
                    handlePressLook(recItem);
                  } else {
                    handlePressRecommendation(recItem as Listing);
                  }
                }}
              />
            </View>
          ))
        )}
      </Reanimated.ScrollView>

      <CommerceStickyDock bottomInset={insets.bottom}>
        {isIssuer ? (
          <View style={styles.issuerDock}>
            <Ionicons name="storefront-outline" size={16} color={Colors.brand} />
            <Text style={styles.issuerDockText}>
              Issuer view · {availableUnits} units in treasury
            </Text>
          </View>
        ) : availableUnits === 0 && !isHolder ? (
          <View style={styles.issuerDock}>
            <Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.issuerDockText}>
              Fully allocated · check secondary market
            </Text>
          </View>
        ) : (
          <View style={styles.dockRow}>
            <View style={styles.dockPriceSection}>
              <Text style={styles.dockPriceLabel}>Unit price</Text>
              <Text style={styles.dockPriceValue}>{formatFromFiat(asset.unitPriceGbp, 'GBP')}</Text>
            </View>
            <View style={styles.dockActions}>
              {isHolder && (
                <AnimatedPressable
                  style={styles.dockSecondaryBtn}
                  onPress={() => navigation.navigate('Trade', { assetId: asset.id, side: 'sell' })}
                  accessibilityLabel="Sell your units"
                  accessibilityRole="button"
                >
                  <Text style={styles.dockSecondaryText}>Sell</Text>
                </AnimatedPressable>
              )}
              <AppButton
                title={isHolder ? 'Buy more' : 'Buy units'}
                variant="primary"
                size="md"
                onPress={() => navigation.navigate('Trade', { assetId: asset.id, side: 'buy' })}
                accessibilityLabel={isHolder ? 'Buy more units' : 'Buy units in this Co-own'}
                style={styles.dockPrimaryBtn}
              />
            </View>
          </View>
        )}
      </CommerceStickyDock>

      {/* ── PRODUCT-01: Save to collection + share (shared social actions) ── */}
      <SaveToCollectionModal
        visible={social.collectionModalVisible}
        itemId={asset.id}
        onClose={social.closeCollectionPicker}
      />
      <ShareSheet
        visible={social.shareVisible}
        onDismiss={social.closeShare}
        url={`https://thryftverse.com/asset/${asset.id}`}
        title={asset.title}
      />

      {/* ── Fullscreen media viewer (was a no-op, PRODUCT-MASTER defect #3) ── */}
      <FullscreenMediaViewer
        images={images}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onClose={() => setFullscreenVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  collapsedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    zIndex: 50,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collapsedBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: Space.sm,
  },
  identityStage: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  assetEyebrow: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  assetTitle: {
    marginBottom: Space.md,
  },
  priceStage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  pricePrimary: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  priceIze: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  deltaUp: {
    backgroundColor: Colors.success + '12',
    borderColor: Colors.success + '30',
  },
  deltaDown: {
    backgroundColor: Colors.danger + '12',
    borderColor: Colors.danger + '30',
  },
  deltaText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
    gap: Space.md,
  },
  availabilityInfo: {
    flexShrink: 0,
  },
  availabilityLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  availabilityValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  availabilityBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 3,
    overflow: 'hidden',
  },
  availabilityFill: {
    height: '100%',
    backgroundColor: Colors.brand,
    borderRadius: 3,
  },
  positionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.md,
    borderWidth: 1,
    borderColor: Colors.brand + '30',
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.sm,
  },
  positionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  positionRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  positionMetric: {
    flex: 1,
  },
  positionMetricLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  positionMetricValue: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  positionMetricValueSmall: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  sectionWrap: {
    paddingHorizontal: Space.md,
    marginTop: Space.sm,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  collapsibleHeaderLeft: {
    flex: 1,
  },
  collapsibleSubtext: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  orderBookGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    paddingTop: Space.sm,
    marginTop: Space.xs,
  },
  orderBookCol: {
    flex: 1,
  },
  orderBookDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
  },
  orderBookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Space.xs,
  },
  orderBookHeaderText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  orderBookBest: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: Space.xs,
  },
  orderBookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  orderBookPrice: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  orderBookUnits: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  orderBookEmpty: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.xs,
    fontStyle: 'italic',
  },
  ownerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerHandle: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  ownerHandleYou: {
    color: Colors.brand,
  },
  ownerRole: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  ownerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  ownerUnits: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  ownerPct: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: Space.xs,
    paddingTop: Space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  buyoutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.sm,
    paddingVertical: Space.xs,
  },
  buyoutLinkText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  priceHistoryEmpty: {
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  priceHistoryEmptyText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  priceHistoryEmptySub: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  reportLinkText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  dockPriceSection: {
    flex: 1,
  },
  dockPriceLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  dockPriceValue: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  dockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  dockPrimaryBtn: {
    minWidth: 100,
  },
  dockSecondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockSecondaryText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  issuerDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  issuerDockText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  familyBadgeOverlay: {
    alignItems: 'flex-start',
  },
  recommendationSection: {
    marginTop: Space.md,
  },
});