import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveTheme, Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { MOCK_CATEGORIES } from '../data/mockData';
import { mockFind } from '../utils/mockGate';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { EmptyState } from '../components/EmptyState';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { Typography, Space, Radius } from '../theme/designTokens';

export default function CategoryDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();
  const { categoryId } = route.params || {};

  const category = mockFind(MOCK_CATEGORIES, (c: any) => c.id === categoryId) || MOCK_CATEGORIES[0];
  const gridData = listings.filter(
    (l: any) => l.category.toLowerCase() === category.name.toLowerCase() || categoryId === 'cat1'
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Editorial header with back button and category name */}
        <Reanimated.View entering={FadeInDown.duration(350).delay(50)} style={styles.header}>
          <AnimatedPressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.hugeTitle}>{category.name}</Text>
          <Text style={styles.headerSubtitle}>{gridData.length} listings available</Text>
        </Reanimated.View>

        {/* Refined subcategory chips */}
        {category.subItems && category.subItems.length > 0 && (
          <Reanimated.View entering={FadeInDown.duration(350).delay(120)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {category.subItems.map((sub: any, idx: number) => (
                <AnimatedPressable
                  key={idx}
                  style={styles.chip}
                  onPress={() => navigation.navigate('Browse', { categoryId: category.id, subcategoryId: sub.id, title: sub.name })}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${sub.name} subcategory`}
                  accessibilityHint="Shows listings for this subcategory"
                >
                  <Text style={styles.chipText}>{sub.name}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </Reanimated.View>
        )}

        {/* Section header for the grid */}
        <Reanimated.View entering={FadeInDown.duration(350).delay(180)}>
          <DiscoverySectionHeader
            kicker="CURATED"
            title="Featured Listings"
            style={{ marginTop: Space.lg }}
          />
        </Reanimated.View>

        {/* Pinterest-style masonry grid */}
        {gridData.length > 0 ? (
          <Reanimated.View entering={FadeInDown.duration(350).delay(220)} style={{ marginTop: Space.sm }}>
            <PinterestMasonryGrid
              items={gridData}
              onPressItem={(item: any) => navigation.push('ItemDetail', { itemId: item.id })}
              numColumns={2}
              showSaveButton
              enableEntranceAnimation
            />
          </Reanimated.View>
        ) : (
          <Reanimated.View entering={FadeInDown.duration(350).delay(220)} style={{ marginTop: Space.xl }}>
            <EmptyState
              icon="shirt-outline"
              title="No listings yet"
              subtitle={`We’re curating the best ${category.name.toLowerCase()} pieces. Check back soon or explore related categories.`}
              ctaLabel="Browse All"
              onCtaPress={() => navigation.navigate('Browse', { categoryId: category.id, title: category.name })}
              iconColor={Colors.brand}
            />
          </Reanimated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  hugeTitle: {
    fontSize: 34,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    marginTop: Space.xs,
    letterSpacing: 0.2,
  },
  content: { paddingBottom: 40 },
  chipsScroll: {
    paddingHorizontal: Space.md,
    gap: 8,
    paddingBottom: Space.md,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
});