import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Note: ScrollView is retained for the horizontal subcategory rail only.
// The vertical scroll surface is owned by the FlashList inside PinterestMasonryGrid.
import { useNavigation, useRoute } from '@react-navigation/native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { CATEGORIES } from '../constants/categories';
import { useBackendData } from '../context/BackendDataContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Space, Typography, Type, Control, Stroke, Radius } from '../theme/designTokens';

const normalize = (value?: string) =>
  (value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-');

export default function CategoryDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const categoryId = route.params?.categoryId as string | undefined;

  const category = useMemo(() => {
    const target = normalize(categoryId);
    return CATEGORIES.find(
      (candidate) =>
        normalize(candidate.id) === target || normalize(candidate.name) === target
    );
  }, [categoryId]);

  const gridData = useMemo(() => {
    if (!category) return [];
    const categoryTokens = new Set([
      normalize(category.id),
      normalize(category.name),
      ...category.subcategories.flatMap((subcategory) => [
        normalize(subcategory.id),
        normalize(subcategory.name),
      ]),
    ]);

    return listings.filter((listing) => {
      const categoryToken = normalize(listing.category);
      const subcategoryToken = normalize(listing.subcategory ?? undefined);
      return categoryTokens.has(categoryToken) || categoryTokens.has(subcategoryToken);
    });
  }, [category, listings]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: {
          flex: 1,
        },
        summary: {
          paddingHorizontal: Space.md,
          paddingTop: Space.xs,
          paddingBottom: Space.md,
          gap: Space.xs,
        },
        count: {
          color: colors.textPrimary,
          fontFamily: Typography.family.semibold,
          fontSize: Type.body.size,
          lineHeight: Type.body.lineHeight,
        },
        categoryRail: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.lg,
          gap: Space.lg,
        },
        categoryAction: {
          minHeight: Control.hit,
          justifyContent: 'center',
          borderBottomWidth: Stroke.standard,
          borderBottomColor: colors.border,
        },
        categoryActionText: {
          color: colors.textPrimary,
          fontFamily: Typography.family.semibold,
          fontSize: Type.body.size,
        },
        grid: {
          flex: 1,
          paddingTop: Space.xs,
        },
        loadingGrid: {
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Space.sm,
          paddingHorizontal: Space.md,
        },
        loadingColumn: {
          width: '48%',
          marginBottom: Space.md,
        },
        skeletonLine: {
          marginTop: Space.sm,
        },
        skeletonMeta: {
          marginTop: Space.xs + 2,
        },
        emptyWrap: {
          flex: 1,
          minHeight: Space.xxl * 7 + Space.lg,
          justifyContent: 'center',
        },
      }),
    [colors]
  );

  if (!category) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        header={<FlagshipHeader title="Category" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="grid-outline"
          title="Category unavailable"
          subtitle="This category may have moved. Browse the current marketplace categories instead."
          ctaLabel="Browse marketplace"
          onCtaPress={() =>
            navigation.replace('Browse', { categoryId: 'all', title: 'Browse' })
          }
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={<FlagshipHeader title={category.name} onBack={() => navigation.goBack()} />}
    >
      <View style={styles.content}>
        <View style={styles.summary}>
          <Text style={styles.count}>
            {gridData.length} {gridData.length === 1 ? 'listing' : 'listings'}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRail}
        >
          {category.subcategories.map((subcategory) => (
            <AnimatedPressable
              key={subcategory.id}
              style={styles.categoryAction}
              onPress={() =>
                navigation.navigate('Browse', {
                  categoryId: category.id,
                  subcategoryId: subcategory.id,
                  title: subcategory.name,
                })
              }
              activeOpacity={0.65}
              scaleValue={0.98}
              accessibilityRole="button"
              accessibilityLabel={`Browse ${subcategory.name}`}
            >
              <Text style={styles.categoryActionText}>{subcategory.name}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>

        {isSyncing && gridData.length === 0 ? (
          <View style={styles.loadingGrid} accessibilityLabel="Loading category listings">
            {Array.from({ length: 4 }).map((_, index) => (
              <View key={index} style={styles.loadingColumn}>
                <SkeletonLoader width="100%" height={index % 2 === 0 ? 220 : 180} borderRadius={Radius.lg} />
                <SkeletonLoader width="78%" height={14} borderRadius={Radius.sm} style={styles.skeletonLine} />
                <SkeletonLoader width="46%" height={12} borderRadius={Radius.sm} style={styles.skeletonMeta} />
              </View>
            ))}
          </View>
        ) : gridData.length > 0 ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(220)} style={styles.grid}>
            <PinterestMasonryGrid
              items={gridData}
              onPressItem={(item) =>
                navigation.push('ItemDetail', { itemId: item.id })
              }
              numColumns={2}
              showSaveButton
              enableEntranceAnimation
            />
          </Reanimated.View>
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={lastError ? 'cloud-offline-outline' : 'shirt-outline'}
              title={lastError ? 'Couldn’t load listings' : 'No listings yet'}
              subtitle={
                lastError
                  ? 'Check your connection and try loading this category again.'
                  : `New ${category.name.toLocaleLowerCase()} listings will appear here as sellers publish them.`
              }
              ctaLabel={lastError ? 'Try again' : 'Browse all'}
              onCtaPress={
                lastError
                  ? refreshListings
                  : () =>
                      navigation.navigate('Browse', {
                        categoryId: 'all',
                        title: 'Browse',
                      })
              }
            />
          </View>
        )}
      </View>
    </FlagshipScreen>
  );
}

