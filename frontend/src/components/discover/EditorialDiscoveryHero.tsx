import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  FlatList,
  ViewToken } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface HeroItem {
  id: string;
  uri: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaAction?: () => void;
}

interface Props {
  items: HeroItem[];
  autoPlayInterval?: number;
}

export function EditorialDiscoveryHero({ items, autoPlayInterval = 5000 }: Props) {
  const { colors, isDark } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, SCREEN_W), [colors, SCREEN_W]);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<HeroItem>>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInteractingRef = useRef(false);
  const reducedMotion = useReducedMotion();

  const startAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    autoPlayTimerRef.current = setInterval(() => {
      if (isInteractingRef.current) return;
      const next = (activeIndex + 1) % items.length;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    }, autoPlayInterval);
  }, [activeIndex, items.length, autoPlayInterval]);

  useEffect(() => {
    startAutoPlay();
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [startAutoPlay]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60 }).current;

  const renderItem = useCallback(
    ({ item }: { item: HeroItem }) => (
      <View style={styles.slide}>
        <CachedImage
          uri={item.uri}
          style={styles.media}
          contentFit="cover"
          emptyLabel={item.title}
          emptyIcon="image-outline"
        />

        {/* Bottom gradient scrim */}
        <LinearGradient
          colors={
            !isDark
              ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)']
              : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Bottom info */}
        <View style={styles.infoOverlay}>
          <Text style={styles.heroTitle}>{item.title}</Text>
          {item.subtitle ? (
            <Text style={styles.heroSubtitle}>{item.subtitle}</Text>
          ) : null}
        </View>

        {/* CTA */}
        {item.ctaLabel && item.ctaAction && (
          <AnimatedPressable
            style={styles.visitBtn}
            onPress={item.ctaAction}
            activeOpacity={0.85}
          >
            <Text style={styles.visitBtnText}>{item.ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.textInverse} />
          </AnimatedPressable>
        )}
      </View>
    ),
    [styles, colors, isDark]
  );

  if (items.length === 0) return null;

  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(400)}>
      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollBeginDrag={() => { isInteractingRef.current = true; }}
        onScrollEndDrag={() => { isInteractingRef.current = false; startAutoPlay(); }}
        decelerationRate="fast"
        snapToInterval={SCREEN_W}
        snapToAlignment="center"
      />

      {/* Pagination — pill style */}
      <View style={styles.dotsRow}>
        {items.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === activeIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </Reanimated.View>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number) {
  return StyleSheet.create({
  slide: {
    width: screenWidth,
    height: screenWidth * 1.05,
    position: 'relative' },
  media: {
    width: '100%',
    height: '100%' },
  infoOverlay: {
    position: 'absolute',
    bottom: 52,
    left: Space.md,
    right: 120 },
  heroTitle: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.priceHero.size,
    color: colors.textPrimary,
    letterSpacing: -0.6,
    lineHeight: 34,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  heroSubtitle: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size,
    color: colors.textSecondary,
    marginTop: Space.xs,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3 },
  visitBtn: {
    position: 'absolute',
    bottom: 52,
    right: Space.md,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 },
  visitBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size,
    color: colors.background },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: Space.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.borderSubtle },
  dotActive: {
    width: 18,
    borderRadius: Radius.sm,
    backgroundColor: colors.textPrimary } });
}
