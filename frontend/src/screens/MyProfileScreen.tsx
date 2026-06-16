import React from 'react';

import {

  View,

  Text,

  StyleSheet,

  ScrollView,

  StatusBar,

  Dimensions,

  Share,

} from 'react-native';

import { EmptyState } from '../components/EmptyState';

import { Video, ResizeMode } from '../components/compat/Video';

import * as ImagePicker from 'expo-image-picker';

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

import { Typography } from '../theme/designTokens';

import { useStore } from '../store/useStore';

import { useNavigation } from '@react-navigation/native';

import { StackNavigationProp } from '@react-navigation/stack';

import { RootStackParamList } from '../navigation/types';

import { useFormattedPrice } from '../hooks/useFormattedPrice';

import { useBackendData } from '../context/BackendDataContext';

import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';

import { AnimatedPressable } from '../components/AnimatedPressable';

// Phase 3: Removed AnimatedCounter - plain text is cleaner

import { CachedImage } from '../components/CachedImage';

import { SharedTransitionView } from '../components/SharedTransitionView';

import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';

import { AppButton } from '../components/ui/AppButton';
import { FlagshipProfileMedia } from '../components/flagship';
import { ProfileVisualHeader, ProfileTabRail } from '../components/profile';

import { Space, Radius } from '../theme/designTokens';

import { useReducedMotion } from '../hooks/useReducedMotion';

import {

  setStoredUserAvatar,

  setStoredUserAvatarForUser,

  setStoredUserCover,

  setStoredUserCoverForUser,

} from '../preferences/profileMediaPreferences';

import { persistProfileMediaUri } from '../utils/profileMediaAsset';

import { isVideoUri } from '../utils/media';

import { uploadMedia } from '../services/mediaUpload';

import { updateMyProfile } from '../services/profileApi';



type NavT = StackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COVER_HEIGHT = 200;

const AVATAR_SIZE = 108;

const HERO_MEDIA_GAP = 6;

const HERO_MEDIA_TILE = (SCREEN_WIDTH - 40 - HERO_MEDIA_GAP * 2) / 3;

// Phase 3: Simplified to use new 5-core palette

const BRAND = Colors.brand;

const PANEL_BG = Colors.surfaceAlt;

const PANEL_SOFT = Colors.surfaceAlt;

const PANEL_ICON = Colors.surfaceAlt;

const PANEL_BORDER = Colors.border;



const COVER_IMAGE = '';



interface QuickAccessItem {

  icon: string;

  label: string;

  route: keyof RootStackParamList;

  value?: string;

  color: string;

}



export default function MyProfileScreen() {

  const navigation = useNavigation<NavT>();

  const insets = useSafeAreaInsets();

  const reducedMotionEnabled = useReducedMotion();
  const [activeTab, setActiveTab] = React.useState<'edits' | 'looks' | 'pulse'>('edits');

  const { show } = useToast();
  const haptic = useHaptic();

  const { formatFromFiat } = useFormattedPrice();

  const { listings } = useBackendData();
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);

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

  const user = currentUser as any;

  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);

  const updateUserAvatar = useStore((state) => state.updateUserAvatar);

  const updateUserCover = useStore((state) => state.updateUserCover);



  React.useEffect(() => {
    fetchMyProfile().catch(() => {});
  }, [fetchMyProfile]);

  React.useEffect(() => {

    let canceled = false;



    const migrateStoredProfileMediaUris = async () => {

      if (userCover) {

        const persistedCoverUri = await persistProfileMediaUri(userCover, 'cover');

        if (!canceled && persistedCoverUri !== userCover) {

          updateUserCover(persistedCoverUri);

          if (currentUser?.id) {

            Promise.all([

              setStoredUserCover(persistedCoverUri),

              setStoredUserCoverForUser(currentUser.id, persistedCoverUri),

            ]).catch(() => {

              // Keep UX responsive when local persistence fails.

            });

          }

        }

      }



      if (userAvatar) {

        const persistedAvatarUri = await persistProfileMediaUri(userAvatar, 'avatar');

        if (!canceled && persistedAvatarUri !== userAvatar) {

          updateUserAvatar(persistedAvatarUri);

          if (currentUser?.id) {

            Promise.all([

              setStoredUserAvatar(persistedAvatarUri),

              setStoredUserAvatarForUser(currentUser.id, persistedAvatarUri),

            ]).catch(() => {

              // Keep UX responsive when local persistence fails.

            });

          }

        }

      }

    };



    migrateStoredProfileMediaUris().catch(() => {

      // Silent fallback: upload flow still works even when migration fails.

    });



    return () => {

      canceled = true;

    };

  }, [currentUser?.id, updateUserAvatar, updateUserCover, userAvatar, userCover]);



  const pickCover = async () => {

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {

      show('Allow photo library access to upload cover', 'error');

      return;

    }



    try {

      const result = await ImagePicker.launchImageLibraryAsync({

        mediaTypes: ImagePicker.MediaTypeOptions.All,

        allowsEditing: false,

        quality: 1,

      });



      if (!result.canceled && result.assets?.[0]?.uri) {

        const nextCoverUri = await persistProfileMediaUri(result.assets[0].uri, 'cover');

        updateUserCover(nextCoverUri);

        if (currentUser?.id) {

          Promise.all([

            setStoredUserCover(nextCoverUri),

            setStoredUserCoverForUser(currentUser.id, nextCoverUri),

          ]).catch(() => {

            // Keep UX responsive when local persistence fails.

          });

        }

        show('Cover updated', 'success');

      }

    } catch {

      // Silently fail - user can try again

    }

  };



  const pickAvatar = async () => {

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {

      show('Allow photo library access to upload avatar', 'error');

      return;

    }



    try {

      const result = await ImagePicker.launchImageLibraryAsync({

        mediaTypes: ImagePicker.MediaTypeOptions.Images,

        allowsEditing: true,

        aspect: [1, 1],

        quality: 0.86,

      });



      if (!result.canceled && result.assets?.[0]?.uri) {

        const pickedUri = result.assets[0].uri;

        // 1. Persist locally first for immediate display
        const localUri = await persistProfileMediaUri(pickedUri, 'avatar');

        updateUserAvatar(localUri);

        // 2. Upload to backend/MinIO and save public URL
        try {

          const publicUrl = await uploadMedia(pickedUri, 'avatars');

          await updateMyProfile({ avatar: publicUrl });

          updateUserAvatar(publicUrl);

          if (currentUser?.id) {

            Promise.all([

              setStoredUserAvatar(publicUrl),

              setStoredUserAvatarForUser(currentUser.id, publicUrl),

            ]).catch(() => {

              // Keep UX responsive when local persistence fails.

            });

          }

          show('Avatar updated', 'success');

        } catch {

          show('Avatar upload requires media storage connection.', 'error');

          // Keep local URI for preview, but user knows it's not saved to backend.

        }

      }

    } catch {

      // Silently fail - user can try again

    }

  };



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



  // All user.* accesses must happen AFTER the null guard above

  const profileUserId = user.id;

  const profileMediaOverride = profileMediaOverrides[profileUserId] ?? null;

  const displayCover = user.coverPhoto || userCover || profileMediaOverride?.cover || COVER_IMAGE;

  const displayAvatar = user.avatar || userAvatar || profileMediaOverride?.avatar || null;



  const myListings = React.useMemo(() => {

    const owned = listings.filter((item) => item.sellerId === profileUserId);

    return owned.slice(0, 6);

  }, [listings, profileUserId]);



  const heroMediaListings = React.useMemo(

    () => myListings.filter((item) => item.images && item.images.length > 0),

    [myListings]

  );



  /* coOwnHoldings now fetched from backend via useEffect above */



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



  const quickAccess = React.useMemo<QuickAccessItem[]>(

    () => [

      { icon: 'receipt-outline', label: 'Orders', route: 'MyOrders', color: BRAND },

      {

        icon: 'shirt-outline',

        label: 'Closet',

        route: 'Closet',

        value: `${savedCount + wishlistCount} items`,

        color: Colors.textSecondary,

      },

      {

        icon: 'wallet-outline',

        label: 'Wallet',

        route: 'Wallet',

        color: Colors.textSecondary,

      },

      {

        icon: 'pie-chart-outline',

        label: 'Co-Own',

        route: 'Portfolio',

        value: `${coOwnHoldings.length} assets`,

        color: Colors.textSecondary,
      },

    ],

    [formatFromFiat, coOwnHoldings.length, savedCount, wishlistCount]

  );



  const AnimatedScrollView = Reanimated.ScrollView;



  return (

    <View style={styles.container}>

      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />



      {/* Cover photo with parallax - supports images, GIFs and videos */}
      <Reanimated.View style={[styles.coverWrap, coverStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf
          onEditCover={pickCover}
          coverOnly
          style={{ width: '100%' }}
        />
      </Reanimated.View>



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

          <View style={styles.topUtilityRight}>
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
          </View>
        </Reanimated.View>
      </View>



      {/* Floating header on scroll */}

      <Reanimated.View style={[styles.floatingHeader, { paddingTop: insets.top }, headerOpacityStyle]}>

        <View style={{ flex: 1 }} />

        <Text style={styles.floatingHeaderTitle} numberOfLines={1} ellipsizeMode="tail">{user.username}</Text>

        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <AnimatedPressable
            style={styles.floatingHeaderAction}
            activeOpacity={0.9}
            onPress={() => { haptic.light(); navigation.navigate('Settings'); }}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            accessibilityHint="Opens account and app settings"
          >
            <Ionicons name="settings-outline" size={20} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>

      </Reanimated.View>


      <AnimatedScrollView

        showsVerticalScrollIndicator={false}

        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT - 60, paddingBottom: 0 }]}

        onScroll={scrollHandler}

        scrollEventThrottle={16}

      >

        {/* Profile Visual Identity */}
        <ProfileVisualHeader
          coverUri={displayCover}
          avatarUri={displayAvatar}
          displayName={user.displayName || user.username}
          username={user.username}
          bio={user.bio}
          verified={false}
          isSelf
          onEditCover={pickCover}
          onEditAvatar={pickAvatar}
          onEditProfile={() => navigation.navigate('EditProfile')}
          onShare={handleShare}
          hideCover
          stats={[
            { label: 'Listings', value: myListings.length },
            { label: 'Saved', value: savedCount + wishlistCount },
            { label: 'Co-Own', value: coOwnHoldings.length },
          ]}
        />

        {/* Quick Access Grid */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
          <View style={styles.quickAccessCard}>
            <View style={styles.quickGrid}>
              {quickAccess.map((item, index) => (
                <AnimatedPressable
                  key={item.route}
                  style={[
                    styles.quickItem,
                    index === quickAccess.length - 1 ? styles.quickItemLastInRow : null,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => { haptic.light(); navigation.navigate(item.route as any); }}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                  <Text style={styles.quickLabel}>{item.label}</Text>
                  {item.value ? <Text style={styles.quickValue}>{item.value}</Text> : null}
                </AnimatedPressable>
              ))}
            </View>
          </View>
        </Reanimated.View>

        {/* Profile Tab Rail */}
        <ProfileTabRail
          tabs={[
            { key: 'edits', label: 'Edits', icon: 'shirt-outline', count: myListings.length },
            { key: 'looks', label: 'Looks', icon: 'bookmark-outline', count: savedCount + wishlistCount },
            { key: 'pulse', label: 'Pulse', icon: 'pulse-outline' },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'edits' | 'looks' | 'pulse')}
        />

        {/* Tab Content */}
        {activeTab === 'edits' && (
          <View style={{ backgroundColor: Colors.background, paddingBottom: 120 }}>
            {/* My Wardrobe */}
            <View style={styles.wardrobeSection}>
              <View style={styles.wardrobeHeader}>
                <View>
                  <Text style={styles.wardrobeSectionLabel}>YOUR EDITS</Text>
                  <Text style={styles.wardrobeTitle}>Published Listings</Text>
                </View>
                <AnimatedPressable
                  style={styles.viewAllBtn}
                  onPress={() => navigation.navigate('UserProfile', { userId: user.id, isMe: true })}
                  accessibilityRole="button"
                  accessibilityLabel="View all listings"
                >
                  <Text style={styles.viewAllText}>View All</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.brand} />
                </AnimatedPressable>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wardrobeScroll}>
                {myListings.length === 0 ? (
                  <AnimatedPressable
                    style={styles.wardrobeEmptyState}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('MainTabs')}
                    accessibilityRole="button"
                  >
                    <View style={styles.wardrobeEmptyIconCircle}>
                      <Ionicons name="add" size={28} color={Colors.brand} />
                    </View>
                    <Text style={styles.wardrobeEmptyTitle}>List your first item</Text>
                    <Text style={styles.wardrobeEmptySubtitle}>Tap to start selling</Text>
                  </AnimatedPressable>
                ) : (
                  myListings.map((item) => (
                    <AnimatedPressable
                      key={item.id}
                      style={styles.wardrobeItem}
                      activeOpacity={0.9}
                      onPress={() => navigation.navigate('ManageListing', { itemId: item.id })}
                      accessibilityRole="button"
                    >
                      <SharedTransitionView
                        style={styles.mediaThumbWrap}
                        sharedTransitionTag={`image-${item.id}-0`}
                      >
                        <CachedImage
                          uri={item.images?.[0] ?? ''}
                          style={styles.mediaThumb}
                          containerStyle={{ width: '100%', height: '100%', borderRadius: 10 }}
                          contentFit="cover"
                        />
                      </SharedTransitionView>
                      <View style={styles.mediaTilePricePill}>
                        <Text style={styles.mediaTilePriceText}>
                          {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {activeTab === 'looks' && (
          <View style={{ backgroundColor: Colors.background, paddingBottom: 120, paddingTop: Space.md }}>
            <Reanimated.View entering={FadeInDown.duration(300).delay(50)}>
              <View style={{ paddingHorizontal: Space.md, marginBottom: Space.lg }}>
                <Text style={styles.wardrobeTitle}>Saved Items</Text>
                <Text style={{ fontFamily: Typography.family.regular, fontSize: 14, color: Colors.textSecondary, marginTop: 4 }}>
                  {savedCount + wishlistCount} items in your closet
                </Text>
              </View>
              <AnimatedPressable
                style={{
                  marginHorizontal: Space.md,
                  backgroundColor: Colors.surface,
                  borderRadius: Radius.lg,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: Space.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Space.sm,
                }}
                onPress={() => navigation.navigate('Closet')}
                activeOpacity={0.9}
              >
                <Ionicons name="bookmark-outline" size={22} color={Colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.family.semibold, fontSize: 15, color: Colors.textPrimary }}>Open Closet</Text>
                  <Text style={{ fontFamily: Typography.family.regular, fontSize: 13, color: Colors.textSecondary }}>View saved, wishlist, and collections</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </AnimatedPressable>
            </Reanimated.View>
          </View>
        )}

        {activeTab === 'pulse' && (
          <View style={{ backgroundColor: Colors.background, paddingBottom: 120, paddingTop: Space.md }}>
            <Reanimated.View entering={FadeInDown.duration(300).delay(50)}>
              <View style={{ paddingHorizontal: Space.md, marginBottom: Space.lg }}>
                <Text style={styles.wardrobeTitle}>Pulse</Text>
                <Text style={{ fontFamily: Typography.family.regular, fontSize: 14, color: Colors.textSecondary, marginTop: 4 }}>
                  Activity and updates from your network
                </Text>
              </View>
              {/* Co-Own Portfolio Summary */}
              <Reanimated.View entering={FadeInDown.duration(300).delay(50)}>
                <View style={styles.portfolioSummaryCard}>
                  <View style={styles.portfolioSummaryTop}>
                    <Text style={styles.portfolioSummaryLabel}>MY CO-OWN HOLDINGS</Text>
                    <AnimatedPressable
                      style={styles.portfolioSummaryLinkBtn}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('Portfolio')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.portfolioSummaryLinkText}>Open</Text>
                      <Ionicons name="arrow-forward" size={14} color={Colors.brand} />
                    </AnimatedPressable>
                  </View>
                  <Text style={styles.portfolioSummaryValue}>{formatFromFiat(holdingsValue, 'GBP')}</Text>
                  <View style={styles.portfolioSummaryMetaRow}>
                    <Text style={styles.portfolioSummaryMeta}>
                      {coOwnHoldings.length} active position{coOwnHoldings.length === 1 ? '' : 's'}
                    </Text>
                    <Text
                      style={[
                        styles.portfolioSummaryPnl,
                        holdingsUnrealized >= 0 ? styles.portfolioPnlUp : styles.portfolioPnlDown,
                      ]}
                    >
                      Unrealized {holdingsUnrealized >= 0 ? '+' : '-'}
                      {formatFromFiat(Math.abs(holdingsUnrealized), 'GBP', { displayMode: 'fiat' })}
                    </Text>
                  </View>
                  {coOwnHoldings.length === 0 && (
                    <AnimatedPressable
                      style={styles.portfolioSummaryCta}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('CoOwnHub')}
                      accessibilityRole="button"
                    >
                      <Ionicons name="sparkles-outline" size={14} color={Colors.background} />
                      <Text style={styles.portfolioSummaryCtaText}>Explore Co-Own Hub</Text>
                    </AnimatedPressable>
                  )}
                </View>
              </Reanimated.View>
              {/* Honest empty state � no fabricated activity */}
              <View style={{
                marginHorizontal: Space.md,
                backgroundColor: Colors.surface,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: Colors.border,
                padding: Space.lg,
                alignItems: 'center',
                gap: Space.md,
              }}>
                <View style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: Colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Ionicons name="pulse-outline" size={28} color={Colors.textMuted} />
                </View>
                <View style={{ alignItems: 'center', gap: Space.xs }}>
                  <Text style={{ fontFamily: Typography.family.semibold, fontSize: 16, color: Colors.textPrimary, textAlign: 'center' }}>
                    No activity yet
                  </Text>
                  <Text style={{ fontFamily: Typography.family.regular, fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                    Pulse shows your sales, bids, follows and community updates. Activity will appear here as it happens.
                  </Text>
                </View>
                <AnimatedPressable
                  style={{
                    marginTop: Space.sm,
                    backgroundColor: Colors.brand,
                    borderRadius: Radius.md,
                    paddingHorizontal: Space.lg,
                    paddingVertical: Space.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Space.xs,
                  }}
                  onPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Explore marketplace"
                >
                  <Text style={{ fontFamily: Typography.family.semibold, fontSize: 14, color: '#fff' }}>Explore Marketplace</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </AnimatedPressable>
              </View>
            </Reanimated.View>
          </View>
        )}      </AnimatedScrollView>

    </View>

  );

}



const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: Colors.background, overflow: 'hidden' },

  scrollContent: { paddingBottom: 120, overflow: 'hidden' },



  // Cover (parallax banner)

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

  coverImage: { width: '100%', height: '100%', backgroundColor: Colors.surfaceAlt },

  coverGradient: {

    ...StyleSheet.absoluteFillObject,

    backgroundColor: 'rgba(0,0,0,0.2)',

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

    alignItems: 'center',

    gap: 8,

  },

  topUtilityIconBtn: {

    width: 44,

    height: 44,

    borderRadius: 20,

    backgroundColor: 'rgba(0,0,0,0.5)',

    alignItems: 'center',

    justifyContent: 'center',

  },

  topUtilityPillBtn: {

    backgroundColor: 'rgba(0,0,0,0.5)',

    width: 32,

    height: 32,

    borderRadius: 16,

    alignItems: 'center',

    justifyContent: 'center',

  },

  topUtilityPillIconWrap: {

    width: 20,

    height: 20,

    borderRadius: 10,

    backgroundColor: 'transparent',

  },

  topUtilityPillText: {

    color: '#fff',

    fontSize: 12,

    fontFamily: Typography.family.semibold,

    letterSpacing: 0.2,

  },



  floatingHeader: {

    position: 'absolute',

    top: 0,

    left: 0,

    right: 0,

    zIndex: 10,

    flexDirection: 'row',

    alignItems: 'center',

    paddingBottom: 16,

    borderBottomWidth: 1,

    borderBottomColor: PANEL_BORDER,

  },

  floatingHeaderTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },

  floatingHeaderAction: {

    width: 44,

    height: 44,

    borderRadius: 18,

    backgroundColor: Colors.surfaceAlt,

    alignItems: 'center',

    justifyContent: 'center',

    marginRight: 14,

  },


  // Hero

  heroSection: {

    alignItems: 'center',

    paddingHorizontal: 20,

    paddingTop: 0,

    paddingBottom: 24,

    backgroundColor: Colors.background,

    borderTopLeftRadius: 22,

    borderTopRightRadius: 22,

  },



  avatarContainer: {

    marginTop: -(AVATAR_SIZE / 2 + 10),

    paddingHorizontal: 20,

    zIndex: 10,

    alignItems: 'center',

  },





  avatarWrap: { position: 'relative' },

  heroAvatarContainer: {

    width: AVATAR_SIZE,

    height: AVATAR_SIZE,

    borderRadius: AVATAR_SIZE / 2,

    borderWidth: 3,

    borderColor: Colors.background,

    overflow: 'hidden',

  },

  heroAvatar: {

    width: '100%',

    height: '100%',

    borderRadius: AVATAR_SIZE / 2,

  },

  editAvatarChip: {

    position: 'absolute',

    right: -3,

    bottom: 0,

    width: 28,

    height: 28,

    borderRadius: 14,

    backgroundColor: '#1c1c1c',

    alignItems: 'center',

    justifyContent: 'center',

  },

  heroName: {

    fontSize: 18,

    lineHeight: 22,

    fontFamily: Typography.family.bold,

    color: Colors.textPrimary,

    marginBottom: 2,

    alignSelf: 'center',

    letterSpacing: -0.3,

    maxWidth: '100%',

    textAlign: 'center',

  },


  heroHandle: {

    fontSize: 11,

    lineHeight: 14,

    fontFamily: Typography.family.medium,

    color: Colors.textSecondary,

    marginBottom: 6,

    letterSpacing: 0.12,

  },









  mediaGrid: {

    marginTop: 16,

    width: '100%',

    flexDirection: 'row',

    flexWrap: 'wrap',

  },

  mediaTile: {

    width: HERO_MEDIA_TILE,

    marginRight: HERO_MEDIA_GAP,

    marginBottom: HERO_MEDIA_GAP,

    position: 'relative',

  },

  mediaTileLast: {

    marginRight: 0,

  },

  mediaThumbWrap: {

    width: HERO_MEDIA_TILE,

    height: HERO_MEDIA_TILE * 1.15,

    borderRadius: 10,

  },

  mediaThumb: {

    width: '100%',

    height: '100%',

    borderRadius: 10,

  },

  mediaTilePricePill: {

    position: 'absolute',

    right: 6,

    bottom: 6,

    borderRadius: 999,

    backgroundColor: 'rgba(0,0,0,0.62)',

    paddingHorizontal: 6,

    paddingVertical: 4,

  },

  mediaTilePriceText: {

    color: '#fff',

    fontSize: 9,

    fontFamily: Typography.family.semibold,

    letterSpacing: 0.08,

  },



  statsHeaderRow: {

    marginTop: 16,

    width: '100%',

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    marginBottom: 8,

  },

  statsTitle: {

    color: Colors.textPrimary,

    fontSize: 14,

    fontFamily: Typography.family.semibold,

    letterSpacing: 0.2,

  },

  statsHint: {

    color: Colors.textMuted,

    fontSize: 11,

    fontFamily: Typography.family.medium,

    textTransform: 'uppercase',

    letterSpacing: 0.5,

  },



  // Stats








  // Quick Access (original layout preserved)

  quickAccessCard: {

    width: '100%',

    marginTop: 16,

    backgroundColor: 'transparent',

    paddingHorizontal: 0,

    paddingVertical: 0,

  },

  quickAccessHeaderRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 12,

    paddingHorizontal: 4,

  },

  quickAccessTitle: {

    fontSize: 14,

    fontFamily: Typography.family.semibold,

    color: Colors.textPrimary,

  },

  quickAccessHint: {

    fontSize: 11,

    color: Colors.textMuted,

  },

  quickGrid: {

    flexDirection: 'row',

    flexWrap: 'wrap',

    justifyContent: 'space-between',

  },

  quickItem: {

    width: '31%',

    alignItems: 'center',

    marginBottom: 10,

    backgroundColor: Colors.surfaceAlt,

    borderRadius: 12,

    borderWidth: 0.5,

    borderColor: Colors.border,

    paddingHorizontal: 4,

    paddingVertical: 8,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.04,

    shadowRadius: 4,

    elevation: 2,

  },

  quickItemLastInRow: {

    marginRight: 0,

  },

  quickIconCircle: {

    width: 28,

    height: 28,

    borderRadius: 10,

    backgroundColor: Colors.surfaceAlt,

    borderWidth: 0.5,

    borderColor: Colors.border,

    alignItems: 'center',

    justifyContent: 'center',

    marginBottom: 4,

  },

  quickLabel: {

    fontSize: 10,

    fontFamily: Typography.family.medium,

    color: Colors.textSecondary,

    textAlign: 'center',

    lineHeight: 12,

    letterSpacing: 0.08,

  },

  quickValue: {

    fontSize: 8,

    fontFamily: Typography.family.semibold,

    color: Colors.brand,

    marginTop: 1,

    letterSpacing: 0.06,

  },



  // Portfolio Summary (original layout preserved)

  portfolioSummaryCard: {

    marginHorizontal: 20,

    backgroundColor: 'transparent',

    borderRadius: 24,

    padding: 20,

    marginBottom: 24,

  },

  portfolioSummaryTop: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 8,

  },

  portfolioSummaryLabel: {

    fontSize: 11,

    fontFamily: Typography.family.semibold,

    color: Colors.brand,

    letterSpacing: 0.9,

  },

  portfolioSummaryLinkBtn: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 4,

  },

  portfolioSummaryLinkText: {

    fontSize: 12,

    fontFamily: Typography.family.semibold,

    color: Colors.brand,

  },

  portfolioSummaryValue: {

    fontSize: 26,

    fontFamily: Typography.family.bold,

    color: Colors.textPrimary,

    letterSpacing: -0.35,

  },

  portfolioSummaryMetaRow: {

    marginTop: 10,

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    gap: 8,

  },

  portfolioSummaryMeta: {

    fontSize: 12,

    fontFamily: Typography.family.medium,

    color: Colors.textSecondary,

    letterSpacing: 0.1,

  },

  portfolioSummaryPnl: {

    fontSize: 12,

    fontFamily: Typography.family.semibold,

  },

  portfolioPnlUp: { color: Colors.brand },

  portfolioPnlDown: { color: '#ff9d9d' },

  portfolioSummaryCta: {

    marginTop: 14,

    borderRadius: 999,

    backgroundColor: Colors.brand,

    alignSelf: 'flex-start',

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    paddingHorizontal: 12,

    paddingVertical: 8,

  },

  portfolioSummaryCtaText: {

    color: Colors.background,

    fontSize: 11,

    fontFamily: Typography.family.semibold,

    letterSpacing: 0.16,

  },



  // Wardrobe (original horizontal scroll layout preserved)

  wardrobeSection: {

    marginBottom: 24,

  },

  wardrobeHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'flex-end',

    paddingHorizontal: 20,

    marginBottom: 16,

  },

  wardrobeSectionLabel: {

    fontSize: 11,

    fontFamily: Typography.family.semibold,

    color: Colors.brand,

    letterSpacing: 1,

    marginBottom: 4,

  },



  wardrobeTitle: {

    fontSize: 20,

    fontFamily: Typography.family.bold,

    color: Colors.textPrimary,

    letterSpacing: -0.25,

  },

  viewAllBtn: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 4,

  },

  viewAllText: {

    fontSize: 13,

    fontFamily: Typography.family.semibold,

    color: Colors.brand,

    letterSpacing: 0.16,

  },

  wardrobeScroll: {

    paddingLeft: 20,

    paddingRight: 8,

    gap: 12,

  },

  wardrobeItem: {

    width: 140,

    position: 'relative',

  },

  wardrobeImageWrap: {

    width: 140,

    height: 180,

    borderRadius: 16,

  },

  wardrobeImage: {

    width: '100%',

    height: '100%',

    borderRadius: 16,

  },

  wardrobeInfo: {

    paddingTop: 8,

    paddingHorizontal: 2,

  },

  wardrobePrice: {

    fontSize: 14,

    fontFamily: Typography.family.semibold,

    color: Colors.textPrimary,

  },

  wardrobeBrand: {

    fontSize: 12,

    fontFamily: Typography.family.regular,

    color: Colors.textSecondary,

    marginTop: 2,

    letterSpacing: 0.08,

  },

  wardrobeLikes: {

    position: 'absolute',

    top: 8,

    right: 8,

    flexDirection: 'row',

    alignItems: 'center',

    gap: 3,

    backgroundColor: 'rgba(0,0,0,0.6)',

    borderRadius: 10,

    paddingHorizontal: 6,

    paddingVertical: 3,

  },

  wardrobeLikeCount: {

    fontSize: 10,

    fontFamily: Typography.family.medium,

    color: Colors.textSecondary,

  },

  wardrobeEmptyState: {

    width: 200,

    height: 180,

    borderRadius: 16,

    borderWidth: 0.5,

    borderColor: Colors.border,

    borderStyle: 'dashed',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 8,

    marginRight: 12,

  },

  wardrobeEmptyIconCircle: {

    width: 48,

    height: 48,

    borderRadius: 24,

    backgroundColor: Colors.surfaceAlt,

    alignItems: 'center',

    justifyContent: 'center',

  },

  wardrobeEmptyTitle: {

    fontSize: 13,

    fontFamily: Typography.family.semibold,

    color: Colors.textPrimary,

  },

  wardrobeEmptySubtitle: {

    fontSize: 11,

    fontFamily: Typography.family.regular,

    color: Colors.textMuted,

  },



});
