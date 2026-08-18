/**
 * FilterStrip — main filter carousel component.
 *
 * Extracted from the original FilterStrip.tsx as part of the shared-abstraction
 * split. Contains the main horizontal filter carousel with scroll-snap, the
 * intensity slider, and the filter name overlay.
 *
 * Filter definitions and ColorMatrix data live in ./filterConfig.
 * Skia preview thumbnails live in ./FilterPreview.
 *
 * @module FilterStrip
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Typography, Radius, Space, Stroke } from '../../../theme/designTokens';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
  interpolate,
  Extrapolation,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { AnimatedPressable } from '../../AnimatedPressable';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { useHaptic } from '../../../hooks/useHaptic';

import {
  FILTERS,
  type ImageFilter,
  type FilterConfig,
} from './filterConfig';
import { FilterThumbnail, THUMB_SIZE, THUMB_GAP } from './FilterPreview';

// ── Props ──────────────────────────────────────────────────────────
export interface FilterStripProps {
  activeFilter: ImageFilter;
  onFilterChange: (filter: ImageFilter) => void;
  visible: boolean;
  previewUri?: string;
  /** Filter intensity 0..100. Stored in CreatorContext state by the parent. */
  filterIntensity?: number;
  /** Callback when the intensity slider changes (real-time). */
  onIntensityChange?: (intensity: number) => void;
  /** Show the filter name overlay while browsing. Default true. */
  showNameOverlay?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────
const STRIP_PADDING = Space.md;

// ── Component ──────────────────────────────────────────────────────
export function FilterStrip({
  activeFilter,
  onFilterChange,
  visible,
  previewUri,
  filterIntensity = 100,
  onIntensityChange,
  showNameOverlay = true,
}: FilterStripProps) {
  const haptic = useHaptic();
  const { spring, isEnabled } = useMotionConfig();
  const reduceMotion = useReducedMotion();

  // Intensity as a 0..1 shared value so the slider and previews stay in sync
  const intensitySV = useSharedValue(filterIntensity / 100);
  useEffect(() => {
    intensitySV.value = filterIntensity / 100;
  }, [filterIntensity, intensitySV]);

  // Track whether the intensity slider is expanded (tapping the active filter toggles it)
  const [sliderVisible, setSliderVisible] = React.useState(false);

  // Stagger entrance: each filter fades in with 50ms delay
  const mountedRef = useRef(false);
  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
    }
  }, [visible]);

  // Filter name overlay state
  const overlayOpacity = useSharedValue(0);
  const overlayScale = useSharedValue(reduceMotion ? 1 : 0.9);
  const overlayHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNameOverlayFor = useCallback(
    (label: string) => {
      if (!showNameOverlay) return;
      // We don't need the label here — the active filter drives the text.
      // Fade in fast (200ms), schedule fade out (800ms) after 700ms hold.
      cancelAnimation(overlayOpacity);
      cancelAnimation(overlayScale);
      overlayOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
      if (!reduceMotion) {
        overlayScale.value = withSpring(1, spring.entrance);
      }
      if (overlayHideTimer.current) clearTimeout(overlayHideTimer.current);
      overlayHideTimer.current = setTimeout(() => {
        overlayOpacity.value = withTiming(0, { duration: 800, easing: Easing.in(Easing.ease) });
        if (!reduceMotion) {
          overlayScale.value = withSpring(0.9, spring.entrance);
        }
      }, 700);
    },
    [showNameOverlay, reduceMotion, spring, overlayOpacity, overlayScale]
  );

  useEffect(() => {
    return () => {
      if (overlayHideTimer.current) clearTimeout(overlayHideTimer.current);
    };
  }, []);

  // Scroll snap: spring-decelerate to nearest filter centre
  const scrollRef = useRef<ScrollView>(null);
  const contentWidthSV = useSharedValue(0);
  const layoutWidthSV = useSharedValue(0);
  const targetOffsetSV = useSharedValue(0);

  const onContentSizeChange = useCallback((w: number) => {
    contentWidthSV.value = w;
  }, [contentWidthSV]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    layoutWidthSV.value = e.nativeEvent.layout.width;
  }, [layoutWidthSV]);

  // When the active filter changes externally, centre it in the carousel
  const activeIndex = useMemo(
    () => Math.max(0, FILTERS.findIndex((f) => f.name === activeFilter)),
    [activeFilter]
  );

  useEffect(() => {
    if (!visible) return;
    const cellWidth = THUMB_SIZE + THUMB_GAP;
    const target = activeIndex * cellWidth + THUMB_SIZE / 2 - layoutWidthSV.value / 2;
    targetOffsetSV.value = Math.max(0, target);
    // Use a short timeout so the ScrollView has measured
    const r = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: Math.max(0, target), animated: !reduceMotion });
    });
    return () => cancelAnimationFrame(r);
  }, [activeIndex, visible, reduceMotion, layoutWidthSV, targetOffsetSV]);

  // Snap on scroll end
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const cellWidth = THUMB_SIZE + THUMB_GAP;
      const offsetX = e.nativeEvent.contentOffset.x;
      const idx = Math.round((offsetX + layoutWidthSV.value / 2 - THUMB_SIZE / 2) / cellWidth);
      const clamped = Math.max(0, Math.min(FILTERS.length - 1, idx));
      const target = clamped * cellWidth + THUMB_SIZE / 2 - layoutWidthSV.value / 2;
      scrollRef.current?.scrollTo({ x: Math.max(0, target), animated: !reduceMotion });
      if (clamped !== activeIndex) {
        const next = FILTERS[clamped];
        if (next) {
          haptic.selection();
          onFilterChange(next.name);
          showNameOverlayFor(next.label);
        }
      }
    },
    [activeIndex, haptic, onFilterChange, reduceMotion, layoutWidthSV, showNameOverlayFor]
  );

  // ── Filter selection handler ─────────────────────────────────────
  const handleFilterPress = useCallback(
    (filter: FilterConfig) => {
      const isActive = activeFilter === filter.name;
      if (isActive) {
        // Tapping the already-selected filter toggles the intensity slider
        setSliderVisible((prev) => !prev);
        haptic.selection();
      } else {
        haptic.selection();
        onFilterChange(filter.name);
        setSliderVisible(false);
        showNameOverlayFor(filter.label);
      }
    },
    [activeFilter, haptic, onFilterChange, showNameOverlayFor]
  );

  // ── Intensity slider handler (debounced haptic) ──────────────────
  const lastHapticRef = useRef(0);
  const handleIntensityChange = useCallback(
    (value: number) => {
      intensitySV.value = value;
      onIntensityChange?.(Math.round(value * 100));
      // Debounced light tick — at most every 80ms
      const now = Date.now();
      if (now - lastHapticRef.current > 80) {
        lastHapticRef.current = now;
        haptic.selection();
      }
    },
    [haptic, intensitySV, onIntensityChange]
  );

  if (!visible) return null;

  const activeConfig = FILTERS[activeIndex] ?? FILTERS[0];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Filter name overlay — centred, blurred, spring scale */}
      {showNameOverlay && <FilterNameOverlay opacitySV={overlayOpacity} scaleSV={overlayScale} label={activeConfig.label} />}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        accessibilityRole="list"
        accessibilityLabel="Image filters"
        onContentSizeChange={(_, w) => onContentSizeChange(w)}
        onLayout={onLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        decelerationRate={Platform.OS === 'ios' ? 0.9 : 0.9}
        snapToInterval={THUMB_SIZE + THUMB_GAP}
        snapToAlignment="center"
      >
        {FILTERS.map((filter, index) => {
          const isActive = activeFilter === filter.name;
          return (
            <FilterThumbnail
              key={filter.name}
              filter={filter}
              isActive={isActive}
              previewUri={previewUri}
              intensitySV={intensitySV}
              onPress={() => handleFilterPress(filter)}
              spring={spring}
              reduceMotion={reduceMotion}
              staggerIndex={index}
              mounted={mountedRef.current}
              accessibilityLabel={`${filter.label} filter${isActive ? ', active' : ''}`}
              accessibilityHint={`Applies the ${filter.label.toLowerCase()} filter to the image`}
            />
          );
        })}
      </ScrollView>

      {/* Intensity slider — slides up from bottom of strip with spring */}
      <IntensitySlider
        visible={sliderVisible && activeFilter !== 'normal'}
        intensitySV={intensitySV}
        onChange={handleIntensityChange}
        spring={spring}
        reduceMotion={reduceMotion}
        label={activeConfig.label}
      />
    </View>
  );
}

export default FilterStrip;

// ── Intensity slider ───────────────────────────────────────────────
interface IntensitySliderProps {
  visible: boolean;
  intensitySV: SharedValue<number>;
  onChange: (value: number) => void;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  reduceMotion: boolean;
  label: string;
}

function IntensitySlider({ visible, intensitySV, onChange, spring, reduceMotion, label }: IntensitySliderProps) {
  const translateY = useSharedValue(reduceMotion ? 0 : 60);
  const opacity = useSharedValue(0);
  const [trackLayout, setTrackLayout] = React.useState({ width: 0, x: 0 });

  useEffect(() => {
    if (visible) {
      if (reduceMotion) {
        translateY.value = 0;
        opacity.value = 1;
      } else {
        translateY.value = withSpring(0, spring.entrance);
        opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
      }
    } else {
      if (reduceMotion) {
        translateY.value = 60;
        opacity.value = 0;
      } else {
        translateY.value = withSpring(60, spring.entrance);
        opacity.value = withTiming(0, { duration: 160 });
      }
    }
  }, [visible, reduceMotion, spring, translateY, opacity]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Thumb position derived from intensity (0..1) × track width
  const thumbStyle = useAnimatedStyle(() => {
    const w = trackLayout.width || 1;
    return {
      transform: [{ translateX: intensitySV.value * w }],
    };
  });

  // Fill width derived from intensity
  const fillStyle = useAnimatedStyle(() => {
    return {
      width: `${intensitySV.value * 100}%`,
    };
  });

  const handleTrackPress = useCallback(
    (e: GestureResponderEvent) => {
      const w = trackLayout.width || 1;
      const x = e.nativeEvent.locationX;
      const v = Math.max(0, Math.min(1, x / w));
      onChange(v);
    },
    [trackLayout.width, onChange]
  );

  const handleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackLayout({ width: e.nativeEvent.layout.width, x: e.nativeEvent.layout.x });
  }, []);

  return (
    <Reanimated.View style={[styles.sliderContainer, containerStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>Intensity</Text>
        <Text style={styles.sliderValue}>{Math.round(intensitySV.value * 100)}%</Text>
      </View>
      <Pressable
        style={styles.sliderTrackWrap}
        onPress={handleTrackPress}
        onLayout={handleTrackLayout}
        accessibilityLabel={`${label} filter intensity slider`}
        accessibilityRole="adjustable"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(intensitySV.value * 100),
          text: `${Math.round(intensitySV.value * 100)} percent`,
        }}
      >
        {/* Track background */}
        <View style={styles.sliderTrack} />
        {/* Gradient fill */}
        <Reanimated.View style={[styles.sliderFill, fillStyle]}>
          <LinearGradient
            colors={['#feda75', '#fa7e1e', '#d62976']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
        {/* Thumb */}
        <Reanimated.View style={[styles.sliderThumb, thumbStyle]} pointerEvents="none" />
      </Pressable>
    </Reanimated.View>
  );
}

// ── Filter name overlay ────────────────────────────────────────────
interface FilterNameOverlayProps {
  opacitySV: SharedValue<number>;
  scaleSV: SharedValue<number>;
  label: string;
}

function FilterNameOverlay({ opacitySV, scaleSV, label }: FilterNameOverlayProps) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacitySV.value,
    transform: [{ scale: scaleSV.value }],
  }));

  return (
    <Reanimated.View style={[styles.overlayWrap, animStyle]} pointerEvents="none">
      <BlurView intensity={40} tint="dark" style={styles.overlayBlur}>
        <Text style={styles.overlayText}>{label}</Text>
      </BlurView>
    </Reanimated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  strip: {
    gap: THUMB_GAP,
    paddingHorizontal: STRIP_PADDING,
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
  // Intensity slider
  sliderContainer: {
    marginTop: Space.sm,
    marginHorizontal: Space.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sliderLabel: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sliderValue: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  sliderTrackWrap: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrack: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  sliderFill: {
    height: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  sliderThumb: {
    position: 'absolute',
    top: '50%',
    left: 0,
    marginTop: -10,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  // Filter name overlay
  overlayWrap: {
    position: 'absolute',
    top: -180,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 24,
  },
  overlayBlur: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  overlayText: {
    fontSize: Typography.size.title,
    fontFamily: Typography.family.bold,
    color: '#fff',
    letterSpacing: 0.5,
  },
});
