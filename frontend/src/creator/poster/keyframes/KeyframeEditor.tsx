/**
 * KeyframeEditor — panel for editing keyframes on a single layer.
 *
 * Layout:
 *   - Property selector (position / scale / rotation / opacity) as a row of
 *     segmented buttons.
 *   - Timeline strip: a horizontal track representing
 *     `totalDurationMs`. Keyframes for the selected property render as
 *     diamonds positioned by `timeMs`. Tapping an empty point on the track
 *     adds a keyframe at that time; tapping a diamond selects it; dragging a
 *     diamond moves it in time.
 *   - Inspector: when a keyframe is selected, shows value + easing controls
 *     and a delete button.
 *
 * Touch targets are ≥44pt (Control.hit). Haptics: `selection` on property
 * switch and keyframe select, `medium` on delete (AGENTS.md §13, §27.9).
 *
 * Design references:
 *   - AGENTS.md §11: every control performs a real mutation via callbacks.
 *   - designTokens Stroke.emphasis (2pt) for the selected diamond border.
 *   - CreatorAnimations motion band for the diamond press feedback.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { Keyframe, KeyframeProperty, KeyframeEasing } from './KeyframeTypes';
import {
  KEYFRAME_PROPERTY_LABELS,
  KEYFRAME_EASING_LABELS,
  DEFAULT_KEYFRAME_EASING } from './KeyframeTypes';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  Space,
  Radius,
  Stroke,
  Control,
  FontFamily,
  LetterSpacing } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { IconGrammar } from '../../../theme/designTokens';
import { formatTimecode } from '../timeline/TimelineTypes';

export interface KeyframeEditorProps {
  layerId: string;
  totalDurationMs: number;
  keyframes: Keyframe[];
  layerDefaults: { x: number; rotation: number };
  onAddKeyframe: (kf: Omit<Keyframe, 'id'>) => void;
  onUpdateKeyframe: (id: string, updates: Partial<Keyframe>) => void;
  onRemoveKeyframe: (id: string) => void;
}

const PROPERTIES: KeyframeProperty[] = ['position', 'scale', 'rotation', 'opacity'];
const EASINGS: KeyframeEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring'];
const TIMELINE_HEIGHT = 44;
const DIAMOND_SIZE = 14;

export function KeyframeEditor({
  layerId,
  totalDurationMs,
  keyframes,
  layerDefaults,
  onAddKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe }: KeyframeEditorProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [activeProperty, setActiveProperty] = useState<KeyframeProperty>('position');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthSV = useSharedValue(0);
  const dragXSV = useSharedValue(0);
  // Absolute X of the diamond when the drag starts — used to compute the
  // final timeMs on gesture end.
  const dragStartXSV = useSharedValue(0);

  // Keyframes for the active property, sorted by time.
  const visibleKeyframes = useMemo(
    () =>
      keyframes
        .filter((k) => k.layerId === layerId && k.property === activeProperty)
        .sort((a, b) => a.timeMs - b.timeMs),
    [keyframes, layerId, activeProperty],
  );

  const selected = useMemo(
    () => keyframes.find((k) => k.id === selectedId) ?? null,
    [keyframes, selectedId],
  );

  const timeToX = useCallback(
    (timeMs: number) => {
      if (totalDurationMs <= 0 || trackWidth <= 0) return 0;
      return Math.min(Math.max((timeMs / totalDurationMs) * trackWidth, 0), trackWidth);
    },
    [totalDurationMs, trackWidth],
  );

  const xToTime = useCallback(
    (x: number) => {
      if (totalDurationMs <= 0 || trackWidth <= 0) return 0;
      const ratio = Math.min(Math.max(x / trackWidth, 0), 1);
      return Math.round(ratio * totalDurationMs);
    },
    [totalDurationMs, trackWidth],
  );

  const handleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
    trackWidthSV.value = e.nativeEvent.layout.width;
  }, [trackWidthSV]);

  const handleTrackPress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      const timeMs = xToTime(e.nativeEvent.locationX);
      haptic.selection();
      const value =
        activeProperty === 'position' ? layerDefaults.x :
        activeProperty === 'rotation' ? layerDefaults.rotation :
        1;
      onAddKeyframe({
        layerId,
        property: activeProperty,
        timeMs,
        value,
        easing: DEFAULT_KEYFRAME_EASING });
    },
    [xToTime, haptic, onAddKeyframe, layerId, activeProperty, layerDefaults],
  );

  const selectProperty = useCallback(
    (prop: KeyframeProperty) => {
      if (prop === activeProperty) return;
      haptic.selection();
      setActiveProperty(prop);
      setSelectedId(null);
    },
    [activeProperty, haptic],
  );

  const selectKeyframe = useCallback(
    (id: string) => {
      haptic.selection();
      setSelectedId(id);
    },
    [haptic],
  );

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    haptic.medium();
    onRemoveKeyframe(selectedId);
    setSelectedId(null);
  }, [selectedId, onRemoveKeyframe, haptic]);

  const makeKeyframeGesture = useCallback(
    (kfId: string, startTimeMs: number) => {
      return Gesture.Pan()
        .onBegin(() => {
          'worklet';
          const w = trackWidthSV.value;
          if (w <= 0 || totalDurationMs <= 0) {
            dragStartXSV.value = 0;
          } else {
            dragStartXSV.value = Math.min(Math.max((startTimeMs / totalDurationMs) * w, 0), w);
          }
          dragXSV.value = 0;
          runOnJS(setSelectedId)(kfId);
        })
        .onChange((e) => {
          'worklet';
          const w = trackWidthSV.value;
          if (w <= 0 || totalDurationMs <= 0) return;
          // dragXSV accumulates the pixel delta from the start position.
          // Clamped so the diamond stays within the track bounds.
          const newOffset = dragXSV.value + e.changeX;
          const absoluteX = dragStartXSV.value + newOffset;
          const clampedAbsolute = Math.min(Math.max(absoluteX, 0), w);
          dragXSV.value = clampedAbsolute - dragStartXSV.value;
        })
        .onEnd(() => {
          'worklet';
          const w = trackWidthSV.value;
          if (w > 0 && totalDurationMs > 0) {
            const absoluteX = dragStartXSV.value + dragXSV.value;
            const ratio = Math.min(Math.max(absoluteX / w, 0), 1);
            const timeMs = Math.round(ratio * totalDurationMs);
            // Commit the final time once — no per-frame JS bridge crossing.
            runOnJS(onUpdateKeyframe)(kfId, { timeMs });
          }
          dragXSV.value = 0;
          runOnJS(haptic.selection)();
        });
    },
    [haptic, onUpdateKeyframe, totalDurationMs, trackWidthSV, dragXSV, dragStartXSV],
  );

  // Animated style for the dragging diamond — reads dragXSV on the UI
  // thread so the diamond tracks the finger 1:1 without React re-renders.
  const diamondAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragXSV.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Property selector — filled pills */}
      <View style={styles.propertyRow} accessibilityRole="tablist">
        {PROPERTIES.map((prop) => {
          const active = prop === activeProperty;
          return (
            <Pressable
              key={prop}
              onPress={() => selectProperty(prop)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${KEYFRAME_PROPERTY_LABELS[prop]} property`}
              style={[
                styles.propertyButton,
                { backgroundColor: active ? colors.surfaceElevated : 'transparent' },
              ]}
            >
              <Text
                style={[
                  styles.propertyLabel,
                  {
                    color: active ? colors.brand : colors.textSecondary },
                ]}
              >
                {KEYFRAME_PROPERTY_LABELS[prop]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Timeline strip — flat with hairline top/bottom separators */}
      <View
        style={[styles.timelineWrap, { borderTopColor: colors.borderSubtle, borderBottomColor: colors.borderSubtle }]}
      >
        <Pressable
          onPress={handleTrackPress}
          onLayout={handleTrackLayout}
          style={styles.timelineTrack}
          accessibilityRole="button"
          accessibilityLabel="Keyframe timeline"
          accessibilityHint="Tap to add a keyframe at this time"
        >
          {/* Center line */}
          <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
          {visibleKeyframes.map((kf) => {
            const isSelected = kf.id === selectedId;
            const left = timeToX(kf.timeMs) - DIAMOND_SIZE / 2;
            if (isSelected) {
              return (
                <GestureDetector key={kf.id} gesture={makeKeyframeGesture(kf.id, kf.timeMs)}>
                  <Reanimated.View
                    onLayout={() => {}}
                    accessibilityRole="button"
                    accessibilityLabel={`Keyframe at ${kf.timeMs} milliseconds, value ${kf.value}`}
                    style={[
                      styles.diamond,
                      diamondAnimStyle,
                      {
                        left,
                        backgroundColor: colors.brand,
                        borderColor: colors.brand },
                    ]}
                  />
                </GestureDetector>
              );
            }
            return (
              <Pressable
                key={kf.id}
                onPress={() => selectKeyframe(kf.id)}
                hitSlop={Control.hit / 2 - DIAMOND_SIZE / 2}
                accessibilityRole="button"
                accessibilityLabel={`Keyframe at ${kf.timeMs} milliseconds, value ${kf.value}`}
                style={[
                  styles.diamond,
                  {
                    left,
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.textMuted },
                ]}
              />
            );
          })}
        </Pressable>
      </View>

      {/* Inspector for the selected keyframe — flat with hairline separator */}
      {selected && (
        <View
          style={[styles.inspector, { borderTopColor: colors.borderSubtle }]}
        >
          <View style={styles.inspectorRow}>
            <Text style={[styles.inspectorLabel, { color: colors.textSecondary }]}>Value</Text>
            <View style={styles.valueControls}>
              <Pressable
                onPress={() =>
                  onUpdateKeyframe(selected.id, { value: roundToStep(selected.value - stepFor(activeProperty), activeProperty) })
                }
                style={styles.stepButton}
                accessibilityRole="button"
                accessibilityLabel="Decrease value"
                hitSlop={Control.hit / 2}
              >
                <Ionicons name="remove" size={IconGrammar.metadata} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.valueText, { color: colors.textPrimary }]}>
                {formatValue(selected.value, activeProperty)}
              </Text>
              <Pressable
                onPress={() =>
                  onUpdateKeyframe(selected.id, { value: roundToStep(selected.value + stepFor(activeProperty), activeProperty) })
                }
                style={styles.stepButton}
                accessibilityRole="button"
                accessibilityLabel="Increase value"
                hitSlop={Control.hit / 2}
              >
                <Ionicons name="add" size={IconGrammar.metadata} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.inspectorRow}>
            <Text style={[styles.inspectorLabel, { color: colors.textSecondary }]}>Easing</Text>
            <View style={styles.easingRow} accessibilityRole="radiogroup">
              {EASINGS.map((ease) => {
                const active = selected.easing === ease;
                return (
                  <Pressable
                    key={ease}
                    onPress={() => {
                      haptic.selection();
                      onUpdateKeyframe(selected.id, { easing: ease });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={KEYFRAME_EASING_LABELS[ease]}
                    style={[
                      styles.easingButton,
                      { backgroundColor: active ? colors.surfaceElevated : 'transparent' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.easingLabel,
                        {
                          color: active ? colors.brand : colors.textSecondary },
                      ]}
                    >
                      {KEYFRAME_EASING_LABELS[ease]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.inspectorRow}>
            <Text style={[styles.inspectorLabel, { color: colors.textSecondary }]}>Time</Text>
            <Text style={[styles.valueText, { color: colors.textPrimary }]}>
              {formatTimecode(selected.timeMs)}
            </Text>
          </View>

          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete keyframe"
            style={styles.deleteButton}
            hitSlop={Control.hit / 2}
          >
            <Ionicons name="trash-outline" size={IconGrammar.metadata} color={colors.danger} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function stepFor(property: KeyframeProperty): number {
  switch (property) {
    case 'opacity':
      return 0.05;
    case 'scale':
      return 0.05;
    case 'rotation':
      return 1;
    case 'position':
    default:
      return 1;
  }
}

function roundToStep(value: number, property: KeyframeProperty): number {
  const step = stepFor(property);
  const rounded = Math.round(value / step) * step;
  if (property === 'opacity') return Math.min(Math.max(rounded, 0), 1);
  return rounded;
}

function formatValue(value: number, property: KeyframeProperty): string {
  switch (property) {
    case 'opacity':
      return value.toFixed(2);
    case 'scale':
      return value.toFixed(2);
    case 'rotation':
      return `${Math.round(value)}°`;
    case 'position':
    default:
      // Position is normalized (0–1) in the poster composer; show as a
      // percentage so the readout is meaningful rather than a raw fraction.
      if (value >= 0 && value <= 1) return `${Math.round(value * 100)}%`;
      return `${Math.round(value)}px`;
  }
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm,
    gap: Space.sm },
  propertyRow: {
    flexDirection: 'row',
    gap: Space.xs,
    flexWrap: 'wrap' },
  propertyButton: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center' },
  propertyLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    letterSpacing: LetterSpacing.normal },
  timelineWrap: {
    borderTopWidth: Stroke.hairline,
    borderBottomWidth: Stroke.hairline,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xs },
  timelineTrack: {
    height: TIMELINE_HEIGHT,
    justifyContent: 'center',
    position: 'relative' },
  timelineLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: Stroke.hairline },
  diamond: {
    position: 'absolute',
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    transform: [{ rotate: '45deg' }],
    borderWidth: Stroke.emphasis,
    borderRadius: Radius.none },
  inspector: {
    borderTopWidth: Stroke.hairline,
    paddingTop: Space.sm,
    gap: Space.sm },
  inspectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit },
  inspectorLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    letterSpacing: LetterSpacing.normal },
  valueControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  stepButton: {
    width: Control.chrome,
    height: Control.chrome,
    alignItems: 'center',
    justifyContent: 'center' },
  valueText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    letterSpacing: LetterSpacing.normal,
    minWidth: 56,
    textAlign: 'center' },
  easingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    flex: 1,
    justifyContent: 'flex-end' },
  easingButton: {
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center' },
  easingLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    letterSpacing: LetterSpacing.normal },
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center' } });
