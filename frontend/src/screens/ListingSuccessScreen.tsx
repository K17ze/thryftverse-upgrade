import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/types';
import { Confetti } from '../components/Confetti';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CachedImage } from '../components/CachedImage';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Typography, Space, Type, Radius, FontSize, Stroke, Control } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';
import { fetchListingByIdFromApi } from '../services/listingsApi';
import { useBackendData } from '../context/BackendDataContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';

type Props = NativeStackScreenProps<RootStackParamList, 'ListingSuccess'>;

export default function ListingSuccessScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const { refreshListings } = useBackendData();
  const queryClient = useQueryClient();
  const reducedMotionEnabled = useReducedMotion();

  const listingId = route.params?.listingId;
  const routeTitle = route.params?.title;
  const routePrice = typeof route.params?.price === 'number' ? route.params.price : null;
  const routeCategory = route.params?.categoryId;
  const routePhoto = route.params?.photoUri;
  const smartSellEnabled = route.params?.smartSellEnabled === true;

  const [backendListing, setBackendListing] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Refresh the feed and invalidate the listing detail query so the new
  // listing appears immediately when the user navigates back to the feed
  // or profile — without waiting for the 55-second polling cycle.
  React.useEffect(() => {
    void refreshListings();
    if (listingId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(listingId) });
    }
  }, [refreshListings, queryClient, listingId]);

  React.useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await fetchListingByIdFromApi(listingId);
        if (!cancelled && res.ok && res.listing) {
          setBackendListing(res.listing);
        }
      } catch {
        // ignore — use route params as fallback
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetch();
    return () => { cancelled = true; };
  }, [listingId]);

  const listingTitle = backendListing?.title || routeTitle || 'your listing';
  const listingPriceRaw = backendListing?.priceGbp ?? routePrice;
  const listingPrice = listingPriceRaw != null ? formatFromFiat(listingPriceRaw, 'GBP', { displayMode: 'fiat' }) : null;
  const listingCategory = backendListing?.category || routeCategory;
  const listingPhoto = backendListing?.imageUrl || routePhoto;

  const status = backendListing?.status ?? 'active';
  const isActive = status === 'active';
  const isPaused = status === 'paused';
  const isSold = status === 'sold';
  const statusLabel = isActive ? 'Live now' : isPaused ? 'Paused' : isSold ? 'Sold' : status;
  const statusTone = isActive ? 'success' : isPaused ? 'pending' : isSold ? 'delivered' : 'pending';

  const handleShare = React.useCallback(async () => {
    if (!listingId) return;
    const url = `https://thryftverse.com/listing/${listingId}`;
    try {
      await Share.share(
        {
          url: Platform.OS === 'ios' ? url : undefined,
          message:
            Platform.OS === 'android'
              ? `Check out "${listingTitle}" on Thryftverse\n${url}`
              : `Check out "${listingTitle}" on Thryftverse`,
        },
        { dialogTitle: 'Share listing' }
      );
    } catch {
      // User cancelled share
    }
  }, [listingId, listingTitle]);

  const handleCreateAnother = React.useCallback(() => {
    navigation.navigate('Sell');
  }, [navigation]);

  const handleViewListing = React.useCallback(() => {
    if (listingId) {
      navigation.push('ItemDetail', { itemId: listingId });
    }
  }, [navigation, listingId]);

  const handleManageListing = React.useCallback(() => {
    if (listingId) {
      navigation.push('ManageListing', { itemId: listingId });
    }
  }, [navigation, listingId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <Confetti />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Celebration Header */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.heroSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={64} color={colors.brand} />
          </View>
          <Text style={styles.heroBigText}>Published</Text>
          <Text style={styles.heroSubText}>
            {isActive ? 'Your item is now live on Thryftverse.' : isPaused ? 'Your listing is paused and hidden from buyers.' : isSold ? 'Your item has been marked as sold.' : 'Your listing has been created.'}
          </Text>
          {listingPrice ? (
            <Text style={styles.heroMicroCopy}>{listingPrice}</Text>
          ) : null}
        </Reanimated.View>

        {/* Published status */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.statusRow}>
          <PremiumStatusPill tone={statusTone} label={statusLabel} icon="checkmark-circle" />
          {listingId ? (
            <Text style={styles.idText} numberOfLines={1}>
              {listingId}
            </Text>
          ) : null}
        </Reanimated.View>

        {/* Product preview card */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <ElevatedSurface variant="elevated" style={styles.summaryCard}>
          {listingPhoto ? (
            <CachedImage
              uri={listingPhoto}
              style={styles.summaryImage}
              containerStyle={styles.summaryImageWrap}
              contentFit="cover"
            />
          ) : (
            <View
              style={[styles.summaryImageWrap, styles.summaryImageFallback]}
            >
              <Ionicons
                name="bag-handle-outline"
                size={20}
                color={colors.textMuted}
              />
            </View>
          )}
          <View style={styles.summaryBody}>
            <Text style={styles.summaryLabel}>published listing</Text>
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {listingTitle}
            </Text>
            <Text style={styles.summaryMeta}>
              {listingPrice || 'price pending'}
              {listingCategory ? ` • ${listingCategory}` : ''}
            </Text>
          </View>
        </ElevatedSurface>
        </Reanimated.View>

        {/* Smart Sell demo banner (truthful UI) */}
        {smartSellEnabled && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
            <ElevatedSurface variant="surface" style={styles.smartSellBanner}>
              <Ionicons name="trending-up-outline" size={18} color={colors.brand} />
              <View style={styles.smartSellBannerBody}>
                <Text style={styles.smartSellBannerTitle}>Smart Sell enabled (demo)</Text>
                <Text style={styles.smartSellBannerText}>
                  Auto-negotiation settings are illustrative — no offers will be auto-accepted until a real backend is connected.
                </Text>
              </View>
            </ElevatedSurface>
          </Reanimated.View>
        )}

        {/* Actions */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <ElevatedSurface variant="surface" style={{ marginBottom: Space.xl }}>
        {listingId ? (
          <AnimatedPressable
            style={styles.actionRowBtn}
            activeOpacity={0.8}
            onPress={handleViewListing}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconBox}>
                <Ionicons
                  name="eye-outline"
                  size={20}
                  color={colors.textPrimary}
                />
              </View>
              <Text style={styles.actionText}>view listing</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </AnimatedPressable>
        ) : null}

        {listingId ? (
          <AnimatedPressable
            style={styles.actionRowBtn}
            activeOpacity={0.8}
            onPress={handleManageListing}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconBox}>
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color={colors.textPrimary}
                />
              </View>
              <Text style={styles.actionText}>manage listing</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </AnimatedPressable>
        ) : null}

        {listingId ? (
          <AnimatedPressable
            style={styles.actionRowBtn}
            activeOpacity={0.8}
            onPress={handleShare}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconBox}>
                <Ionicons
                  name="share-outline"
                  size={20}
                  color={colors.textPrimary}
                />
              </View>
              <Text style={styles.actionText}>share listing</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </AnimatedPressable>
        ) : null}

        <AnimatedPressable
          style={styles.actionRowBtn}
          activeOpacity={0.8}
          onPress={handleCreateAnother}
        >
          <View style={styles.actionLeft}>
            <View style={styles.actionIconBox}>
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={colors.textPrimary}
              />
            </View>
            <Text style={styles.actionText}>create another listing</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textMuted}
          />
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.actionRowBtn}
          activeOpacity={0.8}
          onPress={() => navigation.replace('MainTabs')}
        >
          <View style={styles.actionLeft}>
            <View style={styles.actionIconBox}>
              <Ionicons
                name="home-outline"
                size={20}
                color={colors.textPrimary}
              />
            </View>
            <Text style={styles.actionText}>back to feed</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
        </AnimatedPressable>

        </ElevatedSurface>
        </Reanimated.View>

        {/* Tips for selling — first-listing guidance */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb-outline" size={14} color={colors.brand} />
            <Text style={styles.tipsTitle}>Tips for selling faster</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="camera-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tipText}>Add clear, well-lit photos from multiple angles</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="pricetag-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tipText}>Price competitively — check similar sold items</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tipText}>Respond quickly to buyer questions and offers</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="share-outline" size={13} color={colors.textMuted} />
            <Text style={styles.tipText}>Share your listing on social media for more reach</Text>
          </View>
        </Reanimated.View>

        {/* Support link */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <AnimatedPressable
            style={styles.supportLink}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('HelpSupport')}
          >
            <Ionicons
              name="help-circle-outline"
              size={14}
              color={colors.textMuted}
            />
            <Text style={styles.supportLinkText}>
              Need help? Visit the Help Centre
            </Text>
          </AnimatedPressable>
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  content: { paddingHorizontal: Space.lg, paddingTop: Space.xxl, paddingBottom: Space.xxl },

  heroSection: {
    alignItems: 'center',
    marginBottom: Space.xl,
  },
  iconCircle: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  heroBigText: {
    fontSize: FontSize.hero,
    lineHeight: FontSize.hero + 4,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: -2.2,
    marginBottom: Space.xs,
  },
  heroSubText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  heroMicroCopy: {
    marginTop: Space.sm,
    fontSize: Type.body.size,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    lineHeight: Type.body.lineHeight,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.lg,
    gap: Space.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: colors.success + '14',
    borderWidth: Stroke.standard,
    borderColor: colors.success + '33',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
  },
  statusText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  idText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    flexShrink: 1,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
  },

  summaryCard: {
    flexDirection: 'row',
    gap: Space.sm,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    marginBottom: Space.xl,
  },
  summaryImageWrap: {
    width: Space.xxl + Space.xxl,
    height: Space.xxl + Space.xxl + Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  summaryImage: {
    width: '100%',
    height: '100%',
  },
  summaryImageFallback: {
    backgroundColor: colors.surfaceAlt,
  },
  summaryBody: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    lineHeight: Type.meta.lineHeight,
  },
  summaryTitle: {
    marginTop: Space.xs,
    color: colors.textPrimary,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
  },
  summaryMeta: {
    marginTop: Space.xs,
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },

  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: Stroke.standard,
    borderBottomColor: colors.border,
    minHeight: Control.hit,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  actionIconBox: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    lineHeight: Type.subtitle.lineHeight,
    letterSpacing: Type.subtitle.letterSpacing,
  },

  tipsCard: {
    marginBottom: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: `${colors.brand}08`,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    borderColor: `${colors.brand}20`,
    gap: Space.sm,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs,
  },
  tipsTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  tipText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.lineHeight + Space.xs / 2,
  },

  smartSellBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    marginBottom: Space.md,
    padding: Space.md,
  },
  smartSellBannerBody: {
    flex: 1,
  },
  smartSellBannerTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: Space.xs / 2,
  },
  smartSellBannerText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
  },

  supportLink: {
    marginTop: Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  supportLinkText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  });
}