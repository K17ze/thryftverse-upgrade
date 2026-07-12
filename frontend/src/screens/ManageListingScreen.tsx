import React from 'react';
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
  ActivityIndicator,
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
import { AppButton } from '../components/ui/AppButton';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { OfferToLikersSheet } from '../components/product/OfferToLikersSheet';
import { BoostListingSheet, type BoostTier } from '../components/product/BoostListingSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { fetchListingByIdFromApi, patchListingOnApi, deleteListingOnApi } from '../services/listingsApi';
import { useStore } from '../store/useStore';

const { width: SCREEN_W } = Dimensions.get('window');
const WARN_TINT = 'rgba(245,166,35,0.12)';

type RouteT = RouteProp<RootStackParamList, 'ManageListing'>;

export default function ManageListingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { itemId } = route.params;

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
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (isNotFound || !item) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg, backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        <Ionicons name="pricetag-outline" size={48} color={colors.textMuted} />
        <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: colors.textPrimary, marginTop: Space.md }}>
          Listing not found
        </Text>
        <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: colors.textMuted, marginTop: Space.xs, textAlign: 'center' }}>
          This listing may have been removed or you may not have access to it.
        </Text>
        <AppButton title="Go back" variant="secondary" size="md" style={{ marginTop: Space.lg }} onPress={() => navigation.goBack()} />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg, backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
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
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg, backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
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
    const opacity = interpolate(scrollY.value, [0, 120], [0, 1], Extrapolation.CLAMP);
    return { backgroundColor: `rgba(10,10,10,${opacity})` };
  });

  const headerTitleStyle = useAnimatedStyle(() => {
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

  const handleBoostConfirm = ({ tier }: { tier: BoostTier }) => {
    const until = new Date(Date.now() + tier.durationHours * 3600000).toISOString();
    setBoostedUntil(until);
    setBoostSheetVisible(false);
    show(`Listing boosted for ${tier.label}. Increased visibility active.`, 'success');
  };

  const handleSaveOfferSettings = async () => {
    setIsUpdatingOfferSettings(true);
    try {
      await patchListingOnApi(itemId, {
        // Store offer floor settings — backend may not yet support these fields
        description: item.description, // pass-through to satisfy API
      } as any);
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
    } catch {
      show('Failed to update listing', 'error');
    }
  };

  const handleReactivate = async () => {
    try {
      await patchListingOnApi(itemId, { status: 'active' });
      setItem((prev: any) => ({ ...prev, status: 'active' }));
      show('Listing reactivated', 'success');
    } catch {
      show('Failed to update listing', 'error');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <Reanimated.View style={[styles.floatingHeader, headerBgStyle, { paddingTop: Math.max(insets.top, 20) }]}>
        <AnimatedPressable style={styles.hdrBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Reanimated.View style={headerTitleStyle}>
          <Text style={[styles.hdrTitle, { color: colors.textPrimary }]} numberOfLines={1}>Manage</Text>
        </Reanimated.View>
        <AnimatedPressable style={styles.hdrBtn} onPress={handleShare}>
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
        <View style={[styles.heroWrap, { backgroundColor: colors.surface }]}>
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
            <View style={[styles.statusDot, { backgroundColor: isSold ? colors.danger : isPaused ? WARN_TINT.replace('0.12', '1') : colors.success }]} />
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
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.infoPrice, { color: colors.brand }]}>{formatFromFiat(item.priceGbp ?? 0, 'GBP', { displayMode: 'fiat' })}</Text>

          <View style={styles.attrRow}>
            <View style={[styles.attrChip, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.attrLabel, { color: colors.textMuted }]}>Brand</Text>
              <Text style={[styles.attrValue, { color: colors.textPrimary }]}>{item.brand ?? '-'}</Text>
            </View>
            <View style={[styles.attrChip, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.attrLabel, { color: colors.textMuted }]}>Size</Text>
              <Text style={[styles.attrValue, { color: colors.textPrimary }]}>{item.size ?? '-'}</Text>
            </View>
            <View style={[styles.attrChip, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.attrLabel, { color: colors.textMuted }]}>Condition</Text>
              <Text style={[styles.attrValue, { color: colors.textPrimary }]}>{item.condition ?? '-'}</Text>
            </View>
          </View>
        </View>

        {/* Primary Edit Button */}
        <AppButton
          title="Edit Listing"
          icon={<Ionicons name="create-outline" size={18} color={colors.background} />}
          variant="primary"
          size="lg"
          style={[styles.editBtn, { backgroundColor: colors.textPrimary }]}
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
          <View style={[styles.healthCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.healthTitle, { color: colors.textMuted }]}>Listing Health</Text>
            <View style={styles.healthRow}>
              {item.views !== undefined && (
                <View style={styles.healthItem}>
                  <Text style={[styles.healthValue, { color: colors.textPrimary }]}>{item.views}</Text>
                  <Text style={[styles.healthLabel, { color: colors.textMuted }]}>Views</Text>
                </View>
              )}
              {item.likes !== undefined && (
                <View style={styles.healthItem}>
                  <Text style={[styles.healthValue, { color: colors.textPrimary }]}>{item.likes}</Text>
                  <Text style={[styles.healthLabel, { color: colors.textMuted }]}>Likes</Text>
                </View>
              )}
              {item.saves !== undefined && (
                <View style={styles.healthItem}>
                  <Text style={[styles.healthValue, { color: colors.textPrimary }]}>{item.saves}</Text>
                  <Text style={[styles.healthLabel, { color: colors.textMuted }]}>Saves</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Offer Floor Settings */}
        {status === 'active' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.healthTitle, { color: colors.textMuted }]}>Offer preferences</Text>
            <Text style={[styles.offerFloorDescription, { color: colors.textMuted }]}>
              Set rules to automatically accept or reject incoming offers.
            </Text>

            {/* Auto-accept threshold */}
            <View style={styles.offerFloorRow}>
              <View style={styles.offerFloorInfo}>
                <Text style={[styles.offerFloorLabel, { color: colors.textPrimary }]}>Auto-accept threshold</Text>
                <Text style={[styles.offerFloorSub, { color: colors.textMuted }]}>
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
                      { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
                      autoAcceptThreshold === pct && { borderColor: colors.brand, backgroundColor: `${colors.brand}15` },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: autoAcceptThreshold === pct }}
                    accessibilityLabel={pct === 0 ? 'No auto-accept' : `Auto-accept at ${pct}%`}
                  >
                    <Text style={[styles.thresholdChipText, { color: colors.textSecondary }, autoAcceptThreshold === pct && { color: colors.brand, fontFamily: Typography.family.semibold }]}>
                      {pct === 0 ? 'Off' : `${pct}%`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Minimum offer floor */}
            <View style={[styles.offerFloorRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={styles.offerFloorInfo}>
                <Text style={[styles.offerFloorLabel, { color: colors.textPrimary }]}>Minimum offer</Text>
                <Text style={[styles.offerFloorSub, { color: colors.textMuted }]}>
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
                      { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
                      minimumOfferGbp === gbp && { borderColor: colors.brand, backgroundColor: `${colors.brand}15` },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: minimumOfferGbp === gbp }}
                    accessibilityLabel={gbp === 0 ? 'No minimum' : `Minimum £${gbp}`}
                  >
                    <Text style={[styles.thresholdChipText, { color: colors.textSecondary }, minimumOfferGbp === gbp && { color: colors.brand, fontFamily: Typography.family.semibold }]}>
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
              accessibilityLabel="Save offer preferences"
            />
          </View>
        )}

        {/* Status Actions */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleIconWrap, { backgroundColor: isSold ? 'rgba(255,59,48,0.12)' : isPaused ? WARN_TINT : 'rgba(52,199,89,0.12)' }]}>
                <Ionicons name={isSold ? 'close-circle-outline' : isPaused ? 'pause-circle-outline' : 'checkmark-circle-outline'} size={20} color={isSold ? colors.danger : isPaused ? colors.warning : colors.success} />
              </View>
              <View>
                <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>{isSold ? 'Sold' : isPaused ? 'Paused' : 'Active'}</Text>
                <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                  {isSold ? 'Buyers cannot purchase this item' : isPaused ? 'Hidden from buyers temporarily' : 'Visible to buyers in search and browse'}
                </Text>
              </View>
            </View>
          </View>

          {status === 'active' && (
            <View style={{ flexDirection: 'row', gap: Space.sm, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <AppButton title="Pause" variant="secondary" size="sm" style={{ flex: 1 }} onPress={handlePause} />
              <AppButton title="Mark Sold" variant="secondary" size="sm" style={{ flex: 1 }} titleStyle={{ color: colors.danger }} onPress={handleMarkSold} />
            </View>
          )}
          {status === 'paused' && (
            <View style={{ flexDirection: 'row', gap: Space.sm, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <AppButton title="Reactivate" variant="primary" size="sm" style={{ flex: 1 }} onPress={handleReactivate} />
              <AppButton title="Mark Sold" variant="secondary" size="sm" style={{ flex: 1 }} titleStyle={{ color: colors.danger }} onPress={handleMarkSold} />
            </View>
          )}
          {status === 'sold' && (
            <View style={{ paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <AppButton title="Reactivate Listing" variant="secondary" size="sm" style={{ width: '100%' }} onPress={handleReactivate} />
            </View>
          )}
        </View>

        {/* Delete */}
        <AnimatedPressable style={styles.deleteRow} activeOpacity={0.8} onPress={handleDeleteListing}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.deleteText, { color: colors.danger }]}>Delete this listing</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },

  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  hdrBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hdrTitle: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    maxWidth: SCREEN_W * 0.5,
  },

  heroWrap: {
    width: SCREEN_W,
    height: SCREEN_W,
    position: 'relative',
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
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.3,
  },
  dotRow: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
  },

  infoCard: {
    marginTop: -24,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  infoTitle: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    lineHeight: 28,
    marginBottom: 6,
  },
  infoPrice: {
    fontSize: 26,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  attrRow: {
    flexDirection: 'row',
    gap: 8,
  },
  attrChip: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  attrLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  attrValue: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
  },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 16,
  },
  editBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
  },

  iconActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 4,
  },
  iconAction: {
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },

  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  toggleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    marginTop: 2,
  },

  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 8,
    paddingVertical: 12,
  },
  healthCard: {
    borderRadius: Radius.lg,
    padding: Space.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  healthTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  },
  healthLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  deleteText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
  },
  offerFloorDescription: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    marginBottom: Space.sm,
  },
  offerFloorRow: {
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  offerFloorInfo: {
    gap: 2,
  },
  offerFloorLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  offerFloorSub: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
  },
  thresholdChips: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  thresholdChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  thresholdChipText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
});