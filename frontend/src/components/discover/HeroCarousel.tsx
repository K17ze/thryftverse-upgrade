import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  ViewToken,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors, ActiveTheme } from '../../constants/colors';
import { Typography } from '../../constants/typography';

const { width: SCREEN_W } = Dimensions.get('window');

export interface HeroItem {
  id: string;
  type: 'image' | 'video';
  uri: string;
  posterUri?: string;
  sponsor?: string;
  title: string;
  ctaLabel?: string;
  ctaAction?: () => void;
}

interface Props {
  items: HeroItem[];
  autoPlayInterval?: number;
}

export function HeroCarousel({ items, autoPlayInterval = 5000 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
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
        {item.type === 'video' ? (
          <Video
            source={{ uri: item.uri }}
            style={styles.media}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isMuted={muted}
            isLooping
            usePoster={!!item.posterUri}
            posterSource={item.posterUri ? { uri: item.posterUri } : undefined}
          />
        ) : (
          <CachedImage
            uri={item.uri}
            style={styles.media}
            contentFit="cover"
          />
        )}

        {/* Top-right mute toggle for videos */}
        {item.type === 'video' && (
          <AnimatedPressable
            style={styles.muteBtn}
            onPress={() => setMuted((m) => !m)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={muted ? 'volume-mute' : 'volume-high'}
              size={18}
              color="#fff"
            />
          </AnimatedPressable>
        )}

        {/* Bottom gradient / info */}
        <View style={styles.infoOverlay}>
          {item.sponsor && (
            <Text style={styles.sponsorLabel}>
              Sponsored by {item.sponsor}
            </Text>
          )}
          <Text style={styles.heroTitle}>{item.title}</Text>
        </View>

        {/* Visit CTA */}
        {item.ctaLabel && (
          <AnimatedPressable
            style={styles.visitBtn}
            onPress={item.ctaAction}
            activeOpacity={0.85}
          >
            <Text style={styles.visitBtnText}>{item.ctaLabel}</Text>
          </AnimatedPressable>
        )}
      </View>
    ),
    [muted]
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
        onScrollBeginDrag={() => {
          isInteractingRef.current = true;
        }}
        onScrollEndDrag={() => {
          isInteractingRef.current = false;
          startAutoPlay();
        }}
        decelerationRate="fast"
        snapToInterval={SCREEN_W}
        snapToAlignment="center"
      />

      {/* Pagination dots */}
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
    height: SCREEN_W * 1.15,
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  muteBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 56,
    left: 20,
    right: 100,
  },
  sponsorLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 24,
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  visitBtn: {
    position: 'absolute',
    bottom: 56,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  visitBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: '#fff',
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
