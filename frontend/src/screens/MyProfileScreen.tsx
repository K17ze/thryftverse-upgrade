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
  ActivityIndicator,
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
import { useAppTheme } from '../theme/ThemeContext';
import { Typography, Space, Radius, Type, Control, LetterSpacing } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { useSellerTrust } from '../platform/product';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { isVideoUri } from '../utils/media';
import { fetchLooksFromApi, type LookApiItem } from '../services/looksApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COVER_HEIGHT = 152;

export default function MyProfileScreen() {
  const { colors, isDark } = useAppTheme();

  // Themed style overrides — color properties extracted from module-level styles
  const t = {
    container: { backgroundColor: colors.background },
    coverWrap: { backgroundColor: colors.surfaceAlt },
    coverFailureText: { color: colors.textInverse },
    coverFailureActionText: { color: colors.textInverse },
    floatingHeader: { backgroundColor: colors.background, borderBottomColor: colors.border },
    floatingHeaderTitle: { color: colors.textPrimary },
    gridHeaderCount: { color: colors.textMuted },
    gridHeaderAction: { color: colors.brand },
    soldText: { color: colors.textInverse },
    gridPrice: { color: colors.textPrimary },
    gridBrand: { color: colors.textSecondary },
    gridMeta: { color: colors.textMuted },
    listingsEmptyTitle: { color: colors.textPrimary },
    listingsEmptyBody: { color: colors.textMuted },
    listingsEmptyCta: { backgroundColor: colors.brand },
    listingsEmptyCtaText: { color: colors.textInverse },
    aboutSectionTitle: { color: colors.textPrimary },
    aboutRow: { borderBottomColor: colors.border },
    aboutLabel: { color: colors.textMuted },
    aboutValue: { color: colors.textPrimary },
    aboutEmpty: { color: colors.textMuted },
    topUtilityVisible: { backgroundColor: `${colors.textPrimary}6B`, borderColor: `${colors.textInverse}2E` },
    coverEditVisible: { backgroundColor: `${colors.textPrimary}8C`, borderColor: `${colors.textInverse}3D` },
    coverFailure: { backgroundColor: `${colors.textPrimary}B8` },
    soldOverlay: { backgroundColor: `${colors.textPrimary}80` },
  };
  const tMyProfile = {
    awayBanner: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    awayBannerTitle: { color: colors.textPrimary },
    awayBannerSub: { color: colors.textMuted },
  };

  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const reducedMotionEnabled = useReducedMotion();
  const scrollRef = React.useRef<Reanimated.ScrollView>(null);
  useScrollToTop(scrollRef);
  const [activeTab, setActiveTab] = React.useState<'listings' | 'looks' | 'about'>('listings');

  const { show } = useToast();
  const haptic = useHaptic();

  const { formatFromFiat } = useFormattedPrice();

  const { listings } = useBackendData();
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);
  const updateUserProfile = useStore((state) => state.updateUserProfile);

  const currentUser = useStore((state) => state.currentUser);
  const holidayMode = useStore((state) => state.accountPreferences?.holidayMode === true);

  const [coOwnHoldings, setCoOwnHoldings] = React.useState<any[]>([]);

  // Seller trust summary — verified badge, response time, dispatch time, completed sales
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

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
  const user = currentUser;
  const [myLooks, setMyLooks] = React.useState<LookApiItem[]>([]);
  const [looksLoading, setLooksLoading] = React.useState(false);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    setLooksLoading(true);
    fetchLooksFromApi({ creatorId: currentUser.id })
      .then((res) => setMyLooks(res.items ?? []))
      .catch(() => setMyLooks([]))
      .finally(() => setLooksLoading(false));
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
      <View style={[styles.container, t.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
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

  // Parallax scroll for cover
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const coverStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-100, 0, COVER_HEIGHT],
      [-50, 0, -COVER_HEIGHT],
      Extrapolation.CLAMP
    );
    const scale = interpolate(scrollY.value, [-100, 0], [1.25, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }] };
  });

  const coverActionStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COVER_HEIGHT],
          [0, -COVER_HEIGHT],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const headerOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [32, 72],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
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
        icon: 'bag-handle-outline' as const,
        label: 'Orders',
        onPress: () => { haptic.light(); navigation.navigate('MyOrders'); },
        accessibilityLabel: 'View your orders',
      },
      {
        icon: 'pulse-outline' as const,
        label: 'Analytics',
        onPress: () => { haptic.light(); navigation.navigate('CreatorAnalyticsDashboard'); },
        accessibilityLabel: 'View your creator analytics',
      },
      {
        icon: 'bookmark-outline' as const,
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
        icon: 'timer-outline' as const,
        label: 'Auctions',
        onPress: () => { haptic.light(); navigation.navigate('AuctionHome'); },
        accessibilityLabel: 'Browse auctions',
      },
      {
        icon: 'layers-outline' as const,
        label: 'Co-own',
        value: coOwnHoldings.length > 0 ? `${coOwnHoldings.length} assets` : undefined,
        onPress: () => { haptic.light(); navigation.navigate('CoOwnHub'); },
        accessibilityLabel: 'Browse co-own market',
      },
      {
        icon: 'images-outline' as const,
        label: 'Posters',
        onPress: () => { haptic.light(); navigation.navigate('PosterArchive'); },
        accessibilityLabel: 'Poster archive',
        accessibilityHint: 'View your archived posters',
      },
    ],
    [coOwnHoldings.length, savedCount, wishlistCount, allOwnedListings.length, haptic, navigation]
  );

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;

  const GRID_GAP = 8;
  const CARD_WIDTH = (SCREEN_WIDTH - Space.md * 2 - GRID_GAP) / 2;

  return (
    <View style={[styles.container, t.container]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* ── 1. FULL-WIDTH COVER ── */}
      <Reanimated.View style={[styles.coverWrap, t.coverWrap, coverStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf
          coverOnly
          coverHeight={COVER_HEIGHT}
          isUploadingCover={coverState.status === 'uploading'}
          isUploadingAvatar={avatarState.status === 'uploading'}
          style={{ width: '100%' }}
        />
      </Reanimated.View>

      {/* ── 2. FLOATING PERSONALISATION AND SETTINGS ── */}
      <Reanimated.View pointerEvents="box-none" style={[styles.coverActionLayer, coverActionStyle]}>
        <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={() => { haptic.light(); navigation.navigate('Personalisation'); }}
            accessibilityLabel="Open personalisation settings"
            accessibilityRole="button"
            accessibilityHint="Opens your style and experience preferences"
          >
            <View style={styles.topUtilityVisible}>
              <Ionicons name="options-outline" size={19} color={colors.textInverse} />
            </View>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={() => { haptic.light(); navigation.navigate('Settings'); }}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            accessibilityHint="Opens account and app settings"
          >
            <View style={styles.topUtilityVisible}>
              <Ionicons name="settings-outline" size={19} color={colors.textInverse} />
            </View>
          </AnimatedPressable>
        </Reanimated.View>

        {coverState.status === 'failed' ? (
          <View style={styles.coverFailure}>
            <View style={styles.coverFailureCopy}>
              <Ionicons name="alert-circle-outline" size={17} color={colors.textInverse} />
              <Text style={[styles.coverFailureText, t.coverFailureText]} numberOfLines={1}>
                {coverState.error || 'Cover upload failed'}
              </Text>
            </View>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={retryCover}
              activeOpacity={0.75}
              scaleValue={0.98}
              accessibilityRole="button"
              accessibilityLabel="Retry cover upload"
              hitSlop={5}
            >
              <Text style={[styles.coverFailureActionText, t.coverFailureActionText]}>Retry</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={revertCover}
              activeOpacity={0.75}
              scaleValue={0.98}
              accessibilityRole="button"
              accessibilityLabel="Cancel cover change"
              hitSlop={5}
            >
              <Text style={[styles.coverFailureActionText, t.coverFailureActionText]}>Cancel</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <AnimatedPressable
            style={styles.coverEditTarget}
            onPress={pickCover}
            activeOpacity={0.8}
            scaleValue={0.97}
            hapticFeedback="light"
            disabled={coverState.status === 'uploading'}
            accessibilityRole="button"
            accessibilityLabel={
              coverState.status === 'uploading'
                ? 'Uploading profile cover'
                : 'Change profile cover'
            }
            accessibilityState={{ disabled: coverState.status === 'uploading', busy: coverState.status === 'uploading' }}
          >
            <View style={styles.coverEditVisible}>
              {coverState.status === 'uploading' ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Ionicons name="image-outline" size={17} color={colors.textInverse} />
              )}
            </View>
          </AnimatedPressable>
        )}
      </Reanimated.View>

      {/* ── COLLAPSED SCROLL HEADER ── */}
      <Reanimated.View style={[styles.floatingHeader, t.floatingHeader, { paddingTop: insets.top }, headerOpacityStyle]} pointerEvents="none">
        <View style={{ flex: 1 }} />
        <Text style={[styles.floatingHeaderTitle, t.floatingHeaderTitle]} numberOfLines={1} ellipsizeMode="tail">{user.username}</Text>
        <View style={{ flex: 1 }} />
      </Reanimated.View>

      <Reanimated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT - 50 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── 3-9: IDENTITY HERO + ACTIONS ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(40)}>
          <MyProfileIdentityHero
            avatarUri={displayAvatar}
            displayName={user.displayName || user.username}
            username={user.username}
            bio={user.bio ?? undefined}
            location={user.location ?? undefined}
            memberSince={memberSince}
            listingCount={allOwnedListings.length}
            lookCount={myLooks.length}
            sellerTrust={sellerTrust}
            emailVerified={user.emailVerified}
            onEditAvatar={pickAvatar}
            onEditProfile={() => navigation.navigate('EditProfile', {})}
            onShare={handleShare}
          />

          {/* Away-mode indicator — shown when holiday mode is enabled */}
          {holidayMode ? (
            <Pressable
              style={[myProfileStyles.awayBanner, tMyProfile.awayBanner]}
              onPress={() => navigation.navigate('PrivacySettings')}
              accessibilityRole="button"
              accessibilityLabel="Holiday mode is on — tap to manage"
            >
              <Ionicons name="pause-circle" size={18} color={colors.textMuted} />
              <View style={myProfileStyles.awayBannerTextWrap}>
                <Text style={[myProfileStyles.awayBannerTitle, tMyProfile.awayBannerTitle]}>Holiday mode is on</Text>
                <Text style={[myProfileStyles.awayBannerSub, tMyProfile.awayBannerSub]}>
                  Your shop is paused. Tap to manage.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}

          {/* ── 8. COMPACT MARKETPLACE UTILITY RAIL ── */}
          <ProfileUtilityRail items={utilityItems} />

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
          <View style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}>
            {allOwnedListings.length === 0 ? (
              <View style={styles.listingsEmpty}>
                <Ionicons name="bag-add-outline" size={27} color={colors.textSecondary} />
                <Text style={[styles.listingsEmptyTitle, t.listingsEmptyTitle]}>List your first item</Text>
                <Text style={[styles.listingsEmptyBody, t.listingsEmptyBody]}>
                  Photograph an item and publish it when you are ready.
                </Text>
                <AnimatedPressable
                  style={[styles.listingsEmptyCta, t.listingsEmptyCta]}
                  onPress={() => navigation.navigate('MainTabs')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Start selling"
                  hitSlop={1}
                >
                  <Text style={[styles.listingsEmptyCtaText, t.listingsEmptyCtaText]}>Start selling</Text>
                </AnimatedPressable>
              </View>
            ) : (
              <>
                <View style={styles.gridHeader}>
                  <Text style={[styles.gridHeaderCount, t.gridHeaderCount]}>{allOwnedListings.length} listings</Text>
                  <Pressable
                    onPress={() => navigation.navigate('MyListings')}
                    accessibilityRole="button"
                    accessibilityLabel="View all listings"
                    hitSlop={13}
                  >
                    <Text style={[styles.gridHeaderAction, t.gridHeaderAction]}>View All</Text>
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
                          containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.md }}
                          contentFit="cover"
                        />
                        {item.isSold ? (
                          <View style={styles.soldOverlay}>
                            <Text style={[styles.soldText, t.soldText]}>SOLD</Text>
                          </View>
                        ) : null}
                      </SharedTransitionView>
                      <Text style={[styles.gridPrice, t.gridPrice]} numberOfLines={1}>
                        {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
                      </Text>
                      {item.brand ? (
                        <Text style={[styles.gridBrand, t.gridBrand]} numberOfLines={1}>{item.brand}</Text>
                      ) : null}
                      {(item.size || item.condition) ? (
                        <Text style={[styles.gridMeta, t.gridMeta]} numberOfLines={1}>
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
          <View style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}>
            {looksLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: colors.textMuted, fontSize: Type.body.size }}>Loading looks...</Text>
              </View>
            ) : myLooks.length === 0 ? (
              <EmptyState
                density="compact"
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
          <View style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}>
            <View style={styles.aboutContainer}>
              {user.bio ? (
                <View style={[styles.aboutRow, t.aboutRow]}>
                  <Text style={[styles.aboutLabel, t.aboutLabel]}>Bio</Text>
                  <Text style={[styles.aboutValue, t.aboutValue]}>{user.bio}</Text>
                </View>
              ) : null}
              {user.location ? (
                <View style={[styles.aboutRow, t.aboutRow]}>
                  <Text style={[styles.aboutLabel, t.aboutLabel]}>Location</Text>
                  <Text style={[styles.aboutValue, t.aboutValue]}>{user.location}</Text>
                </View>
              ) : null}
              {user.website ? (
                <View style={[styles.aboutRow, t.aboutRow]}>
                  <Text style={[styles.aboutLabel, t.aboutLabel]}>Website</Text>
                  <Text style={[styles.aboutValue, t.aboutValue]}>{user.website}</Text>
                </View>
              ) : null}
              {memberSince ? (
                <View style={[styles.aboutRow, t.aboutRow, styles.aboutRowLast]}>
                  <Text style={[styles.aboutLabel, t.aboutLabel]}>Member Since</Text>
                  <Text style={[styles.aboutValue, t.aboutValue]}>{memberSince}</Text>
                </View>
              ) : null}
              {!user.bio && !user.location && !user.website && !memberSince && (
                <Text style={[styles.aboutEmpty, t.aboutEmpty]}>No profile details added yet.</Text>
              )}
            </View>

            {/* Shop stats — derived from seller trust data */}
            {sellerTrust ? (
              <View style={styles.aboutContainer}>
                <Text style={[styles.aboutSectionTitle, t.aboutSectionTitle]}>Shop stats</Text>
                {sellerTrust.rating !== null && sellerTrust.rating !== undefined && sellerTrust.reviewCount ? (
                  <View style={[styles.aboutRow, t.aboutRow]}>
                    <Text style={[styles.aboutLabel, t.aboutLabel]}>Rating</Text>
                    <Text style={[styles.aboutValue, t.aboutValue]}>
                      {sellerTrust.rating.toFixed(1)} ★ ({sellerTrust.reviewCount} review{sellerTrust.reviewCount === 1 ? '' : 's'})
                    </Text>
                  </View>
                ) : null}
                {sellerTrust.completedSales !== null && sellerTrust.completedSales !== undefined ? (
                  <View style={[styles.aboutRow, t.aboutRow]}>
                    <Text style={[styles.aboutLabel, t.aboutLabel]}>Completed sales</Text>
                    <Text style={[styles.aboutValue, t.aboutValue]}>{sellerTrust.completedSales}</Text>
                  </View>
                ) : null}
                {sellerTrust.responseTimeLabel ? (
                  <View style={[styles.aboutRow, t.aboutRow]}>
                    <Text style={[styles.aboutLabel, t.aboutLabel]}>Response time</Text>
                    <Text style={[styles.aboutValue, t.aboutValue]}>Replies {sellerTrust.responseTimeLabel}</Text>
                  </View>
                ) : null}
                {sellerTrust.dispatchTimeLabel ? (
                  <View style={[styles.aboutRow, t.aboutRow]}>
                    <Text style={[styles.aboutLabel, t.aboutLabel]}>Dispatch time</Text>
                    <Text style={[styles.aboutValue, t.aboutValue]}>{sellerTrust.dispatchTimeLabel}</Text>
                  </View>
                ) : null}
                {sellerTrust.responseRate !== null && sellerTrust.responseRate !== undefined ? (
                  <View style={[styles.aboutRow, t.aboutRow]}>
                    <Text style={[styles.aboutLabel, t.aboutLabel]}>Response rate</Text>
                    <Text style={[styles.aboutValue, t.aboutValue]}>{sellerTrust.responseRate}%</Text>
                  </View>
                ) : null}
                {sellerTrust.activeListingCount !== null && sellerTrust.activeListingCount !== undefined ? (
                  <View style={[styles.aboutRow, t.aboutRow, styles.aboutRowLast]}>
                    <Text style={[styles.aboutLabel, t.aboutLabel]}>Active listings</Text>
                    <Text style={[styles.aboutValue, t.aboutValue]}>{sellerTrust.activeListingCount}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Shop policies — derived from trust + account data */}
            <View style={styles.aboutContainer}>
              <Text style={[styles.aboutSectionTitle, t.aboutSectionTitle]}>Shop policies</Text>
              <View style={[styles.aboutRow, t.aboutRow]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>Payments</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>Secure checkout with buyer protection</Text>
              </View>
              <View style={[styles.aboutRow, t.aboutRow]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>Shipping</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>
                  {sellerTrust?.dispatchTimeLabel
                    ? `Seller ${sellerTrust.dispatchTimeLabel.toLowerCase()}. Tracking provided on dispatch.`
                    : 'Tracking provided on dispatch.'}
                </Text>
              </View>
              <View style={[styles.aboutRow, t.aboutRow]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>Returns</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>Returns accepted for items not as described.</Text>
              </View>
              <View style={[styles.aboutRow, t.aboutRow, styles.aboutRowLast]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>Response</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>
                  {sellerTrust?.responseTimeLabel
                    ? `Seller typically replies ${sellerTrust.responseTimeLabel.toLowerCase()}.`
                    : 'Seller aims to respond promptly.'}
                </Text>
              </View>
            </View>
          </View>
        )}
      </Reanimated.ScrollView>
    </View>
  );
}

const myProfileStyles = StyleSheet.create({
  awayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  awayBannerTextWrap: {
    flex: 1,
    gap: Space.xs / 2,
  },
  awayBannerTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
  },
  awayBannerSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  scrollContent: { paddingBottom: Space.xxl + Space.xxl + Space.xs, overflow: 'hidden' },

  // Cover
  coverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 0,
    overflow: 'hidden',
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
    left: Space.md - 2,
    right: Space.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topUtilityIconBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topUtilityVisible: {
    width: Space.xl - 2,
    height: Space.xl - 2,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditTarget: {
    position: 'absolute',
    right: Space.md - 2,
    bottom: Space.sm,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditVisible: {
    width: Space.xl + 2,
    height: Space.xl + 2,
    borderRadius: Radius.xxl,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFailure: {
    position: 'absolute',
    left: Space.md - 2,
    right: Space.md - 2,
    bottom: Space.sm,
    minHeight: Control.hit,
    paddingLeft: Space.sm + 4,
    paddingRight: Space.xs + 1,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  coverFailureCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 3,
  },
  coverFailureText: {
    flexShrink: 1,
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
  },
  coverFailureAction: {
    minWidth: Space.xxl + 4,
    minHeight: Space.xl + 2,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFailureActionText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
  },

  // Collapsed header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  floatingHeaderTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.priceList.letterSpacing,
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
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
  },
  gridHeaderAction: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  gridCard: {
    marginBottom: Space.sm + 4,
  },
  gridImageWrap: {
    borderRadius: Radius.md,
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
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    letterSpacing: LetterSpacing.caps + 0.18,
  },
  gridPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    marginTop: Space.xs + 2,
  },
  gridBrand: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs / 4,
  },
  gridMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs / 4,
  },

  // Listings empty state — compact in-grid prompt, not full blank page
  listingsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  listingsEmptyTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  listingsEmptyBody: {
    maxWidth: 280,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    textAlign: 'center',
  },
  listingsEmptyCta: {
    marginTop: Space.xs + 2,
    minHeight: Control.hit - 2,
    paddingHorizontal: Space.md + 2,
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  listingsEmptyCtaText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },

  // About — flat editorial rows
  aboutContainer: {
    paddingHorizontal: Space.md,
  },
  aboutSectionTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.bold,
    paddingTop: Space.md + 2,
    paddingBottom: Space.xs,
  },
  aboutRow: {
    paddingVertical: Space.md - 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aboutRowLast: {
    borderBottomWidth: 0,
  },
  aboutLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps - 0.12,
    marginBottom: Space.xs,
  },
  aboutValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
  },
  aboutEmpty: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingVertical: Space.xl,
  },
});
