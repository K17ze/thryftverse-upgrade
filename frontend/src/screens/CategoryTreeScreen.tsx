import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { Typography, Space, Radius } from '../theme/designTokens';
import { VisualCategoryTile } from '../components/discover/VisualCategoryTile';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme } from '../theme/ThemeContext';

type RouteT = RouteProp<RootStackParamList, 'CategoryTree'>;

const TREES: Record<string, { title: string; subs: string[] }[]> = {
  Women: [
    { title: 'Clothing', subs: ['Dresses', 'Tops & T-Shirts', 'Trousers', 'Jackets & Coats', 'Knitwear'] },
    { title: 'Shoes', subs: ['Trainers', 'Boots', 'Heels', 'Flats'] },
    { title: 'Bags', subs: ['Shoulder Bags', 'Tote Bags', 'Crossbody Bags'] },
    { title: 'Accessories', subs: ['Jewellery', 'Belts', 'Sunglasses'] }
  ],
  Men: [
    { title: 'Clothing', subs: ['T-Shirts', 'Hoodies & Sweatshirts', 'Trousers', 'Jackets & Coats', 'Jeans'] },
    { title: 'Shoes', subs: ['Trainers', 'Boots', 'Formal Shoes'] },
    { title: 'Accessories', subs: ['Watches', 'Hats & Caps', 'Belts'] }
  ],
  Kids: [
    { title: 'Girls', subs: ['Clothing', 'Shoes', 'Accessories'] },
    { title: 'Boys', subs: ['Clothing', 'Shoes', 'Accessories'] },
    { title: 'Baby', subs: ['0-6 Months', '6-12 Months', '12-24 Months'] }
  ]
};

export default function CategoryTreeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { categoryPrefix } = route.params;
  const reducedMotionEnabled = useReducedMotion();
  const { colors, isDark } = useAppTheme();

  const resolvedPrefix = TREES[categoryPrefix] ? categoryPrefix : 'Women';
  const sections = TREES[resolvedPrefix];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Editorial header */}
        <View style={styles.editorialHeader}>
          <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={[styles.editorialTitle, { color: colors.textPrimary }]}>{resolvedPrefix}</Text>
          <Text style={[styles.editorialSubtitle, { color: colors.textMuted }]}>Curated categories, handpicked for you</Text>
        </View>

        {/* Premium full-width View All */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(100)}>
          <AnimatedPressable
            style={[styles.viewAllRow, { backgroundColor: colors.brand }]}
            onPress={() => navigation.navigate('Browse', { categoryId: resolvedPrefix.toLowerCase(), title: `All ${resolvedPrefix}` })}
            activeOpacity={0.92}
          >
            <Text style={[styles.viewAllText, { color: colors.background }]}>View All {resolvedPrefix}</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.background} />
          </AnimatedPressable>
        </Reanimated.View>

        {/* 2-column VisualCategoryTile grid */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(150)} style={styles.gridWrap}>
          <View style={styles.grid}>
            {sections.map((section, index) => (
              <VisualCategoryTile
                key={section.title}
                title={section.title}
                subtitle={`${section.subs.length} subcategories`}
                onPress={() => navigation.navigate('Browse', {
                  categoryId: resolvedPrefix.toLowerCase(),
                  title: `${resolvedPrefix} ${section.title}`
                })}
                size="medium"
              />
            ))}
          </View>
        </Reanimated.View>

        {/* Sections with DiscoverySectionHeader and refined pills */}
        {sections.map((section, index) => (
          <Reanimated.View
            key={section.title}
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(200 + Math.min(index, 6) * 80)}
            style={styles.section}
          >
            <DiscoverySectionHeader
              kicker="SHOP BY"
              title={section.title}
              actionLabel="Explore"
              onAction={() => navigation.navigate('Browse', {
                categoryId: resolvedPrefix.toLowerCase(),
                title: `${resolvedPrefix} ${section.title}`
              })}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subsScroll}>
              {section.subs.map(sub => (
                <AnimatedPressable
                  key={sub}
                  style={[styles.subPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('Browse', {
                    categoryId: resolvedPrefix.toLowerCase(),
                    subcategoryId: sub.toLowerCase(),
                    title: sub
                  })}
                >
                  <Text style={[styles.subPillText, { color: colors.textPrimary }]}>{sub}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </Reanimated.View>
        ))}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  editorialHeader: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: Space.sm,
  },
  editorialTitle: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  editorialSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    marginTop: Space.xs,
    letterSpacing: 0.2,
  },

  viewAllRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.lg,
    paddingHorizontal: Space.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.xl,
  },
  viewAllText: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.3,
  },

  gridWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },

  section: {
    marginTop: Space.md,
    paddingHorizontal: Space.md,
  },

  subsScroll: {
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  subPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  subPillText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
});