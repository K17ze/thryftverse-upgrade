import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  ViewToken,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors, ActiveTheme } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

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
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<HeroItem>>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInteractingRef = useRef(false);

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
    itemVisiblePercentThreshold: 60,
  }).current;

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
            ActiveTheme === 'light'
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
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </AnimatedPressable>
        )}
      </View>
    ),
    []
  );

  if (items.length === 0) return null;

  return (
    <Reanimated.View entering={FadeIn.duration(400)}>
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

const styles = StyleSheet.create({
  slide: {
    width: SCREEN_W,
    height: SCREEN_W * 1.05,
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 52,
    left: Space.md,
    right: 120,
  },
  heroTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 28,
    color: ActiveTheme === 'light' ? Colors.textPrimary : '#fff',
    letterSpacing: -0.6,
    lineHeight: 34,
    textShadowColor: ActiveTheme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontFamily: Typography.family.medium,
    fontSize: 14,
    color: ActiveTheme === 'light' ? Colors.textSecondary : 'rgba(255,255,255,0.85)',
    marginTop: 4,
    textShadowColor: ActiveTheme === 'light' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  visitBtn: {
    position: 'absolute',
    bottom: 52,
    right: Space.md,
    backgroundColor: Colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  visitBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: Colors.background,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ActiveTheme === 'light' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 18,
    borderRadius: 3,
    backgroundColor: ActiveTheme === 'light' ? Colors.textPrimary : '#fff',
  },
});
