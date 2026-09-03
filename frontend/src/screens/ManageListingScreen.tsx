import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Share,
  Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Reanimated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
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
  Stroke,
  Control,
  LetterSpacing,
  Numeric,
  FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { fetchListingByIdFromApi } from '../services/listingsApi';
import {
  submitSellerHubBatchCommand,
  type SellerHubBatchCommand,
} from '../services/sellerHubApi';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';
import { t } from '../i18n';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { AppIcon } from '../components/common/AppIcon';
import { AppIconButton } from '../components/common/AppIconButton';
import { IconSize } from '../theme/iconTokens';
import { createStableId } from '../utils/createStableId';
import { LinearGradient } from 'expo-linear-gradient';


type RouteT = RouteProp<RootStackParamList, 'ManageListing'>;

export default function ManageListingScreen() {
  const { colors, isDark } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, SCREEN_W), [colors, SCREEN_W]);
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const { currencyCode, formatFromFiat } = useFormattedPrice();
  const reducedMotion = useReducedMotion();
  const { show } = useToast();
  const { itemId } = route.params ?? {};
  const { refreshListings } = useBackendData();
  const queryClient = useQueryClient();

  const [item, setItem] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isNotFound, setIsNotFound] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [imgIndex, setImgIndex] = React.useState(0);
  const [isMutating, setIsMutating] = React.useState(false);
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
          show(t('manage.couldNotLoad'), 'error');
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

  if (hasError) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg }]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <AppIcon name="warning" size={IconSize.display} color="textMuted" opticalCenter accessible={false} />
        <Text style={{ fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary, marginTop: Space.md }}>
          {t('manage.couldNotLoad')}
        </Text>
        <AppButton title={t('manage.retry')} variant="secondary" size="md" style={{ marginTop: Space.lg }} onPress={() => {
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

  if (isNotFound || !item) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <EmptyState
          icon="bag-handle-outline"
          title={t('manage.listingNotFound')}
          subtitle={t('manage.listingRemoved')}
          ctaLabel={t('manage.goBack')}
          onCtaPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (!isOwner) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.lg }]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <AppIcon name="lock" size={IconSize.display} color="textMuted" opticalCenter accessible={false} />
        <Text style={{ fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary, marginTop: Space.md }}>
          {t('manage.permissionDenied')}
        </Text>
        <Text style={{ fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textMuted, marginTop: Space.xs, textAlign: 'center' }}>
          {t('manage.noPermission')}
        </Text>
        <AppButton title={t('manage.goBack')} variant="secondary" size="md" style={{ marginTop: Space.lg }} onPress={() => navigation.goBack()} />
      </View>
    );
  }

  // Regular function (not useCallback) — defined after early returns where
  // `item` is guaranteed non-null. Using useCallback here would violate the
  // Rules of Hooks (hooks must not be called after conditional returns).
  const handleShare = async () => {
    try {
      await Share.share({
        message: t('manage.shareMessage', { title: item.title, price: formatFromFiat(item.priceGbp ?? 0, currencyCode, { displayMode: 'fiat' }) }) });
    } catch {
      // silently fail
    }
  };

  const reconcileListing = async () => {
    try {
      const response = await fetchListingByIdFromApi(itemId);
      if (response.ok && response.listing) {
        setItem(response.listing);
        setIsNotFound(false);
      } else {
        setIsNotFound(true);
      }
    } catch {
      setHasError(true);
    }
  };

  const runLifecycleCommand = async (
    command: SellerHubBatchCommand,
    successStatus: 'active' | 'paused' | 'sold' | 'deleted',
    successMessage: string,
  ): Promise<'applied' | 'rejected' | 'unknown'> => {
    if (isMutating) return 'unknown';
    setIsMutating(true);
    try {
      const response = await submitSellerHubBatchCommand(
        command,
        [{ listingId: itemId }],
        createStableId('listing-command'),
      );
      const result = response.results[0];
      if (result?.state === 'applied') {
        if (successStatus !== 'deleted') {
          setItem((previous: any) => ({ ...previous, status: successStatus }));
        }
        show(successMessage, 'success');
        void refreshListings();
        void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
        return 'applied';
      }
      if (result?.state === 'rejected') {
        show(t('manage.stateChanged'), 'error');
        await reconcileListing();
        return 'rejected';
      }

      show(t('manage.checkingStatus'), 'info');
      await reconcileListing();
      return 'unknown';
    } catch {
      // A timeout does not prove failure; the durable receipt or a fresh read
      // decides what happened.
      show(t('manage.checkingStatus'), 'info');
      await reconcileListing();
      return 'unknown';
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteListing = () => {
    setConfirmSheet({
      visible: true,
      title: t('manage.deleteTitle'),
      message: t('manage.deleteMessage'),
      confirmLabel: t('manage.delete'),
      cancelLabel: t('manage.cancel'),
      onConfirm: async () => {
        const outcome = await runLifecycleCommand('delete', 'deleted', t('manage.deleted'));
        if (outcome === 'applied') {
          navigation.goBack();
        }
      },
      variant: 'danger' });
  };

  const status = item.status ?? 'active';
  const isSold = status === 'sold';
  const isPaused = status === 'paused';

  const handleMarkSold = () => {
    setConfirmSheet({
      visible: true,
      title: t('manage.markSoldTitle'),
      message: t('manage.markSoldMessage'),
      confirmLabel: t('manage.markSold'),
      cancelLabel: t('manage.cancel'),
      variant: 'default',
      onConfirm: async () => {
        await runLifecycleCommand('mark_sold_external', 'sold', t('manage.markedSold'));
      } });
  };

  const handlePause = async () => {
    await runLifecycleCommand('pause', 'paused', t('manage.paused'));
  };

  const handleReactivate = async () => {
    await runLifecycleCommand('resume', 'active', t('manage.reactivated'));
  };

  // Status metadata for the flat identity block.
  const statusLabel = isSold ? t('manage.statusSold') : isPaused ? t('manage.statusPaused') : t('manage.statusActive');
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
        <AppIconButton
          name="back"
          size={IconSize.lg}
          color="textInverse"
          containerVariant="blur"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        />
        <Reanimated.View style={headerTitleStyle}>
          <Text style={styles.hdrTitle} numberOfLines={1}>{t('manage.title')}</Text>
        </Reanimated.View>
        <View style={styles.headerBalance} />
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
          <LinearGradient
            colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']}
            locations={[0, 1]}
            style={styles.heroTopScrim}
            pointerEvents="none"
          />

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
              {activeOfferCount > 0 ? t('manage.offerCount', { count: activeOfferCount, plural: activeOfferCount === 1 ? '' : 's' }) : t('manage.noOffersYet')}
              {' · '}
              {t('manage.saveCount', { count: savesCount, plural: savesCount === 1 ? '' : 's' })}
              {questionCount > 0 ? ` · ${t('manage.questionCount', { count: questionCount, plural: questionCount === 1 ? '' : 's' })}` : ''}
            </Text>
          </View>
        </View>

        {/* ── Primary CTA: Edit listing ── */}
        <AppButton
          title={isSold ? t('manage.soldRecord') : t('manage.editListing')}
          variant="primary"
          size="lg"
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditListing', { itemId })}
          disabled={isSold || isMutating}
          accessibilityLabel={t('manage.editListing')}
          accessibilityHint={t('manage.a11y.editListingHint')}
          hapticFeedback="light"
        />

        {/* ── Transparent action cluster: Poster, Share, Preview ──
            Per AGENTS.md §4: transparent 44pt targets, 20–24pt glyphs, no
            grey circles. Hit area separated from visible shape. */}
        <View style={styles.iconActionsRow}>
          <AnimatedPressable
            style={styles.iconAction}
            onPress={() => navigation.navigate('CreatorStudio', { type: 'poster' })}
            accessibilityLabel={t('manage.a11y.createPoster')}
            accessibilityRole="button"
            accessibilityHint={t('manage.a11y.createPosterHint')}
            hapticFeedback="light"
          >
            <AppIcon name="image" size={IconSize.lg} color="brand" opticalCenter accessible={false} />
            <Text style={styles.iconActionLabel}>{t('manage.poster')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.iconAction}
            onPress={handleShare}
            accessibilityLabel={t('manage.a11y.shareListing')}
            accessibilityRole="button"
            accessibilityHint={t('manage.a11y.shareListingHint')}
            hapticFeedback="light"
          >
            <AppIcon name="share" size={IconSize.lg} color="textPrimary" opticalCenter accessible={false} />
            <Text style={styles.iconActionLabel}>{t('manage.share')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.iconAction}
            onPress={() => navigation.push('ItemDetail', { itemId: item.id })}
            accessibilityLabel={t('manage.a11y.previewListing')}
            accessibilityRole="button"
            accessibilityHint={t('manage.a11y.previewListingHint')}
            hapticFeedback="light"
          >
            <AppIcon name="eye" size={IconSize.lg} color="textPrimary" opticalCenter accessible={false} />
            <Text style={styles.iconActionLabel}>{t('manage.preview')}</Text>
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
          title={t('manage.buyerActivity')}
          style={styles.metricsSection}
        >
          <FlagshipMetricLine label={t('manage.likes')} value={String(likesCount)} />
          <FlagshipMetricLine label={t('manage.saves')} value={String(savesCount)} separated />
          <FlagshipMetricLine
            label={t('manage.questions')}
            value={String(questionCount)}
            subLabel={answeredQuestionCount > 0 ? t('manage.answered', { count: answeredQuestionCount }) : undefined}
            separated
          />
          <FlagshipMetricLine label={t('manage.activeOffers')} value={String(activeOfferCount)} separated />
          <FlagshipNavigationRow
            title={t('manage.viewAnalytics')}
            subtitle={t('manage.analyticsSubtitle')}
            icon="analytics"
            onPress={() => navigation.navigate('SellerAnalytics', { listingId: itemId, listingTitle: item.title })}
            accessibilityLabel={t('manage.viewAnalytics')}
            accessibilityHint={t('manage.a11y.viewAnalyticsHint')}
          />
          {questionCount > 0 ? (
            <FlagshipNavigationRow
              title={t('manage.viewQuestions')}
              subtitle={t('manage.questionsToReview', { count: questionCount, plural: questionCount === 1 ? '' : 's' })}
              icon="chat"
              onPress={() => navigation.navigate('Inbox', { filterItemId: itemId })}
              accessibilityLabel="View questions"
              accessibilityHint="Open your inbox to review and answer buyer questions"
            />
          ) : null}
        </FlagshipFormSection>

        {/* ── Progressive disclosure rows ── */}
        <View style={styles.disclosureGroup}>
          <Text style={styles.sectionLabel}>{t('manage.listingDetails')}</Text>
          <FlagshipNavigationRow
            title={t('manage.priceAndOffers')}
            subtitle={activeOfferCount > 0 ? t('manage.offersReceived', { count: activeOfferCount, plural: activeOfferCount === 1 ? '' : 's' }) : t('manage.noOffersYet')}
            icon="tag"
            onPress={() => navigation.navigate('EditListing', { itemId, focus: 'price' })}
            accessibilityLabel={t('manage.a11y.priceAndOffers')}
            accessibilityHint={t('manage.a11y.priceAndOffersHint')}
          />
          <FlagshipNavigationRow
            title={t('manage.delivery')}
            subtitle={item.shippingType ? item.shippingType : t('manage.shippingOptions')}
            icon="box"
            onPress={() => navigation.navigate('EditListing', { itemId, focus: 'shipping' })}
            accessibilityLabel={t('manage.delivery')}
            accessibilityHint={t('manage.a11y.deliveryHint')}
          />
          <FlagshipNavigationRow
            title={t('manage.format')}
            icon="auction"
            onPress={() => navigation.navigate('EditListing', { itemId, focus: 'format' })}
            accessibilityLabel={t('manage.format')}
            accessibilityHint={t('manage.a11y.listingFormatHint')}
          />
        </View>

        {/* ── Terminal / overflow section: destructive & state controls ── */}
        <View style={styles.moreSection}>
          <Text style={styles.sectionLabel}>{t('manage.more')}</Text>
          {status === 'active' && (
            <>
              <FlagshipNavigationRow
                title={t('manage.pauseListing')}
                subtitle={t('manage.pauseSubtitle')}
                icon="pause"
                onPress={handlePause}
                disabled={isMutating}
                accessibilityLabel={t('manage.pauseListing')}
                accessibilityHint={t('manage.a11y.pauseListingHint')}
              />
              <FlagshipNavigationRow
                title={t('manage.markAsSold')}
                subtitle={t('manage.markSoldSubtitle')}
                icon="verified"
                onPress={handleMarkSold}
                disabled={isMutating}
                accessibilityLabel={t('manage.markAsSold')}
                accessibilityHint={t('manage.a11y.markAsSoldHint')}
              />
            </>
          )}
          {status === 'paused' && (
            <>
              <FlagshipNavigationRow
                title={t('manage.reactivateListing')}
                subtitle={t('manage.reactivateSubtitle')}
                icon="play"
                onPress={handleReactivate}
                disabled={isMutating}
                accessibilityLabel={t('manage.reactivateListing')}
                accessibilityHint={t('manage.a11y.reactivateListingHint')}
              />
              <FlagshipNavigationRow
                title={t('manage.markAsSold')}
                subtitle={t('manage.markSoldSubtitle')}
                icon="verified"
                onPress={handleMarkSold}
                disabled={isMutating}
                accessibilityLabel={t('manage.markAsSold')}
                accessibilityHint={t('manage.a11y.markAsSoldHint')}
              />
            </>
          )}
          {status === 'sold' && (
            <View style={styles.soldRecordNote}>
              <AppIcon name="receipt" size={IconSize.md} color="textSecondary" opticalCenter accessible={false} />
              <View style={styles.soldRecordCopy}>
                <Text style={styles.soldRecordTitle}>{t('manage.soldRecord')}</Text>
                <Text style={styles.soldRecordSubtitle}>{t('manage.soldRecordSubtitle')}</Text>
              </View>
            </View>
          )}
          {/* Delete — clearly separated as the terminal action */}
          {!isSold ? (
            <FlagshipNavigationRow
              title={t('manage.deleteListing')}
              subtitle={t('manage.deleteSubtitle')}
              icon="trash"
              danger
              disabled={isMutating}
              separator={false}
              onPress={handleDeleteListing}
              accessibilityLabel={t('manage.deleteListing')}
              accessibilityHint={t('manage.deleteHint')}
            />
          ) : null}
        </View>
      </Reanimated.ScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        variant={confirmSheet.variant}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number) {
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
      paddingBottom: Space.sm },
    hdrBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },
    hdrTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary,
      maxWidth: screenWidth * 0.5 },
    headerBalance: {
      width: Control.hit,
      height: Control.hit },

    // ── Media carousel ──
    heroWrap: {
      width: screenWidth,
      height: screenWidth,
      position: 'relative',
      backgroundColor: colors.surface },
    heroImage: {
      width: screenWidth,
      height: screenWidth },
    heroTopScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 116 },
    dotRow: {
      position: 'absolute',
      bottom: Space.md,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Space.xs },
    dot: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.scrimTextTertiary },
    dotActive: {
      backgroundColor: colors.textInverse,
      width: Control.iconCompact },

    // ── Flat identity block ──
    // Per AGENTS.md §4: no floating white card over media. Title, price and
    // status metadata sit directly on the canvas with flat typography.
    identityBlock: {
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      paddingBottom: Space.sm },
    identityTitle: {
      fontSize: TypographyV2.itemTitle.size,
      lineHeight: TypographyV2.itemTitle.lineHeight,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.itemTitle.letterSpacing },
    identityPrice: {
      ...Numeric.priceList,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      marginTop: Space.xs },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.sm },
    statusPillFlat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm + Space.xxs,
      paddingVertical: Space.xxs + 1 },
    statusDotFlat: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.full },
    statusPillFlatText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: LetterSpacing.wide },
    statusMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      flexShrink: 1 },

    // ── Primary CTA ──
    editBtn: {
      marginHorizontal: Space.md,
      marginTop: Space.md },

    // ── Transparent action cluster ──
    // Per AGENTS.md §4: transparent 44pt targets, 20–24pt glyphs, no grey
    // circles. Hit area separated from visible shape.
    iconActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginHorizontal: Space.md,
      marginTop: Space.md,
      marginBottom: Space.xs },
    iconAction: {
      alignItems: 'center',
      gap: Space.xs,
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center' },
    iconActionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },

    // ── Section labels (flat, no card) ──
    sectionLabel: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      paddingBottom: Space.xs },

    // ── Metrics section ──
    metricsSection: {
      marginTop: Space.sm },

    // ── Disclosure group ──
    disclosureGroup: {
      marginTop: Space.sm },

    // ── More / terminal section ──
    moreSection: {
      marginTop: Space.lg },
    soldRecordNote: {
      minHeight: Control.hit,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md },
    soldRecordCopy: {
      flex: 1,
      gap: Space.xxs },
    soldRecordTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    soldRecordSubtitle: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted } });
}
