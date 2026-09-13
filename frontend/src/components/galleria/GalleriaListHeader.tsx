import React from 'react';
import { View, Text } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';

import { HorizontalRail } from '../HorizontalRail';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import {
  GALLERIA_DEMO_MODE,
  type GalleriaCollection,
  type GalleriaEditorial } from '../../services/galleriaApi';
import { GalleriaHeroEditorialCard } from './GalleriaHeroEditorialCard';
import { GalleriaFeaturedCollectionCard } from './GalleriaFeaturedCollectionCard';
import { GalleriaCollectionRailCard } from './GalleriaCollectionRailCard';
import { GalleriaSectionHeader } from './GalleriaSectionHeader';
import {
  GalleriaHeroSkeleton,
  GalleriaCollectionRailSkeleton,
  GalleriaFeaturedMasonrySkeleton } from './GalleriaSkeletons';
import { MASONRY_GAP, MASONRY_PADDING } from './galleriaLayout';

// ---------------------------------------------------------------------------
// List header — demo badge, hero editorial, curated collections, assets header
// ---------------------------------------------------------------------------
export function GalleriaListHeader({
  loading,
  heroEditorial,
  collections,
  featuredCollection,
  railCollections,
  hasFeaturedAssets,
  reducedMotion,
  onCollectionPress }: {
  loading: boolean;
  heroEditorial: GalleriaEditorial | null;
  collections: GalleriaCollection[];
  featuredCollection: GalleriaCollection | null;
  railCollections: GalleriaCollection[];
  hasFeaturedAssets: boolean;
  reducedMotion: boolean;
  onCollectionPress: (collection: GalleriaCollection) => void;
}) {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <View style={{ marginHorizontal: -(MASONRY_PADDING - MASONRY_GAP / 2) }}>
      {/* ── Honest demo indicator (AGENTS.md §11) ── */}
      {GALLERIA_DEMO_MODE && (
        <View style={styles.demoBadgeRow}>
          <View style={styles.demoBadgeDot} />
          <Text style={styles.demoBadgeText}>{t('demo.content')}</Text>
        </View>
      )}

      {/* ── Section 1: Hero editorial ── */}
      {loading ? (
        <GalleriaHeroSkeleton />
      ) : heroEditorial ? (
        <GalleriaHeroEditorialCard
          editorial={heroEditorial}
        />
      ) : null}

      {/* ── Section 2: Curated Collections — featured + rail ── */}
      {loading ? (
        <GalleriaCollectionRailSkeleton />
      ) : collections.length > 0 ? (
        <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)} style={styles.sectionWrap}>
          <Text style={styles.sectionEyebrow}>{t('collections.eyebrow')}</Text>
          {featuredCollection && (
            <GalleriaFeaturedCollectionCard
              collection={featuredCollection}
              onPress={() => onCollectionPress(featuredCollection)}
            />
          )}
          {railCollections.length > 0 && (
            <HorizontalRail
              contentContainerStyle={styles.railContent}
              showsHorizontalScrollIndicator={false}
              accessibilityLabel={t('accessibility.collectionsRail')}
            >
              {railCollections.map((col) => (
                <GalleriaCollectionRailCard
                  key={col.id}
                  collection={col}
                  onPress={() => onCollectionPress(col)}
                />
              ))}
            </HorizontalRail>
          )}
        </Reanimated.View>
      ) : null}

      {/* ── Section 3: Featured Assets — header + loading skeleton ── */}
      {loading ? (
        <>
          <GalleriaSectionHeader eyebrow={t('assets.eyebrow')} title={t('assets.title')} />
          <GalleriaFeaturedMasonrySkeleton />
        </>
      ) : hasFeaturedAssets ? (
        <GalleriaSectionHeader eyebrow={t('assets.eyebrow')} title={t('assets.title')} />
      ) : null}
    </View>
  );
}
