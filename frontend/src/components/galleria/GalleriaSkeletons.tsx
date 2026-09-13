import React from 'react';
import { View, useWindowDimensions } from 'react-native';

import { Radius } from '../../theme/designTokens';
import { HorizontalRail } from '../HorizontalRail';
import { PremiumSkeletonTile } from '../discover/PremiumSkeletonTile';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { GalleriaFeaturedAsset } from '../../services/galleriaApi';
import {
  COLLECTION_CARD_WIDTH,
  COLLECTION_CARD_HEIGHT,
  SKELETON_ASPECT_RATIOS,
  getMasonryColumnWidth,
  buildMasonryColumns } from './galleriaLayout';

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------
export function GalleriaHeroSkeleton() {
  const styles = useGalleriaStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const HERO_HEIGHT = Math.round(SCREEN_W * (4 / 5));
  return (
    <View style={styles.heroContainer}>
      <PremiumSkeletonTile width="100%" height={HERO_HEIGHT} borderRadius={Radius.none} />
    </View>
  );
}

export function GalleriaCollectionRailSkeleton() {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');
  return (
    <HorizontalRail
      contentContainerStyle={styles.railContent}
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('accessibility.loadingCollections')}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={[styles.collectionCard, { width: COLLECTION_CARD_WIDTH }]}>
          <PremiumSkeletonTile width="100%" height={COLLECTION_CARD_HEIGHT - 40} borderRadius={Radius.lg} />
          <View style={styles.collectionMeta}>
            <PremiumSkeletonTile width={20} height={20} borderRadius={Radius.full} />
            <PremiumSkeletonTile width={80} height={12} borderRadius={Radius.sm} />
          </View>
        </View>
      ))}
    </HorizontalRail>
  );
}

export function GalleriaFeaturedMasonrySkeleton() {
  const styles = useGalleriaStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const MASONRY_COL_WIDTH = getMasonryColumnWidth(SCREEN_W);
  const skeletonItems = Array.from({ length: 6 }).map((_, i) => ({
    id: `skel-${i}`,
    aspectRatio: SKELETON_ASPECT_RATIOS[i % SKELETON_ASPECT_RATIOS.length] }));
  const columns = buildMasonryColumns(skeletonItems as GalleriaFeaturedAsset[], MASONRY_COL_WIDTH);

  return (
    <View style={styles.masonryGrid}>
      {columns.map((col, colIdx) => (
        <View key={colIdx} style={[styles.masonryColumn, { width: MASONRY_COL_WIDTH }]}>
          {col.map((item) => {
            const imgHeight = Math.round(MASONRY_COL_WIDTH * item.aspectRatio);
            return (
              <View key={item.id} style={styles.assetCard}>
                <PremiumSkeletonTile width="100%" height={imgHeight} borderRadius={Radius.lg} />
                <View style={styles.assetMeta}>
                  <PremiumSkeletonTile width={60} height={10} borderRadius={Radius.sm} />
                  <PremiumSkeletonTile width="100%" height={14} borderRadius={Radius.sm} />
                  <PremiumSkeletonTile width={70} height={16} borderRadius={Radius.sm} />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function GalleriaEditorialSkeleton() {
  const styles = useGalleriaStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const heroHeight = Math.round(SCREEN_W * (9 / 16));
  return (
    <View style={styles.editorialItem}>
      <PremiumSkeletonTile width="100%" height={heroHeight} borderRadius={Radius.lg} />
      <View style={styles.editorialContent}>
        <PremiumSkeletonTile width="90%" height={18} borderRadius={Radius.sm} />
        <PremiumSkeletonTile width="100%" height={14} borderRadius={Radius.sm} />
        <PremiumSkeletonTile width="60%" height={12} borderRadius={Radius.sm} />
      </View>
      <View style={styles.editorialSeparator} />
    </View>
  );
}
