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
import { EmptyState } from '../components/EmptyState';
import { ProductDetailSkeleton } from '../components/product/ProductDetailSkeleton';
import { AppButton } from '../components/ui/AppButton';
import { FlagshipNavigationRow } from '../components/flagship/FlagshipNavigationRow';
import { FlagshipMetricLine } from '../components/flagship/FlagshipMetricLine';
import { FlagshipFormSection } from '../components/flagship/FlagshipFormSection';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Space,
  Radius,
  Type,
  Typography,
  Stroke,
  Control,
  LetterSpacing,
  Numeric,
  FontFamily,
} from '../theme/designTokens';
import { fetchListingByIdFromApi, patchListingOnApi, deleteListingOnApi } from '../services/listingsApi';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';
import { t } from '../i18n';
import { ConfirmationSheet } from '../components/ConfirmationSheet';


const { width: SCREEN_W } = Dimensions.get('window');

type RouteT = RouteProp<RootStackParamList, 'ManageListing'>;

export default function ManageListingScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const { currencyCode, formatFromFiat } = useFormattedPrice();
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
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });
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

  // ── Animated header styles ──
  // Must be called unconditionally before any early returns (Rules of Hooks).
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

  // Regular function (not useCallback) — defined after early returns where
  // `item` is guaranteed non-null. Using useCallback here would violate the
  // Rules of Hooks (hooks must not be called after conditional returns).
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out my listing "${item.title}" on Thryftverse for ${formatFromFiat(item.priceGbp ?? 0, currencyCode, { displayMode: 'fiat' })}.`,
      });
    } catch {
      // silently fail
    }
  };

  const handleDeleteListing = () => {
    setConfirmSheet({
      visible: true,
      title: 'Delete Listing',
      message: 'This cannot be undone. Permanently remove this listing?',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
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
      variant: 'danger',
    });
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

  const handleOverflowMenu = () => {
    Alert.alert('More actions', undefined, [
      ...(status === 'active'
        ? [
            { text: 'Pause listing', onPress: handlePause },
            { text: 'Mark as sold', onPress: handleMarkSold },
          ]
        : status === 'paused'
          ? [
              { text: 'Reactivate listing', onPress: handleReactivate },
              { text: 'Mark as sold', onPress: handleMarkSold },
            ]
          : status === 'sold'
            ? [{ text: 'Reactivate listing', onPress: handleReactivate }]
            : []),
      { text: 'Delete listing', style: 'destructive' as const, onPress: handleDeleteListing },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  // Status metadata for the flat identity block.
  const statusLabel = isSold ? 'Sold' : isPaused ? 'Paused' : 'Active';
  // Per 2026 best practices: Active (success), Paused (warning), Sold (brand).
  const statusColor = isSold ? colors.brand : isPaused ? colors.warning : colors.success;

  // ── Real engagement data (from backend engagement summary) ──
  // The single-listing API returns engagement as a nested object, NOT as
  // top-level likes/saves/offersCount. Reads fall back to top-level fields
  // only for older payloads; views is intentionally omitted (not returned
  // by the backend engagement query — was fabricated in a prior build).
  const engagement = item.engagement ?? null;
  const likesCount = engagement?.likes ?? item.likes ?? 0;
  const savesCount = engagement?.saves ?? item.saves ?? 0;
  const questionCount = engagement?.questionCount ?? 0;
  const answeredQuestionCount = engagement?.answeredQuestionCount ?? 0;
  const activeOfferCount = engagement?.activeOfferCount ?? item.offersCount ?? item.offers ?? 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />

      <Reanimated.View style={[styles.floatingHeader, headerBgStyle, { paddingTop: Math.max(insets.top, 20) }]}>
        <AnimatedPressable style={styles.hdrBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Reanimated.View style={headerTitleStyle}>
          <Text style={styles.hdrTitle} numberOfLines={1}>Manage listing</Text>
        </Reanimated.View>
        <AnimatedPressable style={styles.hdrBtn} onPress={handleOverflowMenu} accessibilityLabel="More actions" accessibilityRole="button" accessibilityHint="Pause, reactivate, mark as sold or delete this listing">
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 24 }}
      >
        {/* ── Media carousel ── */}
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

          {images.length > 1 && (
            <View style={styles.dotRow}>
              {images.map((_u: string, i: number) => (
                <View key={i} style={[styles.dot, i === imgIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* ── Flat identity block (no floating card over media) ── */}
        <View style={styles.identityBlock}>
          <Text style={styles.identityTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.identityPrice}>{formatFromFiat(item.priceGbp ?? 0, currencyCode, { displayMode: 'fiat' })}</Text>

          <View style={styles.statusRow}>
            {/* TODO: replace `${statusColor}1A` with statusColorSubtle token when available */}
            <View style={[styles.statusPillFlat, { backgroundColor: `${statusColor}1A` }]}>
              <View style={[styles.statusDotFlat, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillFlatText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            <Text style={styles.statusMeta}>
              {activeOfferCount > 0 ? `${activeOfferCount} offer${activeOfferCount === 1 ? '' : 's'}` : 'No offers yet'}
              {' · '}
              {savesCount} save{savesCount === 1 ? '' : 's'}
              {questionCount > 0 ? ` · ${questionCount} question${questionCount === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
        </View>

        {/* ── Primary CTA: Edit listing ── */}
        <AppButton
          title="Edit listing"
          icon={<Ionicons name="create-outline" size={18} color={colors.background} />}
          variant="primary"
          size="lg"
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditListing', { itemId })}
          accessibilityLabel="Edit listing"
          accessibilityHint="Opens the listing editor"
          hapticFeedback="light"
        />

        {/* ── Transparent action cluster: Poster, Share, Preview ──
            Per AGENTS.md §4: transparent 44pt targets, 20–24pt glyphs, no
            grey circles. Hit area separated from visible shape. */}
        <View style={styles.iconActionsRow}>
          <AnimatedPressable
            style={styles.iconAction}
            onPress={() => navigation.navigate('CreatorStudio', { type: 'poster' })}
            accessibilityLabel="Create poster"
            accessibilityRole="button"
            accessibilityHint="Generate a promotional poster for this listing"
            hapticFeedback="light"
          >
            <Ionicons name="image-outline" size={22} color={colors.brand} />
            <Text style={styles.iconActionLabel}>Poster</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.iconAction}
            onPress={handleShare}
            accessibilityLabel="Share listing"
            accessibilityRole="button"
            accessibilityHint="Share this listing"
            hapticFeedback="light"
          >
            <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.iconActionLabel}>Share</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.iconAction}
            onPress={() => navigation.push('ItemDetail', { itemId: item.id })}
            accessibilityLabel="Preview listing"
            accessibilityRole="button"
            accessibilityHint="View this listing as buyers see it"
            hapticFeedback="light"
          >
            <Ionicons name="eye-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.iconActionLabel}>Preview</Text>
          </AnimatedPressable>
        </View>

        {/* ── Buyer activity / performance (real metrics only) ──
            Views intentionally omitted — not returned by the backend
            engagement query (was fabricated in a prior build). Likes, saves,
            questions and offers are all real and sourced from engagement.
            Flat composition: FlagshipFormSection variant="flat" + metric
            lines + disclosure rows. No cards, no borders. */}
        <FlagshipFormSection
          variant="flat"
          title="Buyer activity"
          style={styles.metricsSection}
        >
          <FlagshipMetricLine label="Likes" value={String(likesCount)} />
          <FlagshipMetricLine label="Saves" value={String(savesCount)} separated />
          <FlagshipMetricLine
            label="Questions"
            value={String(questionCount)}
            subLabel={answeredQuestionCount > 0 ? `${answeredQuestionCount} answered` : undefined}
            separated
          />
          <FlagshipMetricLine label="Active offers" value={String(activeOfferCount)} separated />
          <FlagshipNavigationRow
            title="View analytics"
            subtitle="Performance across all your listings"
            icon="analytics-outline"
            onPress={() => navigation.navigate('SellerAnalytics')}
            accessibilityLabel="View analytics"
            accessibilityHint="Open seller analytics for performance insights"
          />
          {questionCount > 0 ? (
            <FlagshipNavigationRow
              title="View questions"
              subtitle={`${questionCount} buyer question${questionCount === 1 ? '' : 's'} to review`}
              icon="chatbubble-outline"
              onPress={() => navigation.navigate('Inbox')}
              accessibilityLabel="View questions"
              accessibilityHint="Open your inbox to review and answer buyer questions"
            />
          ) : null}
        </FlagshipFormSection>

        {/* ── Progressive disclosure rows ── */}
        <View style={styles.disclosureGroup}>
          <Text style={styles.sectionLabel}>Listing details</Text>
          <FlagshipNavigationRow
            title="Price & offers"
            subtitle={activeOfferCount > 0 ? `${activeOfferCount} offer${activeOfferCount === 1 ? '' : 's'} received` : 'No offers yet'}
            icon="pricetag-outline"
            onPress={() => navigation.navigate('EditListing', { itemId, focus: 'price' })}
            accessibilityLabel="Price and offers"
            accessibilityHint="Edit price and review offers"
          />
          <FlagshipNavigationRow
            title="Delivery"
            subtitle={item.shippingType ? item.shippingType : 'Shipping options'}
            icon="cube-outline"
            onPress={() => navigation.navigate('EditListing', { itemId, focus: 'shipping' })}
            accessibilityLabel="Delivery"
            accessibilityHint="Edit shipping and delivery options"
          />
          <FlagshipNavigationRow
            title="Format"
            subtitle={item.isAuction ? 'Auction' : 'Fixed price'}
            icon={item.isAuction ? 'hammer-outline' : 'pricetag-outline'}
            onPress={() => navigation.navigate('EditListing', { itemId, focus: 'format' })}
            accessibilityLabel="Listing format"
            accessibilityHint="Edit listing format — auction or fixed price"
          />
        </View>

        {/* ── Terminal / overflow section: destructive & state controls ── */}
        <View style={styles.moreSection}>
          <Text style={styles.sectionLabel}>More</Text>
          {status === 'active' && (
            <>
              <FlagshipNavigationRow
                title="Pause listing"
                subtitle="Hide from buyers temporarily"
                icon="pause-outline"
                onPress={handlePause}
                accessibilityLabel="Pause listing"
                accessibilityHint="Temporarily hide this listing from buyers"
              />
              <FlagshipNavigationRow
                title="Mark as sold"
                subtitle="No longer available for purchase"
                icon="checkmark-circle-outline"
                danger
                onPress={handleMarkSold}
                accessibilityLabel="Mark as sold"
                accessibilityHint="Mark this listing as sold"
              />
            </>
          )}
          {status === 'paused' && (
            <>
              <FlagshipNavigationRow
                title="Reactivate listing"
                subtitle="Make visible to buyers again"
                icon="play-circle-outline"
                onPress={handleReactivate}
                accessibilityLabel="Reactivate listing"
                accessibilityHint="Make this listing visible to buyers again"
              />
              <FlagshipNavigationRow
                title="Mark as sold"
                subtitle="No longer available for purchase"
                icon="checkmark-circle-outline"
                danger
                onPress={handleMarkSold}
                accessibilityLabel="Mark as sold"
                accessibilityHint="Mark this listing as sold"
              />
            </>
          )}
          {status === 'sold' && (
            <FlagshipNavigationRow
              title="Reactivate listing"
              subtitle="Make available for purchase again"
              icon="play-circle-outline"
              onPress={handleReactivate}
              accessibilityLabel="Reactivate listing"
              accessibilityHint="Make this listing available for purchase again"
            />
          )}
          {/* Delete — clearly separated as the terminal action */}
          <FlagshipNavigationRow
            title="Delete listing"
            subtitle="Permanently remove this listing"
            icon="trash-outline"
            danger
            separator={false}
            onPress={handleDeleteListing}
            accessibilityLabel="Delete listing"
            accessibilityHint="This action cannot be undone"
          />
        </View>
      </Reanimated.ScrollView>
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
      alignItems: 'center',
      justifyContent: 'center',
    },
    hdrTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      maxWidth: SCREEN_W * 0.5,
    },

    // ── Media carousel ──
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
      backgroundColor: colors.overlay,
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
      backgroundColor: colors.scrimTextTertiary,
    },
    dotActive: {
      backgroundColor: colors.textInverse,
      width: Control.iconCompact,
    },

    // ── Flat identity block ──
    // Per AGENTS.md §4: no floating white card over media. Title, price and
    // status metadata sit directly on the canvas with flat typography.
    identityBlock: {
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      paddingBottom: Space.sm,
    },
    identityTitle: {
      fontSize: Type.itemTitle.size,
      lineHeight: Type.itemTitle.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.itemTitle.letterSpacing,
    },
    identityPrice: {
      ...Numeric.priceList,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      marginTop: Space.xs,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.sm,
    },
    statusPillFlat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm + Space.xxs,
      paddingVertical: Space.xxs + 1,
    },
    statusDotFlat: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.full,
    },
    statusPillFlatText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.wide,
    },
    statusMeta: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      flexShrink: 1,
    },

    // ── Primary CTA ──
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

    // ── Transparent action cluster ──
    // Per AGENTS.md §4: transparent 44pt targets, 20–24pt glyphs, no grey
    // circles. Hit area separated from visible shape.
    iconActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginHorizontal: Space.md,
      marginTop: Space.md,
      marginBottom: Space.xs,
    },
    iconAction: {
      alignItems: 'center',
      gap: Space.xs,
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
    },
    iconActionLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },

    // ── Section labels (flat, no card) ──
    sectionLabel: {
      fontSize: Type.label.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      paddingBottom: Space.xs,
    },

    // ── Metrics section ──
    metricsSection: {
      marginTop: Space.sm,
    },

    // ── Disclosure group ──
    disclosureGroup: {
      marginTop: Space.sm,
    },

    // ── More / terminal section ──
    moreSection: {
      marginTop: Space.lg,
    },
  });
}
