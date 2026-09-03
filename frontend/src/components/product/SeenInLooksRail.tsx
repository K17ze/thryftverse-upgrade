import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { RecommendationLook } from '../../platform/product';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

export interface SeenInLooksRailProps {
  items: RecommendationLook[];
  onPressItem: (item: RecommendationLook) => void;
  /** Optional "See all" affordance — only render when a real destination exists. */
  onSeeAll?: () => void;
}

const RailItemSeparator = React.memo(function RailItemSeparator() {
  return <View style={{ width: Space.sm }} />;
});

export function SeenInLooksRail({ items, onPressItem, onSeeAll }: SeenInLooksRailProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible look cards on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderLookItem = useCallback(
    ({ item }: { item: RecommendationLook }) => (
      <AnimatedPressable
        style={styles.lookCard}
        onPress={() => onPressItem(item)}
        {...PressPresets.card}
        accessibilityLabel={`Look: ${item.title}`}
        accessibilityRole="button"
      >
        <View style={styles.lookImageWrap}>
          {item.coverImage ? (
            <CachedImage
              uri={item.coverImage}
              style={styles.lookImage}
              containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.lg }}
              contentFit="cover"
              downscaleWidth={160}
            />
          ) : (
            <View style={styles.lookImageFallback} />
          )}
        </View>
        <Text style={styles.lookTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.creatorUsername ? (
          <Text style={styles.lookCreator} numberOfLines={1}>
            @{item.creatorUsername}
          </Text>
        ) : null}
      </AnimatedPressable>
    ),
    [styles, onPressItem],
  );

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
          <Text style={styles.title}>Seen in Looks</Text>
        </View>
        {onSeeAll && items.length > 2 ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={8}
            accessibilityLabel="See all Looks"
            accessibilityRole="button"
          >
            <View style={styles.seeAllRow}>
              <Text style={styles.seeAll}>See all</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.subtitle}>Styled by the community</Text>

      <FlashList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={renderLookItem}
        ItemSeparatorComponent={RailItemSeparator}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    marginTop: Space.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  seeAll: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm },
  listContent: {
    paddingHorizontal: Space.md },
  lookCard: {
    width: 160 },
  lookImageWrap: {
    width: 160,
    height: 200,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  lookImage: {
    width: '100%',
    height: '100%' },
  lookImageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceAlt },
  lookTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    marginTop: Space.xs },
  lookCreator: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs } });
}
