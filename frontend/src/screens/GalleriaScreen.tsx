import React, { useCallback, useMemo } from 'react';
import {
  View,
  RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Space } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { OfflineBanner } from '../components/OfflineBanner';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState } from '../components/flagship';
import {
  GalleriaListHeader,
  GalleriaListFooter,
  GalleriaFeaturedAssetCard,
  MASONRY_GAP,
  MASONRY_COLUMN_COUNT,
  MASONRY_PADDING } from '../components/galleria';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  useGalleriaContent,
  useGalleriaStyles } from '../hooks/galleria';
import type {
  GalleriaCollection,
  GalleriaFeaturedAsset } from '../services/galleriaApi';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useAppTranslation } from '../i18n/useAppTranslation';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ---------------------------------------------------------------------------
// Main screen — orchestrator only. Data/state lives in hooks/galleria/*,
// presentation in components/galleria/*. Masonry geometry (column count,
// gap, padding, aspect ratios) is owned by galleriaLayout and unchanged.
// ---------------------------------------------------------------------------
export default function GalleriaScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const styles = useGalleriaStyles();
  const reducedMotion = useReducedMotion();
  const { t } = useAppTranslation('galleria');

  const {
    collections,
    editorials,
    featuredAssets,
    loading,
    refreshing,
    error,
    loadAll,
    heroEditorial,
    remainingEditorials,
    featuredCollection,
    railCollections } = useGalleriaContent();

  const handleRefresh = useCallback(() => {
    haptic.selection();
    void loadAll(true);
  }, [haptic, loadAll]);

  // ── Navigation handlers ──
  const handleCollectionPress = useCallback(
    (collection: GalleriaCollection) => {
      haptic.selection();
      navigation.navigate('GalleriaCollectionDetail', { collectionId: collection.id });
    },
    [haptic, navigation],
  );

  const handleAssetPress = useCallback(
    (asset: GalleriaFeaturedAsset) => {
      haptic.selection();
      openProductDetail(navigation, {
        referenceKind: 'co_own',
        canonicalId: asset.id,
        sourceSurface: 'Galleria',
        sourceItemId: asset.id });
    },
    [haptic, navigation],
  );

  const handlePosterStudioPress = useCallback(() => {
    haptic.selection();
    navigation.navigate('CreatorStudio', { type: 'poster', openTemplates: true });
  }, [haptic, navigation]);

  // ── FlashList masonry callbacks ──
  const keyExtractor = useCallback(
    (item: GalleriaFeaturedAsset) => item.id,
    [],
  );

  const renderMasonryItem = useCallback(
    ({ item, index }: { item: GalleriaFeaturedAsset; index: number }) => (
      <View style={{ paddingHorizontal: MASONRY_GAP / 2, paddingBottom: MASONRY_GAP, width: '100%' }}>
        <GalleriaFeaturedAssetCard
          asset={item}
          onPress={() => handleAssetPress(item)}
          testID={index === 0 ? 'golden-coown-first-asset' : undefined}
        />
      </View>
    ),
    [handleAssetPress],
  );

  const overrideItemLayout = useCallback(
    (layout: { span?: number }) => {
      layout.span = 1;
    },
    [],
  );

  const listHeader = useMemo(
    () => (
      <GalleriaListHeader
        loading={loading}
        heroEditorial={heroEditorial}
        collections={collections}
        featuredCollection={featuredCollection}
        railCollections={railCollections}
        hasFeaturedAssets={featuredAssets.length > 0}
        reducedMotion={reducedMotion}
        onCollectionPress={handleCollectionPress}
      />
    ),
    [
      loading,
      heroEditorial,
      editorials.length,
      collections,
      featuredCollection,
      railCollections,
      featuredAssets.length,
      reducedMotion,
      styles,
      handleCollectionPress,
      t,
    ],
  );

  const listFooter = useMemo(
    () => (
      <GalleriaListFooter
        loading={loading}
        remainingEditorials={remainingEditorials}
        onPosterStudioPress={handlePosterStudioPress}
      />
    ),
    [
      loading,
      remainingEditorials,
      editorials.length,
      heroEditorial,
      styles,
      haptic,
      navigation,
      handlePosterStudioPress,
      t,
    ],
  );

  // ── Error state ──
  if (error && !loading && collections.length === 0) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={
          <FlagshipHeader
            title="Galleria"
            onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
            showBackButton={navigation.canGoBack()}
          />
        }
      >
        <View style={styles.stateContainer}>
          <FlagshipState
            variant="error"
            title={t('error.title')}
            subtitle={error}
            actionLabel={t('error.retry')}
            onAction={() => void loadAll(false)}
          />
        </View>
      </FlagshipScreen>
    );
  }

  // ── Empty state ──
  if (
    !loading &&
    collections.length === 0 &&
    editorials.length === 0 &&
    featuredAssets.length === 0
  ) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={
          <FlagshipHeader
            title="Galleria"
            onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
            showBackButton={navigation.canGoBack()}
          />
        }
      >
        <View style={styles.stateContainer}>
          <FlagshipState
            variant="empty"
            actionIcon="image"
            title={t('empty.title')}
            subtitle={t('empty.subtitle')}
            actionLabel={t('empty.refresh')}
            onAction={() => void loadAll(false)}
          />
        </View>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      testID="coown-screen"
      scrollEnabled={false}
      contentStyle={styles.screenContent}
      header={
        <FlagshipHeader
          title="Galleria"
          onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
          showBackButton={navigation.canGoBack()}
        />
      }
    >
      {/* Offline banner */}
      {isOffline && <OfflineBanner message={t('offline.banner')} />}

      <FlashList
        data={loading ? [] : featuredAssets}
        masonry
        numColumns={MASONRY_COLUMN_COUNT}
        renderItem={renderMasonryItem}
        keyExtractor={keyExtractor}
        overrideItemLayout={overrideItemLayout}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={{
          paddingHorizontal: Math.max(MASONRY_PADDING - MASONRY_GAP / 2, 0),
          paddingTop: Space.sm,
          paddingBottom: Space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      />
    </FlagshipScreen>
  );
}
