import React, { useMemo } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { CATEGORIES } from '../constants/categories';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Space, Typography } from '../theme/designTokens';

const normalize = (value?: string) =>
  (value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-');

export default function CategoryDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();
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
      const subcategoryToken = normalize(listing.subcategory);
      return categoryTokens.has(categoryToken) || categoryTokens.has(subcategoryToken);
    });
  }, [category, listings]);

  if (!category) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar
          barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
          backgroundColor={Colors.background}
        />
        <ScreenHeader title="Category" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="grid-outline"
          title="Category unavailable"
          subtitle="This category may have moved. Browse the current marketplace categories instead."
          ctaLabel="Browse marketplace"
          onCtaPress={() =>
            navigation.replace('Browse', { categoryId: 'all', title: 'Browse' })
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />
      <ScreenHeader title={category.name} onBack={() => navigation.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.summary}>
          <Text style={styles.count}>
            {gridData.length} {gridData.length === 1 ? 'listing' : 'listings'}
          </Text>
          <Text style={styles.summaryText}>
            Browse the latest {category.name.toLocaleLowerCase()} pieces from the community.
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
                <SkeletonLoader width="100%" height={index % 2 === 0 ? 220 : 180} borderRadius={14} />
                <SkeletonLoader width="78%" height={14} borderRadius={6} style={styles.skeletonLine} />
                <SkeletonLoader width="46%" height={12} borderRadius={6} style={styles.skeletonMeta} />
              </View>
            ))}
          </View>
        ) : gridData.length > 0 ? (
          <Reanimated.View entering={FadeIn.duration(220)} style={styles.grid}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: Space.xl,
  },
  summary: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.md,
    gap: 4,
  },
  count: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryText: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  categoryRail: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    gap: Space.lg,
  },
  categoryAction: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryActionText: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  grid: {
    paddingTop: Space.xs,
  },
  loadingGrid: {
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
    marginTop: 6,
  },
  emptyWrap: {
    minHeight: 360,
    justifyContent: 'center',
  },
});
