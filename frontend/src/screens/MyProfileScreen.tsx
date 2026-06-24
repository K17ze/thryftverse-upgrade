import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  Share,
  Pressable,
} from 'react-native';
import { EmptyState } from '../components/EmptyState';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { Typography, Space, Radius } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipProfileMedia } from '../components/flagship';
import { LookPreviewCard } from '../components/profile';
import { MyProfileIdentityHero } from '../components/profile/MyProfileIdentityHero';
import { ProfileUtilityRail } from '../components/profile/ProfileUtilityRail';
import { MyProfileTabRail } from '../components/profile/MyProfileTabRail';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { isVideoUri } from '../utils/media';
import { fetchLooksFromApi, type LookApiItem } from '../services/looksApi';
import { fetchPosterHighlights } from '../services/postersApi';
import type { PosterHighlight } from '../services/postersApi';
import { ProfileHighlightsRow } from '../components/poster/ProfileHighlightsRow';

type NavT = StackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COVER_HEIGHT = 180;

export default function MyProfileScreen() {
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const reducedMotionEnabled = useReducedMotion();
  const [activeTab, setActiveTab] = React.useState<'listings' | 'looks' | 'about'>('listings');

  const { show } = useToast();
  const haptic = useHaptic();

  const { formatFromFiat } = useFormattedPrice();

  const { listings } = useBackendData();
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);
  const updateUserProfile = useStore((state) => state.updateUserProfile);

  const currentUser = useStore((state) => state.currentUser);

  const [coOwnHoldings, setCoOwnHoldings] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    Promise.all([
      listCoOwnAssets({ limit: 120 }),
      fetchCoOwnHoldings(currentUser.id).catch(() => []),
    ])
      .then(([assets, holdings]) => {
        if (cancelled) return;
        const holdingMap = new Map<string, { units: number; avgEntry: number; realized: number }>();
        for (const h of holdings) {
          holdingMap.set(h.assetId, { units: h.unitsOwned, avgEntry: h.avgEntryPriceGbp, realized: h.realizedPnlGbp });
        }
        const merged = assets
          .filter((a) => (holdingMap.get(a.id)?.units ?? 0) > 0)
          .map((a) => {
            const h = holdingMap.get(a.id);
            return {
              id: a.id,
              title: a.title,
              image: a.imageUrl ?? '',
              totalUnits: a.totalUnits,
              availableUnits: a.availableUnits,
              unitPriceGBP: a.unitPriceGbp,
              unitPriceStable: a.unitPriceStable,
              settlementMode: a.settlementMode,
              issuerId: a.issuerId,
              marketMovePct24h: a.marketMovePct24h,
              holders: a.holders,
              volume24hGBP: a.volume24hGbp,
              isOpen: a.isOpen,
              yourUnits: h?.units ?? 0,
              avgEntryPriceGBP: h?.avgEntry,
              realizedProfitGBP: h?.realized,
            };
          });
        setCoOwnHoldings(merged);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load portfolio');
        show(parsed.message, 'error');
      });
    return () => { cancelled = true; };
  }, [currentUser?.id, show]);

  const userAvatar = useStore((state) => state.userAvatar);
  const userCover = useStore((state) => state.userCover);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserCover = useStore((state) => state.updateUserCover);
  const user = currentUser as any;
  const [myLooks, setMyLooks] = React.useState<LookApiItem[]>([]);
  const [looksLoading, setLooksLoading] = React.useState(false);
  const [highlights, setHighlights] = React.useState<PosterHighlight[]>([]);
  const [isLoadingHighlights, setIsLoadingHighlights] = React.useState(false);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    setLooksLoading(true);
    fetchLooksFromApi({ creatorId: currentUser.id })
      .then((res) => setMyLooks(res.items ?? []))
      .catch(() => setMyLooks([]))
      .finally(() => setLooksLoading(false));
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    setIsLoadingHighlights(true);
    fetchPosterHighlights(currentUser.id)
      .then((res) => setHighlights(res.items))
      .catch(() => setHighlights([]))
      .finally(() => setIsLoadingHighlights(false));
  }, [currentUser?.id]);

  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);

  const confirmedAvatarRemote = user?.avatar ?? userAvatar ?? null;
  const confirmedCoverRemote = user?.coverPhoto ?? userCover ?? null;

  const {
    avatar: avatarState,
    cover: coverState,
    pickAvatar,
    pickCover,
    retryAvatar,
    retryCover,
    revertAvatar,
    revertCover,
  } = useProfileMediaUpload(
    user?.id,
    confirmedAvatarRemote,
    confirmedCoverRemote,
    (url) => {
      updateUserAvatar(url);
      updateUserProfile({ avatar: url });
    },
    (url) => {
      updateUserCover(url);
      updateUserProfile({ coverPhoto: url, coverVideo: null });
      fetchMyProfile().catch(() => {});
    }
  );

  React.useEffect(() => {
    fetchMyProfile().catch(() => {});
  }, [fetchMyProfile]);

  // Show toast on cover upload status changes
  const prevCoverStatus = React.useRef(coverState.status);
  React.useEffect(() => {
    if (coverState.status === 'confirmed' && prevCoverStatus.current !== 'confirmed') {
      show('Cover updated', 'success');
    } else if (coverState.status === 'failed' && prevCoverStatus.current !== 'failed') {
      show('Cover upload failed', 'error');
    }
    prevCoverStatus.current = coverState.status;
  }, [coverState.status, show]);

  // Show toast on avatar upload status changes
  const prevAvatarStatus = React.useRef(avatarState.status);
  React.useEffect(() => {
    if (avatarState.status === 'confirmed' && prevAvatarStatus.current !== 'confirmed') {
      show('Avatar updated', 'success');
    } else if (avatarState.status === 'failed' && prevAvatarStatus.current !== 'failed') {
      show('Avatar upload failed', 'error');
    }
    prevAvatarStatus.current = avatarState.status;
  }, [avatarState.status, show]);

  if (!user) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <EmptyState
          icon="person-outline"
          title="Not signed in"
          subtitle="Sign in to view your profile, listings, and wallet."
          ctaLabel="Sign In"
          onCtaPress={() => navigation.navigate('Login')}
        />
      </View>
    );
  }

  const profileUserId = user.id;
  const profileMediaOverride = profileMediaOverrides[profileUserId] ?? null;

  // Display priority: pending local > confirmed remote > store > override
  const displayCover = coverState.pendingLocal
    || coverState.confirmedRemote
    || user.coverPhoto
    || userCover
    || profileMediaOverride?.cover
    || '';
  const displayAvatar = avatarState.pendingLocal
    || avatarState.confirmedRemote
    || user.avatar
    || userAvatar
    || profileMediaOverride?.avatar
    || null;

  const allOwnedListings = React.useMemo(() => listings.filter((item) => item.sellerId === profileUserId), [listings, profileUserId]);

  const holdingsValue = React.useMemo(
    () => coOwnHoldings.reduce((sum, asset) => sum + asset.yourUnits * asset.unitPriceGBP, 0),
    [coOwnHoldings]
  );

  const holdingsUnrealized = React.useMemo(
    () =>
      coOwnHoldings.reduce((sum, asset) => {
        const avgEntry = asset.avgEntryPriceGBP ?? asset.unitPriceGBP;
        return sum + (asset.unitPriceGBP - avgEntry) * asset.yourUnits;
      }, 0),
    [coOwnHoldings]
  );

  // Parallax scroll for cover
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const coverStyle = useAnimatedStyle(() => {
    const overscroll = Math.min(scrollY.value, 0);
    const translateY = interpolate(overscroll, [-100, 0], [-50, 0], Extrapolation.CLAMP);
    const scale = interpolate(overscroll, [-100, 0], [1.25, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }] };
  });

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const headerOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [COVER_HEIGHT - 60, COVER_HEIGHT - 10], [0, 1], Extrapolation.CLAMP);
    return { opacity, backgroundColor: Colors.background };
  });

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out @${user.username} on Thryftverse!` });
    } catch { /* ignore */ }
  };

  const wishlistCount = useStore((state) => state.wishlist.length);
  const savedCount = useStore((state) => state.savedProducts.length);

  const utilityItems = React.useMemo(
    () => [
      {
        icon: 'receipt-outline' as const,
        label: 'Orders',
        onPress: () => { haptic.light(); navigation.navigate('MyOrders'); },
        accessibilityLabel: 'View your orders',
      },
      {
        icon: 'shirt-outline' as const,
        label: 'Closet',
        value: `${savedCount + wishlistCount} items`,
        onPress: () => { haptic.light(); navigation.navigate('Closet'); },
        accessibilityLabel: 'View your closet',
      },
      {
        icon: 'wallet-outline' as const,
        label: 'Wallet',
        onPress: () => { haptic.light(); navigation.navigate('Wallet'); },
        accessibilityLabel: 'View your wallet',
      },
      {
        icon: 'pie-chart-outline' as const,
        label: 'Co-Own',
        value: coOwnHoldings.length > 0 ? `${coOwnHoldings.length} assets` : undefined,
        onPress: () => { haptic.light(); navigation.navigate('Portfolio'); },
        accessibilityLabel: 'View your co-own portfolio',
      },
    ],
    [coOwnHoldings.length, savedCount, wishlistCount, haptic, navigation]
  );

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;

  const GRID_GAP = 8;
  const CARD_WIDTH = (SCREEN_WIDTH - Space.md * 2 - GRID_GAP) / 2;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* ── 1. FULL-WIDTH COVER ── */}
      <Reanimated.View style={[styles.coverWrap, coverStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf
          onEditCover={pickCover}
          coverOnly
          coverHeight={COVER_HEIGHT}
          isUploadingCover={coverState.status === 'uploading'}
          isUploadingAvatar={avatarState.status === 'uploading'}
          coverError={coverState.status === 'failed' ? coverState.error : null}
          onRetryCover={retryCover}
          onRevertCover={revertCover}
          style={{ width: '100%' }}
        />
      </Reanimated.View>

      {/* ── 2. FLOATING PERSONALISATION AND SETTINGS ── */}
      <View pointerEvents="box-none" style={styles.coverActionLayer}>
        <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={() => { haptic.light(); navigation.navigate('Personalisation'); }}
            accessibilityLabel="Open personalisation settings"
            accessibilityRole="button"
            accessibilityHint="Opens your style and experience preferences"
          >
            <Ionicons name="apps-outline" size={18} color="#fff" />
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={() => { haptic.light(); navigation.navigate('Settings'); }}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            accessibilityHint="Opens account and app settings"
          >
            <Ionicons name="settings-outline" size={18} color="#fff" />
          </AnimatedPressable>
        </Reanimated.View>
      </View>

      {/* ── COLLAPSED SCROLL HEADER ── */}
      <Reanimated.View style={[styles.floatingHeader, { paddingTop: insets.top }, headerOpacityStyle]}>
        <View style={{ flex: 1 }} />
        <Text style={styles.floatingHeaderTitle} numberOfLines={1} ellipsizeMode="tail">{user.username}</Text>
        <View style={{ flex: 1 }} />
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT - 50 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── 3-9: IDENTITY HERO + ACTIONS ── */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
          <MyProfileIdentityHero
            avatarUri={displayAvatar}
            displayName={user.displayName || user.username}
            username={user.username}
            bio={user.bio}
            location={user.location}
            memberSince={memberSince}
            onEditAvatar={pickAvatar}
            onEditProfile={() => navigation.navigate('EditProfile')}
            onShare={handleShare}
          />

          {/* ── 8. COMPACT MARKETPLACE UTILITY RAIL ── */}
          <ProfileUtilityRail items={utilityItems} />

          {/* ── HIGHLIGHTS ROW ── */}
          <ProfileHighlightsRow
            highlights={highlights}
            isLoading={isLoadingHighlights}
            isOwner
            onHighlightPress={(h) => navigation.navigate('PosterViewer', { storyId: h.id })}
            onAddHighlight={() => navigation.navigate('PosterHighlightEditor', {})}
            onEditHighlight={(h) => navigation.navigate('PosterHighlightEditor', { highlightId: h.id })}
          />

          {/* ── 9. STICKY FLAT TAB RAIL ── */}
          <MyProfileTabRail
            tabs={[
              { key: 'listings', label: 'Listings', count: allOwnedListings.length },
              { key: 'looks', label: 'Looks', count: myLooks.length },
              { key: 'about', label: 'About' },
            ]}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'listings' | 'looks' | 'about')}
          />
        </Reanimated.View>

        {/* ── 10. ACTIVE TAB CONTENT ── */}

        {/* LISTINGS TAB — two-column portfolio grid */}
        {activeTab === 'listings' && (
          <View style={{ backgroundColor: Colors.background, paddingBottom: 120, paddingTop: Space.md }}>
            {allOwnedListings.length === 0 ? (
              <View style={styles.listingsEmpty}>
                <View style={styles.listingsEmptyIcon}>
                  <Ionicons name="add" size={28} color={Colors.brand} />
                </View>
                <Text style={styles.listingsEmptyTitle}>List your first item</Text>
                <Text style={styles.listingsEmptySubtitle}>Start selling</Text>
                <AnimatedPressable
                  style={styles.listingsEmptyCta}
                  onPress={() => navigation.navigate('MainTabs')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Start selling"
                >
                  <Text style={styles.listingsEmptyCtaText}>Start selling</Text>
                </AnimatedPressable>
              </View>
            ) : (
              <>
                <View style={styles.gridHeader}>
                  <Text style={styles.gridHeaderCount}>{allOwnedListings.length} listings</Text>
                  <Pressable
                    onPress={() => navigation.navigate('MyListings')}
                    accessibilityRole="button"
                    accessibilityLabel="View all listings"
                  >
                    <Text style={styles.gridHeaderAction}>View All</Text>
                  </Pressable>
                </View>
                <View style={styles.grid}>
                  {allOwnedListings.map((item) => (
                    <AnimatedPressable
                      key={item.id}
                      style={[styles.gridCard, { width: CARD_WIDTH }]}
                      activeOpacity={0.9}
                      onPress={() => navigation.navigate('ManageListing', { itemId: item.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Manage ${item.title}`}
                    >
                      <SharedTransitionView
                        style={[styles.gridImageWrap, { width: CARD_WIDTH, height: CARD_WIDTH * 1.25 }]}
                        sharedTransitionTag={`image-${item.id}-0`}
                      >
                        <CachedImage
                          uri={item.images?.[0] ?? ''}
                          style={styles.gridImage}
                          containerStyle={{ width: '100%', height: '100%', borderRadius: 6 }}
                          contentFit="cover"
                        />
                        {item.isSold ? (
                          <View style={styles.soldOverlay}>
                            <Text style={styles.soldText}>SOLD</Text>
                          </View>
                        ) : null}
                      </SharedTransitionView>
                      <Text style={styles.gridPrice} numberOfLines={1}>
                        {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
                      </Text>
                      {item.brand ? (
                        <Text style={styles.gridBrand} numberOfLines={1}>{item.brand}</Text>
                      ) : null}
                      {(item.size || item.condition) ? (
                        <Text style={styles.gridMeta} numberOfLines={1}>
                          {[item.size, item.condition].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </AnimatedPressable>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* LOOKS TAB — fetched from backend */}
        {activeTab === 'looks' && (
          <View style={{ backgroundColor: Colors.background, paddingBottom: 120, paddingTop: Space.md }}>
            {looksLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Loading looks...</Text>
              </View>
            ) : myLooks.length === 0 ? (
              <EmptyState
                icon="sparkles-outline"
                title="No Looks yet"
                subtitle="Create your first Look to showcase your style."
                ctaLabel="Create Look"
                onCtaPress={() => navigation.navigate('CreatorStudio', { type: 'look' })}
              />
            ) : (
              <View style={{ paddingHorizontal: Space.md }}>
                {myLooks.map((look, index) => (
                  <LookPreviewCard
                    key={look.id}
                    id={look.id}
                    title={look.caption || look.title}
                    coverImage={look.mediaUrl}
                    items={look.tags.map((t) => ({ id: t.id, label: t.label, x: t.x, y: t.y }))}
                    creatorName={look.creator.username ?? user.username}
                    creatorAvatar={look.creator.avatar ?? undefined}
                    likes={look.likeCount}
                    saved={look.savedByViewer}
                    onPress={() => navigation.navigate('LookDetail', { lookId: look.id })}
                    index={index}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ABOUT TAB — flat editorial layout */}
        {activeTab === 'about' && (
          <View style={{ backgroundColor: Colors.background, paddingBottom: 120, paddingTop: Space.md }}>
            <View style={styles.aboutContainer}>
              {user.bio ? (
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Bio</Text>
                  <Text style={styles.aboutValue}>{user.bio}</Text>
                </View>
              ) : null}
              {user.location ? (
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Location</Text>
                  <Text style={styles.aboutValue}>{user.location}</Text>
                </View>
              ) : null}
              {user.website ? (
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Website</Text>
                  <Text style={styles.aboutValue}>{user.website}</Text>
                </View>
              ) : null}
              {memberSince ? (
                <View style={[styles.aboutRow, styles.aboutRowLast]}>
                  <Text style={styles.aboutLabel}>Member Since</Text>
                  <Text style={styles.aboutValue}>{memberSince}</Text>
                </View>
              ) : null}
              {!user.bio && !user.location && !user.website && !memberSince && (
                <Text style={styles.aboutEmpty}>No profile details added yet.</Text>
              )}
            </View>
          </View>
        )}
      </Reanimated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, overflow: 'hidden' },
  scrollContent: { paddingBottom: 120, overflow: 'hidden' },

  // Cover
  coverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  coverActionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 8,
  },
  topUtilityRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topUtilityIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Collapsed header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  floatingHeaderTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },

  // Listings grid
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  gridHeaderCount: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  gridHeaderAction: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: 8,
  },
  gridCard: {
    marginBottom: 12,
  },
  gridImageWrap: {
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  soldOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Typography.family.bold,
    letterSpacing: 1,
  },
  gridPrice: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  gridBrand: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  gridMeta: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },

  // Listings empty state
  listingsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    paddingHorizontal: Space.md,
    gap: 8,
  },
  listingsEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  listingsEmptyTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  listingsEmptySubtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  listingsEmptyCta: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.brand,
    borderRadius: 20,
  },
  listingsEmptyCtaText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },

  // About — flat editorial rows
  aboutContainer: {
    paddingHorizontal: Space.md,
  },
  aboutRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  aboutRowLast: {
    borderBottomWidth: 0,
  },
  aboutLabel: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  aboutValue: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  aboutEmpty: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Space.xl,
  },
});
