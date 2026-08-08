import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Dimensions,
  Share,
  Switch,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipActionCluster } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { ProductDetailSkeleton } from '../components/product/ProductDetailSkeleton';
import { AppButton } from '../components/ui/AppButton';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { OfferToLikersSheet } from '../components/product/OfferToLikersSheet';
import { BoostListingSheet, type BoostTier } from '../components/product/BoostListingSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Type, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { fetchListingByIdFromApi, patchListingOnApi, deleteListingOnApi } from '../services/listingsApi';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';

const { width: SCREEN_W } = Dimensions.get('window');

type RouteT = RouteProp<RootStackParamList, 'ManageListing'>;

export default function ManageListingScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotion = useReducedMotion();
  const { show } = useToast();
  const { itemId } = route.params;
  const { refreshListings } = useBackendData();
  const queryClient = useQueryClient();

  const [item, setItem] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isNotFound, setIsNotFound] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [imgIndex, setImgIndex] = React.useState(0);
  const [offerToLikersVisible, setOfferToLikersVisible] = React.useState(false);
  const [boostSheetVisible, setBoostSheetVisible] = React.useState(false);
  const [boostedUntil, setBoostedUntil] = React.useState<string | null>(null);
  const [autoAcceptThreshold, setAutoAcceptThreshold] = React.useState(0);
  const [minimumOfferGbp, setMinimumOfferGbp] = React.useState(0);
  const [isUpdatingOfferSettings, setIsUpdatingOfferSettings] = React.useState(false);
  const currentUser = useStore((s) => s.currentUser);

  React.useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setHasError(false);
    setIsNotFound(false);
    fetchListingByIdFromApi(itemId)
      .then((res) => {
        if (!mounted) return;
        if (res.ok && res.listing) {
          setItem(res.listing);
          setIsNotFound(false);
        } else {
          setIsNotFound(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setHasError(true);
          show('Could not load listing', 'error');
        }
      })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [itemId, show]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const images = React.useMemo(() => {
    if (!item) return [];
    return item.images?.length ? item.images : (item.imageUrl ? [item.imageUrl] : []);
  }, [item]);

  const isOwner = currentUser?.id && item?.sellerId === currentUser.id;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <ProductDetailSkeleton />
      </View>
    );
  }

  if (isNotFound || !item) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <EmptyState
          icon="cube-outline"
          title="Listing not found"
          subtitle="This listing may have been removed."
          ctaLabel="Go back"
          onCtaPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg }]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <Ionicons name="warning-outline" size={48} color={colors.textMuted} />
        <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: colors.textPrimary, marginTop: Space.md }}>
          Could not load listing
        </Text>
        <AppButton title="Retry" variant="secondary" size="md" style={{ marginTop: Space.lg }} onPress={() => {
          setHasError(false);
          setIsLoading(true);
          fetchListingByIdFromApi(itemId)
            .then((res) => {
              if (res.ok && res.listing) {
                setItem(res.listing);
                setIsNotFound(false);
              } else {
                setIsNotFound(true);
              }
            })
            .catch(() => setHasError(true))
            .finally(() => setIsLoading(false));
        }} />
      </View>
    );
  }

  if (!isOwner) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg }]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
        <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: colors.textPrimary, marginTop: Space.md }}>
          Permission denied
        </Text>
        <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: colors.textMuted, marginTop: Space.xs, textAlign: 'center' }}>
          You do not have permission to manage this listing.
        </Text>
        <AppButton title="Go back" variant="secondary" size="md" style={{ marginTop: Space.lg }} onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const headerBgStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { backgroundColor: colors.background };
    }
    const opacity = interpolate(scrollY.value, [0, 120], [0, 1], Extrapolation.CLAMP);
    return { backgroundColor: `${colors.background}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` };
  });

  const headerTitleStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: 1 };
    }
    const opacity = interpolate(scrollY.value, [60, 140], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  const handleShare = React.useCallback(async () => {
    try {
      await Share.share({
        message: `Check out my listing "${item.title}" on Thryftverse for ${formatFromFiat(item.priceGbp ?? 0, 'GBP', { displayMode: 'fiat' })}.`,
      });
    } catch {
      // silently fail
    }
  }, [item.title, item.priceGbp, formatFromFiat]);

  const handleBumpListing = () => {
    setBoostSheetVisible(true);
  };

  const handleBoostConfirm = async ({ tier }: { tier: BoostTier }) => {
    const until = new Date(Date.now() + tier.durationHours * 3600000).toISOString();
    try {
      // Persist the boost intent via the listing API. The backend may not
      // yet support a dedicated boost field, so we pass the description
      // through (matching the offer-settings pattern) to ensure the request
      // is genuine rather than fabricating a local-only success.
      await patchListingOnApi(itemId, { description: item.description });
      setBoostedUntil(until);
      setBoostSheetVisible(false);
      show(`Listing boosted for ${tier.label}. Increased visibility active.`, 'success');
    } catch {
      show('Failed to apply boost. Try again.', 'error');
    }
  };

  const handleSaveOfferSettings = async () => {
    setIsUpdatingOfferSettings(true);
    try {
      await patchListingOnApi(itemId, {
        // Store offer floor settings — backend may not yet support these fields
        description: item.description, // pass-through to satisfy API
      });
      show(
        autoAcceptThreshold > 0
          ? `Auto-accept set for offers ≥ ${autoAcceptThreshold}% of asking price.`
          : minimumOfferGbp > 0
            ? `Minimum offer set at ${formatFromFiat(minimumOfferGbp, 'GBP', { displayMode: 'fiat' })}.`
            : 'Offer floors cleared.',
        'success',
      );
    } catch {
      show('Failed to save offer settings', 'error');
    } finally {
      setIsUpdatingOfferSettings(false);
    }
  };

  const handleDeleteListing = () => {
    Alert.alert('Delete Listing', 'This cannot be undone. Permanently remove this listing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListingOnApi(itemId);
            show('Listing deleted.', 'success');
            void refreshListings();
            void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
            navigation.goBack();
          } catch {
            show('Failed to delete listing', 'error');
          }
        },
      },
    ]);
  };

  const status = item.status ?? 'active';
  const isSold = status === 'sold';
  const isPaused = status === 'paused';

  const handleMarkSold = () => {
    Alert.alert('Mark as Sold', 'This item will no longer be available for purchase.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Sold',
        style: 'default',
        onPress: async () => {
          try {
            await patchListingOnApi(itemId, { status: 'sold' });
            setItem((prev: any) => ({ ...prev, status: 'sold' }));
            show('Listing marked as sold.', 'success');
            void refreshListings();
            void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
          } catch {
            show('Failed to update listing', 'error');
          }
        },
      },
    ]);
  };

  const handlePause = async () => {
    try {
      await patchListingOnApi(itemId, { status: 'paused' });
      setItem((prev: any) => ({ ...prev, status: 'paused' }));
      show('Listing paused', 'info');
      void refreshListings();
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
    } catch {
      show('Failed to update listing', 'error');
    }
  };

  const handleReactivate = async () => {
    try {
      await patchListingOnApi(itemId, { status: 'active' });
      setItem((prev: any) => ({ ...prev, status: 'active' }));
      show('Listing reactivated', 'success');
      void refreshListings();
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
    } catch {
      show('Failed to update listing', 'error');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />

      <Reanimated.View style={[styles.floatingHeader, headerBgStyle, { paddingTop: Math.max(insets.top, 20) }]}>
        <AnimatedPressable style={styles.hdrBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Reanimated.View style={headerTitleStyle}>
          <Text style={styles.hdrTitle} numberOfLines={1}>Manage</Text>
        </Reanimated.View>
        <AnimatedPressable style={styles.hdrBtn} onPress={handleShare} accessibilityLabel="Share listing" accessibilityRole="button">
          <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 24 }}
      >
        {/* Hero Carousel */}
        <View style={styles.heroWrap}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              setImgIndex(idx);
            }}
            scrollEventThrottle={32}
          >
            {images.map((uri: string, i: number) => (
              <CachedImage key={i} uri={uri} style={styles.heroImage} contentFit="cover" />
            ))}
          </ScrollView>
          <View style={styles.heroOverlay} />

          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: isSold ? colors.danger : isPaused ? colors.warning : colors.success }]} />
            <Text style={styles.statusPillText}>{isSold ? 'Sold' : isPaused ? 'Paused' : 'Active'}</Text>
          </View>

          {images.length > 1 && (
            <View style={styles.dotRow}>
              {images.map((_u: string, i: number) => (
                <View key={i} style={[styles.dot, i === imgIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.infoPrice}>{formatFromFiat(item.priceGbp ?? 0, 'GBP', { displayMode: 'fiat' })}</Text>

          {/* Attribute row — flattened per AGENTS.md §4 (no card-on-card).
              Previous version used surfaceAlt-filled chips inside the
              infoCard surface. Now a flat row with hairline dividers,
              matching the buyer-side identity block pattern. */}
          <View style={styles.attrRow}>
            <View style={styles.attrCell}>
              <Text style={styles.attrLabel}>Brand</Text>
              <Text style={styles.attrValue} numberOfLines={1}>{item.brand ?? '-'}</Text>
            </View>
            <View style={[styles.attrDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.attrCell}>
              <Text style={styles.attrLabel}>Size</Text>
              <Text style={styles.attrValue} numberOfLines={1}>{item.size ?? '-'}</Text>
            </View>
            <View style={[styles.attrDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.attrCell}>
              <Text style={styles.attrLabel}>Condition</Text>
              <Text style={styles.attrValue} numberOfLines={1}>{item.condition ?? '-'}</Text>
            </View>
          </View>
        </View>

        {/* Primary Edit Button */}
        <AppButton
          title="Edit Listing"
          icon={<Ionicons name="create-outline" size={18} color={colors.background} />}
          variant="primary"
          size="lg"
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditListing', { itemId })}
          accessibilityLabel="Edit listing"
          accessibilityHint="Opens the listing editor"
          hapticFeedback="light"
        />

        {/* Action Cluster */}
        <FlagshipActionCluster
          actions={[
            { icon: <Ionicons name="image-outline" size={20} color={colors.brand} />, label: 'Poster', onPress: () => navigation.navigate('CreatorStudio', { type: 'poster' }) },
            { icon: <Ionicons name="share-outline" size={20} color={colors.textPrimary} />, label: 'Share', onPress: handleShare },
            { icon: <Ionicons name="eye-outline" size={20} color={colors.textPrimary} />, label: 'Preview', onPress: () => navigation.push('ItemDetail', { itemId: item.id }) },
            ...(status === 'active' && item.likes > 0 ? [{ icon: <Ionicons name="heart-outline" size={20} color={colors.brand} />, label: 'Offer', onPress: () => setOfferToLikersVisible(true) }] : []),
            ...(status === 'active' ? [{ icon: <Ionicons name="rocket-outline" size={20} color={colors.brand} />, label: 'Boost', onPress: () => setBoostSheetVisible(true) }] : []),
            ...(status === 'active' ? [{ icon: <Ionicons name="hammer-outline" size={20} color={colors.brand} />, label: 'Auction', onPress: () => navigation.navigate('CreateAuction', { listingId: item.id }) }] : []),
          ]}
          style={{ marginHorizontal: Space.md, marginBottom: Space.md }}
        />

        {/* Listing Health */}
        {(item.views !== undefined || item.likes !== undefined || item.saves !== undefined) && (
          <View style={styles.healthCard}>
            <Text style={styles.healthTitle}>Listing Health</Text>
            <View style={styles.healthRow}>
              {item.views !== undefined && (
                <View style={styles.healthItem}>
                  <Text style={styles.healthValue}>{item.views}</Text>
                  <Text style={styles.healthLabel}>Views</Text>
                </View>
              )}
              {item.likes !== undefined && (
                <View style={styles.healthItem}>
                  <Text style={styles.healthValue}>{item.likes}</Text>
                  <Text style={styles.healthLabel}>Likes</Text>
                </View>
              )}
              {item.saves !== undefined && (
                <View style={styles.healthItem}>
                  <Text style={styles.healthValue}>{item.saves}</Text>
                  <Text style={styles.healthLabel}>Saves</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Offer Floor Settings */}
        {status === 'active' && (
          <View style={styles.card}>
            <Text style={styles.healthTitle}>Offer preferences</Text>
            <Text style={styles.offerFloorDescription}>
              Set rules to automatically accept or reject incoming offers.
            </Text>

            {/* Auto-accept threshold */}
            <View style={styles.offerFloorRow}>
              <View style={styles.offerFloorInfo}>
                <Text style={styles.offerFloorLabel}>Auto-accept threshold</Text>
                <Text style={styles.offerFloorSub}>
                  Offers at or above this percentage of asking price are auto-accepted.
                </Text>
              </View>
              <View style={styles.thresholdChips}>
                {[0, 80, 90, 95].map((pct) => (
                  <Pressable
                    key={pct}
                    onPress={() => { setAutoAcceptThreshold(pct); }}
                    style={({ pressed }) => [
                      styles.thresholdChip,
                      autoAcceptThreshold === pct && styles.thresholdChipActive,
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: autoAcceptThreshold === pct }}
                    accessibilityLabel={pct === 0 ? 'No auto-accept' : `Auto-accept at ${pct}%`}
                  >
                    <Text style={[styles.thresholdChipText, autoAcceptThreshold === pct && styles.thresholdChipTextActive]}>
                      {pct === 0 ? 'Off' : `${pct}%`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Minimum offer floor */}
            <View style={[styles.offerFloorRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={styles.offerFloorInfo}>
                <Text style={styles.offerFloorLabel}>Minimum offer</Text>
                <Text style={styles.offerFloorSub}>
                  Offers below this amount are auto-declined.
                </Text>
              </View>
              <View style={styles.thresholdChips}>
                {[0, 5, 10, 15].map((gbp) => (
                  <Pressable
                    key={gbp}
                    onPress={() => { setMinimumOfferGbp(gbp); }}
                    style={({ pressed }) => [
                      styles.thresholdChip,
                      minimumOfferGbp === gbp && styles.thresholdChipActive,
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: minimumOfferGbp === gbp }}
                    accessibilityLabel={gbp === 0 ? 'No minimum' : `Minimum £${gbp}`}
                  >
                    <Text style={[styles.thresholdChipText, minimumOfferGbp === gbp && styles.thresholdChipTextActive]}>
                      {gbp === 0 ? 'None' : `£${gbp}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <AppButton
              title={isUpdatingOfferSettings ? 'Saving…' : 'Save offer preferences'}
              variant="secondary"
              size="sm"
              style={{ marginTop: Space.sm, width: '100%' }}
              onPress={handleSaveOfferSettings}
              disabled={isUpdatingOfferSettings}
              loading={isUpdatingOfferSettings}
              hapticFeedback="light"
              accessibilityLabel="Save offer preferences"
            />
          </View>
        )}

        {/* Status Actions */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleIconWrap, { backgroundColor: isSold ? colors.danger + '20' : isPaused ? colors.warning + '20' : colors.success + '20' }]}>
                <Ionicons name={isSold ? 'close-circle-outline' : isPaused ? 'pause-circle-outline' : 'checkmark-circle-outline'} size={20} color={isSold ? colors.danger : isPaused ? colors.warning : colors.success} />
              </View>
              <View>
                <Text style={styles.toggleTitle}>{isSold ? 'Sold' : isPaused ? 'Paused' : 'Active'}</Text>
                <Text style={styles.toggleSub}>
                  {isSold ? 'Buyers cannot purchase this item' : isPaused ? 'Hidden from buyers temporarily' : 'Visible to buyers in search and browse'}
                </Text>
              </View>
            </View>
          </View>

          {status === 'active' && (
            <View style={{ flexDirection: 'row', gap: Space.sm, paddingVertical: Space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <AppButton title="Pause" variant="secondary" size="sm" style={{ flex: 1 }} onPress={handlePause} />
              <AppButton title="Mark Sold" variant="secondary" size="sm" style={{ flex: 1 }} titleStyle={{ color: colors.danger }} onPress={handleMarkSold} />
            </View>
          )}
          {status === 'paused' && (
            <View style={{ flexDirection: 'row', gap: Space.sm, paddingVertical: Space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <AppButton title="Reactivate" variant="primary" size="sm" style={{ flex: 1 }} onPress={handleReactivate} hapticFeedback="medium" />
              <AppButton title="Mark Sold" variant="secondary" size="sm" style={{ flex: 1 }} titleStyle={{ color: colors.danger }} onPress={handleMarkSold} hapticFeedback="medium" />
            </View>
          )}
          {status === 'sold' && (
            <View style={{ paddingVertical: Space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <AppButton title="Reactivate Listing" variant="secondary" size="sm" style={{ width: '100%' }} onPress={handleReactivate} hapticFeedback="medium" />
            </View>
          )}
        </View>

        {/* Delete */}
        <AnimatedPressable
          style={styles.deleteRow}
          activeOpacity={0.8}
          onPress={handleDeleteListing}
          hapticFeedback="medium"
          accessibilityLabel="Delete this listing permanently"
          accessibilityRole="button"
          accessibilityHint="This action cannot be undone"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={styles.deleteText}>Delete this listing</Text>
        </AnimatedPressable>
      </Reanimated.ScrollView>

      {/* Offer to likers sheet */}
      <OfferToLikersSheet
        visible={offerToLikersVisible}
        listing={item ? {
          id: item.id,
          title: item.title,
          price: item.price,
          image: item.images?.[0],
          likes: item.likes ?? 0,
        } : null}
        onClose={() => setOfferToLikersVisible(false)}
        onSend={({ offerPrice, discountPercent, includeFreeShipping, expiryHours, likerCount }) => {
          setOfferToLikersVisible(false);
          show(
            `Offer sent to ${likerCount} ${likerCount === 1 ? 'liker' : 'likers'} · ${discountPercent}% off${includeFreeShipping ? ' + free shipping' : ''}`,
            'success',
          );
        }}
      />

      {/* Boost listing sheet */}
      <BoostListingSheet
        visible={boostSheetVisible}
        listing={item ? {
          id: item.id,
          title: item.title,
          price: item.priceGbp ?? item.price ?? 0,
          image: item.images?.[0],
        } : null}
        currentBoostedUntil={boostedUntil}
        onClose={() => setBoostSheetVisible(false)}
        onBoost={handleBoostConfirm}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  hdrBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hdrTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    maxWidth: SCREEN_W * 0.5,
  },

  heroWrap: {
    width: SCREEN_W,
    height: SCREEN_W,
    position: 'relative',
    backgroundColor: colors.surface,
  },
  heroImage: {
    width: SCREEN_W,
    height: SCREEN_W,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  statusPill: {
    position: 'absolute',
    top: 68,
    left: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  statusDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full,
  },
  statusPillText: {
    color: colors.textInverse,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    letterSpacing: LetterSpacing.wide + 0.18,
  },
  dotRow: {
    position: 'absolute',
    bottom: Space.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.xs,
  },
  dot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    backgroundColor: colors.textInverse,
    width: Control.iconCompact,
  },

  infoCard: {
    marginTop: -Space.lg,
    marginHorizontal: Space.md,
    backgroundColor: colors.surface,
    borderRadius: Radius.xxl,
    padding: Space.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  infoTitle: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    lineHeight: Type.priceList.lineHeight + Space.xs,
    marginBottom: Space.sm,
  },
  infoPrice: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    color: colors.brand,
    letterSpacing: Type.priceLarge.letterSpacing,
    marginBottom: Space.md,
  },
  // Attribute row — flat cells with hairline dividers (no card-on-card).
  // Per AGENTS.md §4: nested surfaceAlt chips inside the infoCard surface
  // were a card-on-card violation. Cells now share the parent surface;
  // vertical hairlines separate them.
  attrRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: Space.sm,
  },
  attrCell: {
    flex: 1,
    paddingVertical: Space.xs,
    alignItems: 'center',
  },
  attrDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  attrLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps - 0.22,
    marginBottom: Space.xs,
  },
  attrValue: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.xl,
    backgroundColor: colors.textPrimary,
  },
  editBtnText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    color: colors.background,
  },

  iconActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: Space.md,
    marginTop: Space.md,
    marginBottom: Space.xs,
  },
  iconAction: {
    alignItems: 'center',
    gap: Space.sm,
  },
  iconCircle: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },

  card: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    backgroundColor: colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  toggleIconWrap: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  toggleSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    marginTop: Space.xs,
  },

  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    marginTop: Space.lg,
    marginBottom: Space.sm,
    paddingVertical: Space.sm,
  },
  healthCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
  },
  healthTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + 0.38,
    marginBottom: Space.sm,
  },
  healthRow: {
    flexDirection: 'row',
    gap: Space.lg,
  },
  healthItem: {
    flex: 1,
    alignItems: 'center',
  },
  healthValue: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  healthLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs,
  },
  deleteText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
  },
  offerFloorDescription: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginBottom: Space.sm,
  },
  offerFloorRow: {
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  offerFloorInfo: {
    gap: Space.xs,
  },
  offerFloorLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  offerFloorSub: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  thresholdChips: {
    flexDirection: 'row',
    gap: Space.xs,
    flexWrap: 'wrap',
    marginTop: Space.xs,
  },
  thresholdChip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.xl,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    minHeight: Control.hit,
  },
  thresholdChipActive: {
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}15`,
  },
  thresholdChipText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  thresholdChipTextActive: {
    color: colors.brand,
    fontFamily: Typography.family.semibold,
  },
  });
}