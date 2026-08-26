import React, { useMemo } from 'react';
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
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useTaxonomy } from '../context/TaxonomyContext';
import { Typography, Space, Radius, Type, Control, Stroke, LetterSpacing } from '../theme/designTokens';
import { VisualCategoryTile } from '../components/discover/VisualCategoryTile';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';

type RouteT = RouteProp<RootStackParamList, 'CategoryTree'>;

export default function CategoryTreeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { colors, isDark } = useAppTheme();
  const { categories } = useTaxonomy();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categoryPrefix } = route.params;

  const tree = useMemo(() => {
    const topLevel = categories.filter((c) => c.parentId === null);
    const map: Record<string, { title: string; subs: string[] }[]> = {};
    for (const top of topLevel) {
      const children = categories.filter((c) => c.parentId === top.id);
      map[top.name] = children.map((child) => ({ title: child.name, subs: [] }));
    }
    return map;
  }, [categories]);

  const resolvedPrefix = tree[categoryPrefix] ? categoryPrefix : 'Women';
  const sections = tree[resolvedPrefix] ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Editorial header */}
        <View style={styles.editorialHeader}>
          <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.editorialTitle}>{resolvedPrefix}</Text>
        </View>

        {/* Premium full-width View All */}
        <View>
          <AnimatedPressable
            style={styles.viewAllRow}
            onPress={() => navigation.navigate('Browse', { categoryId: resolvedPrefix.toLowerCase(), title: `All ${resolvedPrefix}` })}
            activeOpacity={0.92}
          >
            <Text style={styles.viewAllText}>View All {resolvedPrefix}</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.background} />
          </AnimatedPressable>
        </View>

        {/* 2-column VisualCategoryTile grid */}
        <View style={styles.gridWrap}>
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
        </View>

        {/* Sections with DiscoverySectionHeader and refined pills */}
        {sections.map((section, index) => (
          <View
            key={section.title}
            style={styles.section}
          >
            <DiscoverySectionHeader
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
                  style={styles.subPill}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('Browse', {
                    categoryId: resolvedPrefix.toLowerCase(),
                    subcategoryId: sub.toLowerCase(),
                    title: sub
                  })}
                >
                  <Text style={styles.subPillText}>{sub}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </View>
        ))}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    editorialHeader: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.lg,
    },
    backBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'flex-start',
      marginBottom: Space.sm,
    },
    editorialTitle: {
      fontSize: Type.display.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.display.letterSpacing - 0.3,
      lineHeight: Type.display.lineHeight + 2,
    },

    viewAllRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.lg,
      paddingHorizontal: Space.lg,
      backgroundColor: colors.brand,
      marginHorizontal: Space.md,
      marginBottom: Space.lg,
      borderRadius: Radius.xl,
    },
    viewAllText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
      color: colors.background,
      letterSpacing: LetterSpacing.wide + 0.18,
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
      backgroundColor: colors.surface,
      paddingHorizontal: Space.md - 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    subPillText: {
      color: colors.textPrimary,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
  });
}