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
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { fetchCoOwnAssetById, fetchCoOwnOrderBook, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import {
  CommerceMediaStage,
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
import {
  CoOwnOwnershipPanel,
  CoOwnIssuerCard,
  CoOwnTrustPanel,
  CoOwnRiskDisclosure,
  CoOwnStickyActionDock,
  CoOwnAssetDetailSkeleton,
  CoOwnStateCanvas,
} from '../components/coown';

type RouteT = RouteProp<RootStackParamList, 'AssetDetail'>;
type NavT = StackNavigationProp<RootStackParamList>;

// Local type for recommendation items — replaces the mockData Listing import.
// The recommendation rail returns items that have an `id` field; we only need
// that to navigate to ItemDetail. We do not import the full Listing type from
// mockData because this screen must not depend on mock data types.
interface RecommendationItem {
  id: string;
  [key: string]: unknown;
}

export default function AssetDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const { formatFromFiat } = useFormattedPrice();
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

  // ── Hooks must run before conditional returns (Rules of Hooks) ──
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

  const { data: issuerTrust } = useSellerTrust(asset?.issuerId);

  const headerStyle = useAnimatedStyle(() => {
    const threshold = 200;
    const opacity = interpolate(scrollY.value, [threshold - 60, threshold], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" style={isDark ? 'light' : 'dark'} />
        <CoOwnAssetDetailSkeleton />
      </View>
    );
  }

  if (isError || !asset) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" style={isDark ? 'light' : 'dark'} />
        <CoOwnStateCanvas
          variant="error"
          title="Item not found"
          subtitle="This Co-Own item may have been delisted or does not exist."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </View>
    );
  }

  const isIssuer = currentUser?.id === asset.issuerId;
  const isHolder = yourUnits > 0;
  const issuerUsername = issuerTrust?.username || 'Issuer';
  const canMessageIssuer = currentUser?.id !== asset.issuerId;

  const availableUnits = Math.max(0, asset.availableUnits);
  const totalUnits = asset.totalUnits;
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const viewerPct = totalUnits > 0 ? Math.round((yourUnits / totalUnits) * 100 * 10) / 10 : 0;
  const feePct = Math.round(CO_OWN_FEE_RATE * 100);

  const bestBid = orderBook.bids.length > 0 ? orderBook.bids[0] : null;
  const bestAsk = orderBook.asks.length > 0 ? orderBook.asks[0] : null;

  const images = asset.imageUrl ? [asset.imageUrl] : [];

  const recommendationSections = recommendationsData?.sections ?? [];
  const railSections = recommendationSections.filter(
    (s) => s.key !== 'seen_in_looks' && s.key !== 'continue_exploring'
  );
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');

  const handlePressRecommendation = (recItem: RecommendationItem) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };
  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  const familyStateAccent = !asset.isOpen ? 'Closed' : availableUnits <= 0 ? 'Unavailable' : 'Open';

  const settlementLabel = asset.settlementMode === 'GBP' ? 'GBP' : asset.settlementMode === 'TVUSD' ? 'TVUSD' : 'GBP + TVUSD';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" style={isDark ? 'light' : 'dark'} />

      {/* Collapsed header — appears on scroll */}
      <Reanimated.View style={[styles.collapsedHeader, { paddingTop: Math.max(insets.top, Space.sm), backgroundColor: colors.background }, headerStyle]}>
        <View style={styles.collapsedRow}>
          <AnimatedPressable
            style={[styles.collapsedBackBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            scaleValue={0.92}
            hapticFeedback="light"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={[styles.collapsedTitle, { color: colors.textPrimary }]} numberOfLines={1}>{asset.title}</Text>
          <AnimatedPressable
            style={[styles.collapsedBackBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => navigation.navigate('CoOwnOrderHistory')}
            accessibilityLabel="View order history"
            accessibilityRole="button"
            scaleValue={0.92}
            hapticFeedback="light"
          >
            <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 100 }}
      >
        {/* Hero — large media stage */}
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
          heightFraction={0.65}
          onOpenFullscreen={handleOpenFullscreen}
          overlayTopContent={
            <View style={styles.familyBadgeOverlay}>
              <ProductFamilyBadge family="co_own" stateAccent={familyStateAccent} compact />
            </View>
          }
        />

        {/* Product identity block — flat editorial section */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(80)}
          style={styles.identityStage}
        >
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Co-Own item</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{asset.title}</Text>
          {asset.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{asset.description}</Text>
          ) : null}
        </Reanimated.View>

        {/* Issuer card — trustworthy identity */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(120)}
          style={styles.sectionWrap}
        >
          <CoOwnIssuerCard
            username={issuerUsername}
            avatarUri={issuerTrust?.avatar ?? null}
            verified={issuerTrust?.verified}
            rating={issuerTrust?.rating ?? null}
            reviewCount={issuerTrust?.reviewCount ?? null}
            location={issuerTrust?.location ?? null}
            memberSince={issuerTrust?.memberSince ?? null}
            onPress={() => navigation.navigate('UserProfile', { userId: asset.issuerId })}
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
            canMessage={canMessageIssuer}
          />
        </Reanimated.View>

        {/* Ownership panel — clear, visual, understandable */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(160)}
          style={styles.sectionWrap}
        >
          <CoOwnOwnershipPanel
            unitPriceLabel={formatFromFiat(asset.unitPriceGbp, 'GBP')}
            totalUnits={totalUnits}
            availableUnits={availableUnits}
            allocatedPct={allocatedPct}
            viewerUnits={yourUnits}
            viewerPct={viewerPct}
            settlementMode={asset.settlementMode}
            feePct={feePct}
            holderCount={asset.holders}
            status={asset.isOpen ? (availableUnits > 0 ? 'open' : 'closed') : 'paused'}
          />
        </Reanimated.View>

        {/* Category evidence — editorial details when available */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(180)}
          style={styles.sectionWrap}
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

        {/* Trust panel — authenticity, protection, storage */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(200)}
          style={styles.sectionWrap}
        >
          <CoOwnTrustPanel
            authenticityStatus={asset.authenticityStatus ?? null}
            buyerProtection={asset.buyerProtection ?? false}
            storageInfo={asset.storageInfo ?? null}
            possessionInfo={asset.possessionInfo ?? null}
          />
        </Reanimated.View>

        {/* Risk disclosure — honest limitations */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(240)}
          style={styles.sectionWrap}
        >
          <CoOwnRiskDisclosure
            onReportIssue={() => navigation.navigate('CoOwnIssue', { assetId: asset.id })}
          />
        </Reanimated.View>

        {/* Order book — secondary, collapsed by default */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(280)}
          style={styles.sectionWrap}
        >
          <Pressable
            style={[styles.collapsibleHeader, { borderColor: colors.border }]}
            onPress={() => setOrderBookExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={orderBookExpanded ? 'Collapse live market' : 'Expand live market'}
            accessibilityState={{ expanded: orderBookExpanded }}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Live market</Text>
              <Text style={[styles.collapsibleSubtext, { color: colors.textMuted }]}>
                {orderBook.bids.length + orderBook.asks.length} offers
              </Text>
            </View>
            <Ionicons
              name={orderBookExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
          {orderBookExpanded && (
            <View style={[styles.orderBookGrid, { borderColor: colors.border }]}>
              <View style={styles.orderBookCol}>
                <View style={styles.orderBookHeader}>
                  <Ionicons name="arrow-up-circle-outline" size={14} color={colors.success} />
                  <Text style={[styles.orderBookHeaderText, { color: colors.textSecondary }]}>Buy interest</Text>
                </View>
                {bestBid && (
                  <Text style={[styles.orderBookBest, { color: colors.textPrimary }]}>
                    Best: {formatFromFiat(bestBid.unitPriceGbp, 'GBP')}
                  </Text>
                )}
                {orderBook.bids.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`bid-${i}`} style={styles.orderBookRow}>
                    <Text style={[styles.orderBookPrice, { color: colors.textPrimary }]}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Text>
                    <Text style={[styles.orderBookUnits, { color: colors.textSecondary }]}>{entry.units}u</Text>
                  </View>
                ))}
                {orderBook.bids.length === 0 && (
                  <Text style={[styles.orderBookEmpty, { color: colors.textMuted }]}>No buy interest yet</Text>
                )}
              </View>

              <View style={[styles.orderBookDivider, { backgroundColor: colors.border }]} />

              <View style={styles.orderBookCol}>
                <View style={styles.orderBookHeader}>
                  <Ionicons name="arrow-down-circle-outline" size={14} color={colors.danger} />
                  <Text style={[styles.orderBookHeaderText, { color: colors.textSecondary }]}>Sell availability</Text>
                </View>
                {bestAsk && (
                  <Text style={[styles.orderBookBest, { color: colors.textPrimary }]}>
                    Best: {formatFromFiat(bestAsk.unitPriceGbp, 'GBP')}
                  </Text>
                )}
                {orderBook.asks.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`ask-${i}`} style={styles.orderBookRow}>
                    <Text style={[styles.orderBookPrice, { color: colors.textPrimary }]}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Text>
                    <Text style={[styles.orderBookUnits, { color: colors.textSecondary }]}>{entry.units}u</Text>
                  </View>
                ))}
                {orderBook.asks.length === 0 && (
                  <Text style={[styles.orderBookEmpty, { color: colors.textMuted }]}>No sell offers yet</Text>
                )}
              </View>
            </View>
          )}
        </Reanimated.View>

        {/* Buyout link — only for holders, non-issuers */}
        {isHolder && !isIssuer && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(300)}
            style={styles.sectionWrap}
          >
            <Pressable
              style={[styles.buyoutLink, { borderColor: colors.border }]}
              onPress={() => navigation.navigate('Buyout', { assetId: asset.id })}
              accessibilityRole="button"
              accessibilityLabel="Open buyout options for your units"
            >
              <Ionicons name="swap-horizontal-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.buyoutLinkText, { color: colors.textSecondary }]}>Buyout options</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </Pressable>
          </Reanimated.View>
        )}

        {/* Seen in Looks */}
        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={asset.listingId}
              onPressItem={(recItem) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as RecommendationItem);
                }
              }}
            />
          </View>
        )}

        {/* Personalised recommendation rails */}
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
                    handlePressRecommendation(recItem as RecommendationItem);
                  }
                }}
              />
            </View>
          ))
        )}
      </Reanimated.ScrollView>

      {/* Sticky action dock — viewer-specific CTAs */}
      <CoOwnStickyActionDock>
        {isIssuer ? (
          <View style={[styles.issuerDock, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="storefront-outline" size={16} color={colors.brand} />
            <Text style={[styles.issuerDockText, { color: colors.textPrimary }]}>
              Issuer view · {availableUnits} units in treasury
            </Text>
          </View>
        ) : !asset.isOpen ? (
          <View style={[styles.issuerDock, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="pause-circle-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.issuerDockText, { color: colors.textSecondary }]}>
              Paused · trading temporarily unavailable
            </Text>
          </View>
        ) : availableUnits === 0 && !isHolder ? (
          <View style={[styles.issuerDock, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.issuerDockText, { color: colors.textSecondary }]}>
              Fully allocated · check secondary market
            </Text>
          </View>
        ) : (
          <View style={styles.dockRow}>
            <View style={styles.dockPriceSection}>
              <Text style={[styles.dockPriceLabel, { color: colors.textMuted }]}>Unit price</Text>
              <Text style={[styles.dockPriceValue, { color: colors.textPrimary }]}>{formatFromFiat(asset.unitPriceGbp, 'GBP')}</Text>
            </View>
            <View style={styles.dockActions}>
              {isHolder && (
                <AnimatedPressable
                  style={[styles.dockSecondaryBtn, { borderColor: colors.border }]}
                  onPress={() => navigation.navigate('Trade', { assetId: asset.id, side: 'sell' })}
                  accessibilityLabel="Sell your units"
                  accessibilityRole="button"
                  scaleValue={0.97}
                  hapticFeedback="medium"
                >
                  <Text style={[styles.dockSecondaryText, { color: colors.textPrimary }]}>Sell</Text>
                </AnimatedPressable>
              )}
              <AppButton
                title={isHolder ? 'Buy more' : 'Buy units'}
                variant="primary"
                size="md"
                onPress={() => navigation.navigate('Trade', { assetId: asset.id, side: 'buy' })}
                accessibilityLabel={isHolder ? 'Buy more units' : 'Buy units in this Co-Own'}
                style={styles.dockPrimaryBtn}
                hapticFeedback="medium"
              />
            </View>
          </View>
        )}
      </CoOwnStickyActionDock>

      {/* Save to collection + share */}
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

      {/* Fullscreen media viewer */}
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
  },
  collapsedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  collapsedBackBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedTitle: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginHorizontal: Space.sm,
  },
  identityStage: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.xs,
  },
  eyebrow: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: Type.display.size,
    fontFamily: Typography.family.bold,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: 22,
    marginTop: Space.xs,
  },
  sectionWrap: {
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  collapsibleSubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  orderBookGrid: {
    flexDirection: 'row',
    paddingTop: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderBookCol: {
    flex: 1,
    gap: Space.xs,
  },
  orderBookDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Space.md,
  },
  orderBookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Space.xs,
  },
  orderBookHeaderText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  orderBookBest: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    marginBottom: Space.xs,
  },
  orderBookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  orderBookPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  orderBookUnits: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  orderBookEmpty: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
  },
  buyoutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  buyoutLinkText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  recommendationSection: {
    marginTop: Space.lg,
  },
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
  issuerDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
  },
  issuerDockText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  dockPriceSection: {
    gap: 2,
  },
  dockPriceLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  dockPriceValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  dockActions: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  dockSecondaryBtn: {
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  dockSecondaryText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  dockPrimaryBtn: {
    minWidth: 140,
  },
});
