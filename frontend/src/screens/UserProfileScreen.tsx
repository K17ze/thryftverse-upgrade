import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  Share,
} from 'react-native';
import { Video, ResizeMode } from '../components/compat/Video';
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
import { BottomSheet } from '../components/BottomSheet';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useStore } from '../store/useStore';
import { ActiveTheme, Colors } from '../constants/colors';
import { Listing } from '../data/mockData';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { Space, Radius } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { Typography } from '../theme/designTokens';
import { AppButton } from '../components/ui/AppButton';
import { fetchPublicProfile, type PublicProfileUser } from '../services/profileApi';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { isVideoUri } from '../utils/media';

type Props = StackScreenProps<RootStackParamList, 'UserProfile'>;

const ACCENT = Colors.brand;
const BG = Colors.background;
const CARD = Colors.surface;
const CARD_ALT = Colors.surfaceAlt;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const { width } = Dimensions.get('window');

const GRID_SPACING = 16;
const ITEM_SIZE = (width - 40 - GRID_SPACING) / 2;
const COVER_HEIGHT = 200;
const AVATAR_SIZE = 108;
const COVER_IMAGE = '';

type Tab = 'Listings' | 'About';

const TAB_OPTIONS: Array<{ value: Tab; label: string; accessibilityLabel: string }> = [
  { value: 'Listings', label: 'Listings', accessibilityLabel: 'Show listings tab' },
  { value: 'About', label: 'About', accessibilityLabel: 'Show about tab' },
];

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= rating ? 'star' : 'star-outline'} size={size} color={Colors.textSecondary} />
      ))}
    </View>
  );
}

const AnimatedScrollView = Reanimated.createAnimatedComponent(ScrollView);

export default function UserProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useStore(state => state.currentUser);
  const userAvatar = useStore(state => state.userAvatar);
  const userCover = useStore(state => state.userCover);
  const profileMediaOverrides = useStore(state => state.profileMediaOverrides);
  const { show } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('Listings');
  const [following, setFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [publicProfile, setPublicProfile] = useState<PublicProfileUser | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();

  const isMe = route.params?.isMe ?? false;
  const userId = route.params?.userId;

  const isSelfProfile =
    isMe ||
    userId === currentUser?.id;

  const profileListings = React.useMemo(() => {
    const targetId = isMe ? currentUser?.id : userId;
    return targetId ? listings.filter((l) => l.sellerId === targetId) : [];
  }, [listings, isMe, userId, currentUser?.id]);

  React.useEffect(() => {
    if (isSelfProfile || !userId) return;
    let canceled = false;
    setIsLoadingProfile(true);
    fetchPublicProfile(userId)
      .then((profile) => {
        if (!canceled) setPublicProfile(profile);
      })
      .catch(() => {
        if (!canceled) setPublicProfile(null);
      })
      .finally(() => {
        if (!canceled) setIsLoadingProfile(false);
      });
    return () => { canceled = true; };
  }, [userId, isSelfProfile]);

  const hasRealUserData = isSelfProfile && currentUser != null;

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
    ? targetProfile?.coverPhoto || userCover || mediaOverride?.cover || COVER_IMAGE
    : targetProfile?.coverPhoto || COVER_IMAGE;

  const handleShare = React.useCallback(async () => {
    try {
      await Share.share({ message: `Check out ${displayHandle} on Thryftverse!` });
    } catch {
      // Ignore share cancellation errors.
    }
  }, [displayHandle]);

  const primaryListingId = profileListings[0]?.id;

  const handleMessageProfile = React.useCallback(() => {
    const targetId = isSelfProfile ? currentUser?.id : userId;
    if (!targetId) return;
    const conversationId = primaryListingId
      ? `${targetId}_${primaryListingId}`
      : `profile_${targetId}`;

    navigation.navigate('Chat', {
      conversationId,
      focusQuery: displayUsername,
      partnerUserId: targetId,
    });
  }, [displayUsername, navigation, primaryListingId, isSelfProfile, currentUser?.id, userId]);

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
  
  const headerOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [COVER_HEIGHT - 60, COVER_HEIGHT - 10], [0, 1], Extrapolation.CLAMP);
    return { opacity, backgroundColor: BG };
  });

  const renderItem = (item: Listing) => (
    <AnimatedPressable
      key={item.id}
      style={styles.gridItem}
      activeOpacity={0.9}
      onPress={() => navigation.push('ItemDetail', { itemId: item.id })}
      accessibilityRole="button"
      accessibilityLabel={`Open listing ${item.title}`}
      accessibilityHint="Opens listing details"
    >
      <View style={styles.gridImageWrap}>
        <SharedTransitionView
          style={styles.gridSharedImage}
          sharedTransitionTag={`image-${item.id}-0`}
        >
          <CachedImage
            uri={item.images?.[0] || ''}
            style={styles.gridImage}
            contentFit="cover"
          />
        </SharedTransitionView>
        <View style={styles.likeBtnPill}>
          <Ionicons name="heart-outline" size={14} color="#fff" />
        </View>
      </View>
      <View style={styles.gridInfo}>
        <Text style={styles.gridPrice}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
        <Text style={styles.gridBrand} numberOfLines={1} ellipsizeMode="tail">{item.brand}</Text>
        <Text style={styles.gridSizeCondition}>{item.size} | {item.condition}</Text>
      </View>
    </AnimatedPressable>
  );

  const groupedListings = [];
  for (let i = 0; i < profileListings.length; i += 2) {
    groupedListings.push([profileListings[i], profileListings[i+1]]);
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />

      {/* Floating Translucent Header Layer */}
      <Reanimated.View style={[styles.floatingHeader, { paddingTop: insets.top }, headerOpacityStyle]}>
         <View style={{ flex: 1 }} />
        <Text style={styles.floatingHeaderTitle} numberOfLines={1} ellipsizeMode="tail">{displayUsername}</Text>
         <View style={{ flex: 1 }} />
      </Reanimated.View>
      
      <View style={[styles.floatingHeaderActions, { top: insets.top }]}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to previous screen"
        >
          <View style={styles.iconBackdrop}>
             <Ionicons name="arrow-back" size={24} color="#fff" />
          </View>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => setActionSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Open profile actions"
          accessibilityHint="Shows profile options"
        >
          <View style={styles.iconBackdrop}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
          </View>
        </AnimatedPressable>
      </View>

      {/* Cover photo with parallax - supports images, GIFs and videos */}
      <Reanimated.View style={[styles.coverWrap, coverStyle]}>
        {isVideoUri(displayCover) ? (
          <Video
            key={`user-cover-video-${displayCover}`}
            source={{ uri: displayCover }}
            style={styles.coverImage}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
          />
        ) : (
          <CachedImage
            key={`user-cover-image-${displayCover}`}
            uri={displayCover}
            style={styles.coverImage}
            contentFit="cover"
            priority="high"
          />
        )}
        <View style={styles.coverGradient} />
      </Reanimated.View>

      {/* Main Content Area */}
      <AnimatedScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT - 60 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]} /* Target the Tab Bar index! */
      >
        {/* Index 0: Hero Info - LinkedIn Style */}
        <View style={styles.profileHeader}>
          {/* Avatar overlapping banner bottom edge */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarWrapLinkedIn}>
              {displayAvatar ? (
                <CachedImage uri={displayAvatar} style={styles.heroAvatarLinkedIn} contentFit="cover" />
              ) : (
                <View style={[styles.heroAvatarLinkedIn, { backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="person" size={40} color={Colors.textMuted} />
                </View>
              )}
            </View>
          </View>
          <View style={styles.heroInfoLinkedIn}>
            <Text style={styles.heroNameLinkedIn}>{displayUsername}</Text>
            <Text style={styles.heroHandleLinkedIn}>{displayHandle}</Text>
            {targetProfile?.bio ? (
              <Text style={styles.heroBio} numberOfLines={2}>{targetProfile.bio}</Text>
            ) : null}
          </View>

          <View style={styles.statsCard}>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{profileListings.length}</Text>
              <Text style={styles.statLabel}>Listings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{isSelfProfile ? (currentUser as any)?.emailVerified ? 'Yes' : 'No' : '—'}</Text>
              <Text style={styles.statLabel}>Verified</Text>
            </View>
          </View>

          <View style={styles.heroActionRow}>
            <AppButton
              title={isSelfProfile ? 'Edit profile' : isBlocked ? 'Blocked' : following ? 'Following' : 'Follow user'}
              variant={following && !isSelfProfile ? 'secondary' : 'primary'}
              size="sm"
              align="center"
              style={styles.heroActionPrimary}
              titleStyle={styles.heroActionPrimaryText}
              onPress={() => {
                if (isSelfProfile) {
                  navigation.navigate('EditProfile');
                  return;
                }

                if (isBlocked) {
                  show('This user is blocked. Unblock them before following.', 'info');
                  return;
                }

                setFollowing((prev) => !prev);
              }}
              accessibilityLabel={
                isSelfProfile
                  ? 'Edit profile'
                  : isBlocked
                    ? 'Profile blocked'
                    : following
                      ? 'Following user'
                      : 'Follow user'
              }
              accessibilityHint={
                isSelfProfile
                  ? 'Opens profile editor'
                  : isBlocked
                    ? 'User is blocked. Unblock to follow again'
                    : following
                      ? 'Double tap to unfollow this user'
                      : 'Double tap to follow this user'
              }
            />

            {isSelfProfile ? (
              <AppButton
                title="Share profile"
                variant="secondary"
                size="sm"
                align="center"
                style={styles.heroActionSecondary}
                titleStyle={styles.heroActionSecondaryText}
                onPress={handleShare}
                accessibilityLabel="Share profile"
                accessibilityHint="Opens share sheet for this user profile"
              />
            ) : (
              <AppButton
                title={isBlocked ? 'Unblock first' : 'Message'}
                variant="secondary"
                size="sm"
                align="center"
                style={styles.heroActionSecondary}
                titleStyle={styles.heroActionSecondaryText}
                onPress={() => {
                  if (isBlocked) {
                    show('This user is blocked. Unblock them before messaging.', 'info');
                    return;
                  }

                  handleMessageProfile();
                }}
                accessibilityLabel={isBlocked ? 'Cannot message blocked user' : 'Message user'}
                accessibilityHint={isBlocked ? 'Unblock this user before starting chat' : 'Opens chat with this user'}
              />
            )}

            <AnimatedPressable
              style={styles.heroActionIcon}
              onPress={() => setActionSheetVisible(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="More profile actions"
              accessibilityHint="Shows profile options"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={TEXT} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Index 1: Sticky Tabs */}
        <View style={styles.stickyTabWrapper}>
          <AppSegmentControl
            style={styles.tabBarContainer}
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={setActiveTab}
            fullWidth
            optionStyle={styles.tabPill}
            optionActiveStyle={styles.tabPillActive}
            optionTextStyle={styles.tabText}
            optionTextActiveStyle={styles.tabTextActive}
          />
        </View>

        {/* Index 2: Tab Content */}
        <View style={styles.tabContentArea}>
          {activeTab === 'Listings' && (
            <View style={styles.gridListContent}>
              {groupedListings.map((pair, rowIndex) => (
                <View key={rowIndex} style={styles.rowWrapper}>
                  {pair[0] && renderItem(pair[0])}
                  {pair[1] && renderItem(pair[1])}
                </View>
              ))}
            </View>
          )}

          {activeTab === 'About' && (
            <View style={styles.aboutContent}>
              {hasRealUserData && (currentUser as any)?.bio ? (
                <View style={styles.aboutBlock}>
                  <Text style={styles.aboutLabel}>Bio</Text>
                  <Text style={styles.aboutText}>{(currentUser as any).bio}</Text>
                </View>
              ) : null}
              {hasRealUserData && (currentUser as any)?.location ? (
                <View style={styles.aboutBlock}>
                  <Text style={styles.aboutLabel}>Location</Text>
                  <Text style={styles.aboutText}>{(currentUser as any).location}</Text>
                </View>
              ) : null}
              {hasRealUserData && (currentUser as any)?.website ? (
                <View style={styles.aboutBlock}>
                  <Text style={styles.aboutLabel}>Website</Text>
                  <Text style={styles.aboutText}>{(currentUser as any).website}</Text>
                </View>
              ) : null}
              {(!hasRealUserData || (!(currentUser as any)?.bio && !(currentUser as any)?.location && !(currentUser as any)?.website)) && (
                <Text style={{ color: MUTED, textAlign: 'center', marginTop: 40 }}>No additional info.</Text>
              )}
            </View>
          )}
        </View>
      </AnimatedScrollView>

      {/* Flagship Bottom Sheet Overrides */}
      <BottomSheet visible={actionSheetVisible} onDismiss={() => setActionSheetVisible(false)} snapPoint={0.3}>
        <View style={{ paddingVertical: 10 }}>
          <Text style={{ fontSize: 18, fontFamily: Typography.family.bold, color: TEXT, marginBottom: 20 }}>User Actions</Text>
          <Text style={{ fontSize: 14, fontFamily: Typography.family.medium, color: MUTED, textAlign: 'center', paddingVertical: 20 }}>
            Report and block features are coming soon.
          </Text>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  
  floatingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  floatingHeaderTitle: { fontSize: 18, fontFamily: Typography.family.bold, color: TEXT, textTransform: 'uppercase', letterSpacing: 1 },
  
  floatingHeaderActions: {
    position: 'absolute', left: 0, right: 0,
    zIndex: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  iconBackdrop: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center'
  },

  coverWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: COVER_HEIGHT,
    zIndex: 0,
    overflow: 'hidden',
  },
  coverImage: { width: '100%', height: '100%' },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  
  scrollContent: {
    minHeight: '100%',
  },

  profileHeader: {
    paddingHorizontal: 20, 
    paddingBottom: 24,
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatarContainer: {
    marginTop: -(AVATAR_SIZE / 2 + 10),
    paddingHorizontal: 20,
    zIndex: 10,
    alignItems: 'center',
  },
  avatarWrapLinkedIn: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.background,
    borderWidth: 4,
    borderColor: Colors.background,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  heroAvatarLinkedIn: {
    width: '100%',
    height: '100%',
  },
  heroInfoLinkedIn: {
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginTop: 16,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  followBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  followBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  messageBtn: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageBtnText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: CARD_ALT,
    alignItems: 'center', justifyContent: 'center',
  },
  heroInfo: { flex: 1 },
  heroNameLinkedIn: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginTop: 8,
  },
  heroHandleLinkedIn: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: MUTED,
    textAlign: 'center',
    marginTop: 2,
  },
  heroBio: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: MUTED,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  heroRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroReviewCount: { fontSize: 14, fontFamily: Typography.family.medium, color: MUTED },
  
  statsCard: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 24,
    paddingVertical: 18,
    marginBottom: 28,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
  },
  statCol: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: Typography.size.title, fontFamily: Typography.family.bold, color: TEXT, marginBottom: 2 },
  statLabel: { fontSize: Typography.size.caption, fontFamily: Typography.family.medium, color: MUTED },
  statDivider: { width: 6, backgroundColor: 'transparent' },
  
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  heroActionPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
  },
  heroActionPrimaryActive: {
    backgroundColor: 'transparent',
  },
  heroActionPrimaryText: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: Colors.background,
    letterSpacing: 0.15,
  },
  heroActionPrimaryTextActive: {
    color: TEXT,
  },
  heroActionSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
  },
  heroActionSecondaryText: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: 0.15,
  },
  heroActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyTabWrapper: {
    backgroundColor: BG,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tabBarContainer: {
    paddingHorizontal: Space.lg,
    gap: Space.sm,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    minWidth: 80,
  },
  tabPillActive: { backgroundColor: Colors.brand },
  tabText: { fontSize: Typography.size.body, fontFamily: Typography.family.medium, color: MUTED },
  tabTextActive: { color: Colors.background, fontFamily: Typography.family.bold },

  tabContentArea: {
    backgroundColor: BG,
    minHeight: width,
    paddingTop: 16,
    paddingBottom: 100,
  },

  // Grid / Listings
  gridListContent: { paddingHorizontal: 20 },
  rowWrapper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  gridItem: { width: ITEM_SIZE },
  gridImageWrap: {
    width: ITEM_SIZE,
    height: ITEM_SIZE * 1.3,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: CARD,
    marginBottom: Space.sm,
  },
  gridSharedImage: {
    ...StyleSheet.absoluteFillObject,
  },
  gridImage: { width: '100%', height: '100%' },
  likeBtnPill: {
    position: 'absolute', top: Space.sm, right: Space.sm,
    width: 32, height: 32, borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  gridInfo: { paddingHorizontal: 4, minHeight: 56 },
  gridPrice: { color: TEXT, fontSize: Typography.size.bodyLarge, fontFamily: Typography.family.bold, marginBottom: 2 },
  gridBrand: { color: Colors.textSecondary, fontSize: Typography.size.caption - 1, fontFamily: Typography.family.bold, textTransform: 'uppercase', letterSpacing: Typography.tracking.caps, marginBottom: 3 },
  gridSizeCondition: { color: MUTED, fontSize: Typography.size.caption + 1, fontFamily: Typography.family.medium },

  // Reviews Tab
  reviewsContent: { paddingHorizontal: 0 },
  ratingHero: { alignItems: 'center', paddingVertical: 40 },
  ratingBigNumber: { fontSize: Typography.size.giant, fontFamily: Typography.family.bold, color: TEXT, letterSpacing: -2, lineHeight: 80 },
  ratingTotalText: { fontSize: Typography.size.body, fontFamily: Typography.family.medium, color: MUTED, marginTop: 12 },
  
  reviewsFilterRow: { paddingHorizontal: 20, marginBottom: 24 },
  reviewsFilterStrip: { gap: 10 },
  filterChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, backgroundColor: CARD_ALT },
  filterChipActive: { backgroundColor: Colors.brand },
  filterChipText: { fontSize: Typography.size.body, fontFamily: Typography.family.medium, color: MUTED },
  filterChipTextActive: { color: Colors.background, fontFamily: Typography.family.bold },
  
  reviewsList: { paddingHorizontal: 20 },
  reviewBlock: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.03,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
  },
  reviewerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: CARD_ALT, alignItems: 'center', justifyContent: 'center' },
  reviewerAvatarAuto: { width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  reviewerAvatarAutoText: { fontSize: Typography.size.bodyLarge, fontFamily: Typography.family.bold, color: Colors.background },
  reviewBlockInfo: { flex: 1 },
  reviewSenderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  reviewSenderName: { fontSize: Typography.size.body, fontFamily: Typography.family.bold, color: TEXT },
  reviewTime: { fontSize: Typography.size.caption + 1, fontFamily: Typography.family.regular, color: MUTED },
  reviewBody: { fontSize: Typography.size.body, fontFamily: Typography.family.regular, color: TEXT, marginTop: 8, lineHeight: 22 },

  // About Tab
  aboutContent: { paddingHorizontal: 20 },
  aboutBannerImage: {
    height: 200,
    backgroundColor: CARD,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  aboutBigName: { fontSize: Typography.size.heading, fontFamily: Typography.family.bold, color: TEXT, letterSpacing: -1, marginBottom: 32 },
  
  aboutInfoCard: {
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 28,
    marginBottom: 20,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.03,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
  },
  aboutSectionHeading: { fontSize: Typography.size.caption + 1, fontFamily: Typography.family.bold, color: MUTED, textTransform: 'uppercase', letterSpacing: Typography.tracking.caps, marginBottom: 20 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  honestNote: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  aboutRowText: { fontSize: Typography.size.body, fontFamily: Typography.family.medium, color: TEXT },
  aboutBlock: {
    backgroundColor: CARD,
    borderRadius: Radius.lg,
    padding: Space.lg,
    marginBottom: Space.md,
  },
  aboutLabel: {
    fontSize: Typography.size.caption,
    fontFamily: Typography.family.bold,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: Typography.tracking.caps,
    marginBottom: Space.sm,
  },
  aboutText: {
    fontSize: Typography.size.body,
    fontFamily: Typography.family.regular,
    color: TEXT,
    lineHeight: 22,
  },
});


