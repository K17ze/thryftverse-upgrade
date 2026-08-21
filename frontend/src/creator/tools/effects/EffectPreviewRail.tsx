/**
 * EffectPreviewRail — a horizontal scrollable rail of native effect preview
 * thumbnails for the creator effect picker.
 *
 * Each item shows an EffectPreviewThumb (real Skia-rendered thumbnail with
 * the filter applied) plus a name label. Tap commits to a filter (onSelect).
 * Below the rail, when a preset is selected, an intensity slider appears
 * (0..1 — interpolates between identity and the full effect). Press-and-hold
 * on the rail area shows the original (before/after trust interaction,
 * spec 07 §5).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13/§18: light haptic on select, suppressed under reduced
 * motion, 44pt touch targets, accessibility labels.
 * Per spec 07 §3: selected state unambiguous, low-res Skia previews.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Space,
  FontSize,
  FontFamily,
  Radius,
  Stroke,
  Control,
} from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { EffectPreviewThumb } from './EffectPreviewThumb';
import type { EffectPreset } from './EffectTypes';

export interface EffectPreviewRailProps {
  sourceUri: string;
  presets: EffectPreset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Live preview callback fired while the user scrolls the rail. Reports the
   * id of the thumbnail currently closest to the centre of the viewport — the
   * parent applies it as a transient (no-history) preview on the full canvas.
   * Only fires when the centred filter changes, so re-renders are bounded by
   * the number of thumbnails scrolled past. Tap still commits via `onSelect`.
   */
  onPreview?: (id: string | null) => void;
  /** Current intensity 0..1 (null = use preset default). */
  intensity?: number | null;
  /** Called when the intensity slider changes (live, during drag). */
  onIntensityChange?: (value: number) => void;
  /** Called when the intensity slider is released (commit to history). */
  onIntensityCommit?: (value: number) => void;
}

/**
 * Horizontal rail of effect preview thumbnails + intensity slider.
 * Press commits a selection. Press-and-hold on a thumbnail shows the original.
 */
export function EffectPreviewRail({
  sourceUri,
  presets,
  selectedId,
  onSelect,
  onPreview,
  intensity,
  onIntensityChange,
  onIntensityCommit,
}: EffectPreviewRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const [showOriginal, setShowOriginal] = useState(false);

  // ── Live-preview: centred-thumbnail detection during scroll ──────────
  // As the user scrolls, the thumbnail closest to the viewport centre is
  // reported via onPreview so the parent can apply it to the full canvas as
  // a transient (no-history) preview — the Snapchat/Instagram pattern. We
  // measure each thumbnail's layout once and recompute the centre on every
  // scroll event; onPreview only fires when the centred id actually changes,
  // so re-renders are bounded by the number of filters scrolled past.
  const viewportWidthRef = useRef(0);
  const thumbLayoutsRef = useRef<Map<number, { x: number; width: number }>>(new Map());
  const lastPreviewedIdRef = useRef<string | null>(null);

  const handleScrollLayout = useCallback((e: LayoutChangeEvent) => {
    viewportWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  const handleThumbLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      thumbLayoutsRef.current.set(index, {
        x: e.nativeEvent.layout.x,
        width: e.nativeEvent.layout.width,
      });
    },
    [],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!onPreview) return;
      const viewportWidth = viewportWidthRef.current;
      if (viewportWidth <= 0) return;
      const viewportCenter = e.nativeEvent.contentOffset.x + viewportWidth / 2;

      let closestIndex = -1;
      let closestDelta = Infinity;
      thumbLayoutsRef.current.forEach((layout, index) => {
        const thumbCenter = layout.x + layout.width / 2;
        const delta = Math.abs(thumbCenter - viewportCenter);
        if (delta < closestDelta) {
          closestDelta = delta;
          closestIndex = index;
        }
      });

      if (closestIndex >= 0 && closestIndex < presets.length) {
        const id = presets[closestIndex].id;
        if (id !== lastPreviewedIdRef.current) {
          lastPreviewedIdRef.current = id;
          onPreview(id);
        }
      }
    },
    [onPreview, presets],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (!reducedMotion) haptic.light();
      // A tap commits the selection; sync the preview tracker so subsequent
      // scroll-preview callbacks only fire when the centre moves away.
      lastPreviewedIdRef.current = id;
      onSelect(id);
    },
    [haptic, onSelect, reducedMotion],
  );

  // ── Before/after: long-press shows original ───────────────────────────
  // Press-and-hold on the rail area bypasses the graph (shows original).
  // Release restores. Spec 07 §5: high-value trust interaction.
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(300)
        .onBegin(() => {
          runOnJS(setShowOriginal)(true);
          runOnJS(haptic.medium)();
        })
        .onFinalize(() => {
          runOnJS(setShowOriginal)(false);
        }),
    [haptic],
  );

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedId) ?? null,
    [presets, selectedId],
  );

  const currentIntensity = intensity ?? selectedPreset?.intensity ?? 1;

  return (
    <View style={styles.container}>
      <GestureDetector gesture={longPress}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
          style={styles.scroll}
          onLayout={handleScrollLayout}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          accessibilityLabel="Filter presets"
          accessibilityHint="Swipe horizontally to browse filters. Press and hold to compare with original."
        >
          {presets.map((preset, index) => {
            const isSelected = preset.id === selectedId;
            return (
              <View key={preset.id} onLayout={handleThumbLayout(index)}>
                <EffectPreviewThumb
                  sourceUri={sourceUri}
                  preset={preset}
                  selected={isSelected}
                  onPress={() => handleSelect(preset.id)}
                  intensity={currentIntensity}
                  showOriginal={showOriginal}
                />
              </View>
            );
          })}
        </ScrollView>
      </GestureDetector>

      {/* ── Intensity slider (below rail, only when a preset is selected) ── */}
      {selectedPreset && selectedPreset.id !== 'original' && onIntensityChange && (
        <IntensitySlider
          value={currentIntensity}
          trackColor={colors.border}
          fillColor={colors.brand}
          thumbColor={colors.textPrimary}
          labelColor={colors.textMuted}
          onChange={onIntensityChange}
          onCommit={onIntensityCommit ?? (() => {})}
          reducedMotion={reducedMotion}
          haptic={haptic}
        />
      )}

      {/* ── Before/after hint ──────────────────────────────────────────── */}
      {selectedPreset && selectedPreset.id !== 'original' && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {showOriginal ? 'Showing original' : 'Hold to compare original'}
        </Text>
      )}
    </View>
  );
}

// ── Intensity slider ────────────────────────────────────────────────────

interface IntensitySliderProps {
  value: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  labelColor: string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  reducedMotion: boolean;
  haptic: ReturnType<typeof useHaptic>;
}

function IntensitySlider({
  value,
  trackColor,
  fillColor,
  thumbColor,
  labelColor,
  onChange,
  onCommit,
  reducedMotion,
  haptic,
}: IntensitySliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbPosition = useSharedValue(value * trackWidth);
  const isDragging = useSharedValue(false);

  // Sync shared value when prop changes externally.
  React.useEffect(() => {
    if (!isDragging.value) {
      thumbPosition.value = reducedMotion
        ? value * trackWidth
        : withTiming(value * trackWidth, {
            duration: 120,
            easing: Easing.out(Easing.quad),
          });
    }
  }, [value, trackWidth, thumbPosition, isDragging, reducedMotion]);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    setTrackWidth(e.nativeEvent.layout.width);
    thumbPosition.value = value * e.nativeEvent.layout.width;
  }, [thumbPosition, value]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          isDragging.value = true;
        })
        .onUpdate((e) => {
          const w = trackWidth > 0 ? trackWidth : 1;
          const raw = e.absoluteX - 0; // track starts at x=0 within its wrapper
          const clamped = Math.min(w, Math.max(0, raw));
          thumbPosition.value = clamped;
          const v = Math.min(1, Math.max(0, clamped / w));
          runOnJS(onChange)(Math.round(v * 100) / 100);
        })
        .onEnd(() => {
          isDragging.value = false;
          const w = trackWidth > 0 ? trackWidth : 1;
          const v = Math.min(1, Math.max(0, thumbPosition.value / w));
          runOnJS(onCommit)(Math.round(v * 100) / 100);
          runOnJS(haptic.light)();
        }),
    [trackWidth, thumbPosition, isDragging, onChange, onCommit, haptic],
  );

  // Tap to jump
  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        const w = trackWidth > 0 ? trackWidth : 1;
        const clamped = Math.min(w, Math.max(0, e.x));
        thumbPosition.value = reducedMotion
          ? clamped
          : withTiming(clamped, { duration: 120 });
        const v = Math.min(1, Math.max(0, clamped / w));
        runOnJS(onChange)(Math.round(v * 100) / 100);
        runOnJS(onCommit)(Math.round(v * 100) / 100);
        runOnJS(haptic.light)();
      }),
    [trackWidth, thumbPosition, reducedMotion, onChange, onCommit, haptic],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPosition.value - 8 }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: thumbPosition.value,
  }));

  const displayValue = Math.round(value * 100);

  return (
    <View style={styles.sliderWrap}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: labelColor, fontFamily: FontFamily.regular }]}>
          Intensity
        </Text>
        <Text style={[styles.sliderValue, { color: labelColor, fontFamily: FontFamily.medium }]}>
          {displayValue}
        </Text>
      </View>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <Animated.View
          style={styles.trackWrap}
          onLayout={handleLayout}
          accessibilityRole="adjustable"
          accessibilityLabel="Filter intensity"
          accessibilityValue={{ min: 0, max: 100, now: displayValue }}
          accessibilityHint="Drag to adjust filter strength. Double-tap to reset."
        >
          <View style={[styles.track, { backgroundColor: trackColor }]} />
          <Animated.View style={[styles.fill, fillStyle, { backgroundColor: fillColor }]} />
          <Animated.View
            style={[styles.thumb, thumbStyle, { backgroundColor: thumbColor }]}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  hint: {
    fontSize: FontSize.micro,
    lineHeight: FontSize.micro + 4,
    textAlign: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    fontFamily: FontFamily.regular,
  },
  sliderWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  sliderLabel: {
    fontSize: FontSize.caption,
  },
  sliderValue: {
    fontSize: FontSize.caption,
    fontVariant: ['tabular-nums'],
  },
  trackWrap: {
    height: Control.hit,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: Radius.full,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: Radius.full,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: 'rgba(0,0,0,0)',
  },
});
