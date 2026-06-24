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
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { fetchListingByIdFromApi, patchListingOnApi, deleteListingOnApi } from '../services/listingsApi';
import { useStore } from '../store/useStore';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_BG = Colors.surface;
const CARD_BORDER = Colors.border;
const SUCCESS_TEXT = '#34C759';
const DANGER_TEXT = '#FF3B30';
const BRAND_TINT = Colors.surfaceAlt;
const WARN_TINT = 'rgba(245,166,35,0.12)';
const ICON_BG = Colors.surfaceAlt;

type RouteT = RouteProp<RootStackParamList, 'ManageListing'>;

export default function ManageListingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { itemId } = route.params;

  const [item, setItem] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isNotFound, setIsNotFound] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [imgIndex, setImgIndex] = React.useState(0);
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
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (isNotFound || !item) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg }]}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <Ionicons name="pricetag-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: Space.md }}>
          Listing not found
        </Text>
        <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted, marginTop: Space.xs, textAlign: 'center' }}>
          This listing may have been removed or you may not have access to it.
        </Text>
        <AppButton title="Go back" variant="secondary" size="md" style={{ marginTop: Space.lg }} onPress={() => navigation.goBack()} />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg }]}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <Ionicons name="warning-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: Space.md }}>
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
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: Space.md }}>
          Permission denied
        </Text>
        <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted, marginTop: Space.xs, textAlign: 'center' }}>
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
    show('Listing promotions are not currently available.', 'info');
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
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />

      <Reanimated.View style={[styles.floatingHeader, headerBgStyle, { paddingTop: Math.max(insets.top, 20) }]}>
        <AnimatedPressable style={styles.hdrBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Reanimated.View style={headerTitleStyle}>
          <Text style={styles.hdrTitle} numberOfLines={1}>Manage</Text>
        </Reanimated.View>
        <AnimatedPressable style={styles.hdrBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={22} color={Colors.textPrimary} />
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
            <View style={[styles.statusDot, { backgroundColor: isSold ? DANGER_TEXT : isPaused ? WARN_TINT.replace('0.12', '1') : SUCCESS_TEXT }]} />
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

          <View style={styles.attrRow}>
            <View style={styles.attrChip}>
              <Text style={styles.attrLabel}>Brand</Text>
              <Text style={styles.attrValue}>{item.brand ?? '-'}</Text>
            </View>
            <View style={styles.attrChip}>
              <Text style={styles.attrLabel}>Size</Text>
              <Text style={styles.attrValue}>{item.size ?? '-'}</Text>
            </View>
            <View style={styles.attrChip}>
              <Text style={styles.attrLabel}>Condition</Text>
              <Text style={styles.attrValue}>{item.condition ?? '-'}</Text>
            </View>
          </View>
        </View>

        {/* Primary Edit Button */}
        <AppButton
          title="Edit Listing"
          icon={<Ionicons name="create-outline" size={18} color={Colors.background} />}
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
            { icon: <Ionicons name="image-outline" size={20} color={Colors.brand} />, label: 'Poster', onPress: () => navigation.navigate('CreatorStudio', { type: 'poster' }) },
            { icon: <Ionicons name="share-outline" size={20} color={Colors.textPrimary} />, label: 'Share', onPress: handleShare },
            { icon: <Ionicons name="eye-outline" size={20} color={Colors.textPrimary} />, label: 'Preview', onPress: () => navigation.push('ItemDetail', { itemId: item.id }) },
            ...(status === 'active' ? [{ icon: <Ionicons name="hammer-outline" size={20} color={Colors.brand} />, label: 'Auction', onPress: () => navigation.navigate('CreateAuction', { listingId: item.id }) }] : []),
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

        {/* Status Actions */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleIconWrap, { backgroundColor: isSold ? 'rgba(255,59,48,0.12)' : isPaused ? WARN_TINT : 'rgba(52,199,89,0.12)' }]}>
                <Ionicons name={isSold ? 'close-circle-outline' : isPaused ? 'pause-circle-outline' : 'checkmark-circle-outline'} size={20} color={isSold ? DANGER_TEXT : isPaused ? '#F5A623' : SUCCESS_TEXT} />
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
            <View style={{ flexDirection: 'row', gap: Space.sm, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border }}>
              <AppButton title="Pause" variant="secondary" size="sm" style={{ flex: 1 }} onPress={handlePause} />
              <AppButton title="Mark Sold" variant="secondary" size="sm" style={{ flex: 1 }} titleStyle={{ color: Colors.danger }} onPress={handleMarkSold} />
            </View>
          )}
          {status === 'paused' && (
            <View style={{ flexDirection: 'row', gap: Space.sm, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border }}>
              <AppButton title="Reactivate" variant="primary" size="sm" style={{ flex: 1 }} onPress={handleReactivate} />
              <AppButton title="Mark Sold" variant="secondary" size="sm" style={{ flex: 1 }} titleStyle={{ color: Colors.danger }} onPress={handleMarkSold} />
            </View>
          )}
          {status === 'sold' && (
            <View style={{ paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border }}>
              <AppButton title="Reactivate Listing" variant="secondary" size="sm" style={{ width: '100%' }} onPress={handleReactivate} />
            </View>
          )}
        </View>

        {/* Delete */}
        <AnimatedPressable style={styles.deleteRow} activeOpacity={0.8} onPress={handleDeleteListing}>
          <Ionicons name="trash-outline" size={18} color={DANGER_TEXT} />
          <Text style={styles.deleteText}>Delete this listing</Text>
        </AnimatedPressable>
      </Reanimated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

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
    color: Colors.textPrimary,
    maxWidth: SCREEN_W * 0.5,
  },

  heroWrap: {
    width: SCREEN_W,
    height: SCREEN_W,
    position: 'relative',
    backgroundColor: Colors.surface,
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
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  infoTitle: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    lineHeight: 28,
    marginBottom: 6,
  },
  infoPrice: {
    fontSize: 26,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  attrRow: {
    flexDirection: 'row',
    gap: 8,
  },
  attrChip: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  attrLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  attrValue: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.textPrimary,
  },
  editBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.background,
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
    color: Colors.textSecondary,
  },

  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
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
    color: Colors.textPrimary,
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  healthTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
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
    color: Colors.textPrimary,
  },
  healthLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  deleteText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: DANGER_TEXT,
  },
});