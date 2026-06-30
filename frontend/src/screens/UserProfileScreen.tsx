import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
  Share,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useStore } from '../store/useStore';
import { ActiveTheme, Colors } from '../constants/colors';
import { Listing } from '../data/mockData';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { Space, Typography } from '../theme/designTokens';
import { FlagshipProfileMedia } from '../components/flagship';
import { type PublicProfileUser } from '../services/profileApi';
import { usePublicProfileQuery } from '../platform/server';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { isVideoUri } from '../utils/media';
import { PublicProfileIdentityHero } from '../components/profile/PublicProfileIdentityHero';
import { PublicProfileActionRow } from '../components/profile/PublicProfileActionRow';
import { PublicProfileTabRail } from '../components/profile/PublicProfileTabRail';
import { ProfileLooksGrid } from '../components/profile/ProfileLooksGrid';
import { fetchLooksFromApi, type LookApiItem } from '../services/looksApi';

type Props = StackScreenProps<RootStackParamList, 'UserProfile'>;

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COVER_HEIGHT = 180;
const GRID_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - Space.md * 2 - GRID_GAP) / 2;

type Tab = 'Listings' | 'Looks' | 'About';

export default function UserProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useStore(state => state.currentUser);
  const userAvatar = useStore(state => state.userAvatar);
  const userCover = useStore(state => state.userCover);
  const profileMediaOverrides = useStore(state => state.profileMediaOverrides);
  const [activeTab, setActiveTab] = useState<Tab>('Listings');

  const isMe = route.params?.isMe ?? false;
  const userId = route.params?.userId;

  const isSelfProfile = isMe || userId === currentUser?.id;

  const publicProfileQuery = usePublicProfileQuery(isSelfProfile ? null : userId);
  const publicProfile = publicProfileQuery.data ?? null;
  const isLoadingProfile = publicProfileQuery.isLoading;
  const profileError = publicProfileQuery.error ? 'Unable to load profile. Tap to retry.' : null;
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [profileLooks, setProfileLooks] = useState<LookApiItem[]>([]);
  const [isLoadingLooks, setIsLoadingLooks] = useState(false);
  const [looksError, setLooksError] = useState<string | null>(null);
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();

  const targetUserId = isSelfProfile ? currentUser?.id : userId;

  const profileListings = React.useMemo(() => {
    const targetId = isMe ? currentUser?.id : userId;
    return targetId ? listings.filter((l) => l.sellerId === targetId) : [];
  }, [listings, isMe, userId, currentUser?.id]);

  const loadProfileLooks = useCallback(async () => {
    if (!targetUserId) return;
    setIsLoadingLooks(true);
    setLooksError(null);
    try {
      const res = await fetchLooksFromApi({ creatorId: targetUserId, status: 'published' });
      setProfileLooks(res.items ?? []);
    } catch {
      setLooksError('Looks could not be loaded.');
    } finally {
      setIsLoadingLooks(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    let canceled = false;
    if (targetUserId) {
      setIsLoadingLooks(true);
      setLooksError(null);
      fetchLooksFromApi({ creatorId: targetUserId, status: 'published' })
        .then((res) => {
          if (!canceled) setProfileLooks(res.items ?? []);
        })
        .catch(() => {
          if (!canceled) setLooksError('Looks could not be loaded.');
        })
        .finally(() => {
          if (!canceled) setIsLoadingLooks(false);
        });
    }
    return () => { canceled = true; };
  }, [targetUserId]);


  const mediaOverride =
    (userId ? profileMediaOverrides[userId] : undefined)
    ?? (currentUser ? profileMediaOverrides[currentUser.id] : undefined)
    ?? null;

  const targetProfile = isSelfProfile ? currentUser : publicProfile;
  const displayUsername = targetProfile?.username ?? 'Thryft user';
  const displayHandle = targetProfile ? `@${targetProfile.username}` : '';
  const displayAvatar = isSelfProfile
    ? targetProfile?.avatar || userAvatar || mediaOverride?.avatar || undefined
    : targetProfile?.avatar || undefined;
  const displayCover = isSelfProfile
    ? targetProfile?.coverPhoto || userCover || mediaOverride?.cover || ''
    : targetProfile?.coverPhoto || '';

  const memberSince = targetProfile?.createdAt
    ? new Date(targetProfile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;

  const handleShare = React.useCallback(async () => {
    try {
      await Share.share({ message: `Check out ${displayHandle} on Thryftverse!` });
    } catch {
      // Ignore share cancellation errors.
    }
  }, [displayHandle]);

  const handleMessageProfile = React.useCallback(() => {
    const targetId = isSelfProfile ? currentUser?.id : userId;
    if (!targetId) return;
    navigation.navigate('NewMessage', {
      preselectedUserId: targetId,
      preselectedDisplayName: displayUsername,
    });
  }, [displayUsername, navigation, isSelfProfile, currentUser?.id, userId]);

  const handleMore = React.useCallback(() => {
    setMoreMenuVisible(true);
  }, []);

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
    return { opacity, transform: [{ translateY }] };
  });

  const headerOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [COVER_HEIGHT - 60, COVER_HEIGHT - 10], [0, 1], Extrapolation.CLAMP);
    return { opacity, backgroundColor: BG };
  });

  // ── Loading state ──
  if (isLoadingProfile && !targetProfile) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
        <View style={[styles.coverPlaceholder, { height: COVER_HEIGHT }]} />
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={Colors.brand} />
          <Text style={styles.stateText}>Loading profile…</Text>
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (profileError && !targetProfile) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
        <View style={[styles.coverPlaceholder, { height: COVER_HEIGHT }]} />
        <Pressable
          style={styles.stateContainer}
          onPress={() => publicProfileQuery.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
        >
          <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
          <Text style={styles.stateText}>Unable to load profile</Text>
          <Text style={styles.stateSubtext}>Tap to retry</Text>
        </Pressable>
      </View>
    );
  }

  // ── Unavailable state ──
  if (!targetProfile && !isSelfProfile) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
        <View style={[styles.coverPlaceholder, { height: COVER_HEIGHT }]} />
        <View style={styles.stateContainer}>
          <Ionicons name="person-outline" size={40} color={MUTED} />
          <Text style={styles.stateText}>Profile unavailable</Text>
          <Text style={styles.stateSubtext}>This account may no longer be active.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />

      {/* ── 1. FULL-WIDTH SELLER COVER ── */}
      <Reanimated.View style={[styles.coverWrap, coverStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf={isSelfProfile}
          coverOnly
          style={{ width: '100%' }}
        />
      </Reanimated.View>

      {/* ── 2. FLOATING BACK / SHARE / MORE ── */}
      <View pointerEvents="box-none" style={styles.coverActionLayer}>
        <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            accessibilityHint="Returns to previous screen"
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </AnimatedPressable>

          <View style={styles.topUtilityRight}>
            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              activeOpacity={0.9}
              onPress={handleShare}
              accessibilityLabel="Share profile"
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
            </AnimatedPressable>
            {!isSelfProfile && (
              <AnimatedPressable
                style={styles.topUtilityIconBtn}
                activeOpacity={0.9}
                onPress={handleMore}
                accessibilityLabel="More options"
                accessibilityRole="button"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
              </AnimatedPressable>
            )}
          </View>
        </Reanimated.View>
      </View>

      {/* ── COLLAPSED SCROLL HEADER ── */}
      <Reanimated.View style={[styles.floatingHeader, { paddingTop: insets.top }, headerOpacityStyle]}>
        <View style={{ flex: 1 }} />
        <Text style={styles.floatingHeaderTitle} numberOfLines={1} ellipsizeMode="tail">{displayUsername}</Text>
        <View style={{ flex: 1 }} />
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT - 50 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
      >
        {/* ── 3-6: IDENTITY HERO ── */}
        <View>
          <PublicProfileIdentityHero
            avatarUri={displayAvatar ?? null}
            displayName={targetProfile?.displayName || displayUsername}
            username={targetProfile?.username ?? 'Thryft user'}
            bio={targetProfile?.bio}
            location={targetProfile?.location}
            memberSince={memberSince}
            listingCount={profileListings.length}
          />

          {/* ── 7-8: RELATIONSHIP ACTIONS ── */}
          {!isSelfProfile && (
            <PublicProfileActionRow
              onMessage={handleMessageProfile}
              onShare={handleShare}
              onMore={handleMore}
            />
          )}

          {isSelfProfile && (
            <View style={styles.selfActionRow}>
              <AnimatedPressable
                style={styles.selfShareBtn}
                onPress={handleShare}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Share profile"
              >
                <Ionicons name="share-outline" size={16} color={TEXT} />
                <Text style={styles.selfShareBtnText}>Share</Text>
              </AnimatedPressable>
            </View>
          )}
        </View>

        {/* ── 9. FLAT TAB RAIL (sticky) ── */}
        <View style={styles.stickyTabWrapper}>
          <PublicProfileTabRail
            tabs={[
              { key: 'Listings', label: 'Listings', count: profileListings.length },
              { key: 'Looks', label: 'Looks', count: isLoadingLooks ? undefined : profileLooks.length },
              { key: 'About', label: 'About' },
            ]}
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as Tab)}
          />
        </View>

        {/* ── 10. SELLER PORTFOLIO CONTENT ── */}

        {/* LISTINGS TAB — two-column seller grid */}
        {activeTab === 'Listings' && (
          <View style={{ backgroundColor: BG, paddingBottom: 120, paddingTop: Space.md }}>
            {profileListings.length === 0 ? (
              <View style={styles.listingsEmpty}>
                <Ionicons name="shirt-outline" size={32} color={MUTED} />
                <Text style={styles.listingsEmptyTitle}>No active listings</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {profileListings.map((item) => (
                  <AnimatedPressable
                    key={item.id}
                    style={[styles.gridCard, { width: CARD_WIDTH }]}
                    activeOpacity={0.9}
                    onPress={() => navigation.push('ItemDetail', { itemId: item.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Open listing ${item.title}`}
                    accessibilityHint="Opens listing details"
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
            )}
          </View>
        )}

        {/* LOOKS TAB — profile looks grid */}
        {activeTab === 'Looks' && (
          <View style={{ backgroundColor: BG, paddingBottom: 120, paddingTop: Space.md }}>
            <ProfileLooksGrid
              looks={profileLooks}
              isLoading={isLoadingLooks}
              error={looksError}
              isSelfProfile={isSelfProfile}
              onRetry={loadProfileLooks}
              onCreateLook={() => navigation.navigate('CreatorStudio', { type: 'look' })}
              navigation={navigation}
            />
          </View>
        )}

        {/* ABOUT TAB — flat editorial rows */}
        {activeTab === 'About' && (
          <View style={{ backgroundColor: BG, paddingBottom: 120, paddingTop: Space.md }}>
            <View style={styles.aboutContainer}>
              {targetProfile?.bio ? (
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Bio</Text>
                  <Text style={styles.aboutValue}>{targetProfile.bio}</Text>
                </View>
              ) : null}
              {targetProfile?.location ? (
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Location</Text>
                  <Text style={styles.aboutValue}>{targetProfile.location}</Text>
                </View>
              ) : null}
              {targetProfile?.website ? (
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Website</Text>
                  <Text style={styles.aboutValue}>{targetProfile.website}</Text>
                </View>
              ) : null}
              {memberSince ? (
                <View style={[styles.aboutRow, styles.aboutRowLast]}>
                  <Text style={styles.aboutLabel}>Member Since</Text>
                  <Text style={styles.aboutValue}>{memberSince}</Text>
                </View>
              ) : null}
              {!targetProfile?.bio && !targetProfile?.location && !targetProfile?.website && !memberSince && (
                <Text style={styles.aboutEmpty}>No additional profile information.</Text>
              )}
            </View>
          </View>
        )}
      </Reanimated.ScrollView>

      {/* More options menu */}
      {moreMenuVisible && !isSelfProfile && (
        <Pressable
          style={styles.moreOverlay}
          onPress={() => setMoreMenuVisible(false)}
        >
          <View style={styles.moreMenu}>
            <Pressable
              style={styles.moreItem}
              onPress={() => { setMoreMenuVisible(false); handleShare(); }}
              accessibilityRole="button"
              accessibilityLabel="Share profile"
            >
              <Ionicons name="share-outline" size={18} color={TEXT} />
              <Text style={styles.moreItemText}>Share profile</Text>
            </Pressable>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

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
  coverPlaceholder: {
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
  topUtilityRight: {
    flexDirection: 'row',
    gap: 8,
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
    borderBottomColor: BORDER,
  },
  floatingHeaderTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: TEXT,
    letterSpacing: -0.3,
  },

  scrollContent: {
    minHeight: '100%',
  },

  // Self action row (when viewing own profile from public route)
  selfActionRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  selfShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  selfShareBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },

  // Sticky tab wrapper
  stickyTabWrapper: {
    backgroundColor: BG,
  },

  // Listings grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: GRID_GAP,
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
    color: TEXT,
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
    color: MUTED,
    marginTop: 1,
  },

  // Listings empty
  listingsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    gap: 10,
  },
  listingsEmptyTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: MUTED,
  },

  // About — flat editorial rows
  aboutContainer: {
    paddingHorizontal: Space.md,
  },
  aboutRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  aboutRowLast: {
    borderBottomWidth: 0,
  },
  aboutLabel: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  aboutValue: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: TEXT,
    lineHeight: 20,
  },
  aboutEmpty: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: MUTED,
    textAlign: 'center',
    paddingVertical: Space.xl,
  },

  // State containers (loading, error, unavailable)
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: Space.md,
  },
  stateText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  stateSubtext: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },

  // More menu
  moreOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreMenu: {
    backgroundColor: BG,
    borderRadius: 14,
    paddingVertical: 8,
    minWidth: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  moreItemText: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: TEXT,
  },
});
