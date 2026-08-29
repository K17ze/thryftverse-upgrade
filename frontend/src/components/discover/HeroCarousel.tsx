import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  ViewToken } from 'react-native';
import { Video, ResizeMode } from '../compat/Video';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Radius, Space, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
  const reducedMotion = useReducedMotion();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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
              color={colors.scrimTextPrimary}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    slide: {
      width: SCREEN_W,
      height: SCREEN_W * 1.3,
      position: 'relative' },
    media: {
      width: '100%',
      height: '100%' },
    muteBtn: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center' },
    infoOverlay: {
      position: 'absolute',
      bottom: 56,
      left: 20,
      right: 100 },
    sponsorLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.scrimTextSecondary,
      marginBottom: Space.xs },
    heroTitle: {
      fontFamily: Typography.family.bold,
      fontSize: TypographyV2.priceHero.size,
      color: colors.scrimTextPrimary,
      letterSpacing: -0.6,
      lineHeight: 34,
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6 },
    visitBtn: {
      position: 'absolute',
      bottom: 56,
      right: 20,
      backgroundColor: colors.overlay,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: Radius.xxl,
      borderWidth: Stroke.standard,
      borderColor: colors.glassBorder },
    visitBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.scrimTextPrimary },
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
      backgroundColor: colors.textMuted },
    dotActive: {
      width: 18,
      borderRadius: Radius.sm,
      backgroundColor: colors.textPrimary } });
}
