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
  LayoutChangeEvent,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Keyframe, KeyframeProperty, KeyframeEasing } from './KeyframeTypes';
import {
  KEYFRAME_PROPERTY_LABELS,
  KEYFRAME_EASING_LABELS,
  DEFAULT_KEYFRAME_EASING,
} from './KeyframeTypes';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  Space,
  Radius,
  Stroke,
  Control,
  FontFamily,
  FontSize,
  LetterSpacing,
  Type,
} from '../../../theme/designTokens';

export interface KeyframeEditorProps {
  layerId: string;
  totalDurationMs: number;
  keyframes: Keyframe[];
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
  onAddKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
}: KeyframeEditorProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [activeProperty, setActiveProperty] = useState<KeyframeProperty>('position');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

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
  }, []);

  const handleTrackPress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      const timeMs = xToTime(e.nativeEvent.locationX);
      haptic.selection();
      onAddKeyframe({
        layerId,
        property: activeProperty,
        timeMs,
        value: activeProperty === 'opacity' ? 1 : activeProperty === 'scale' ? 1 : 0,
        easing: DEFAULT_KEYFRAME_EASING,
      });
    },
    [xToTime, haptic, onAddKeyframe, layerId, activeProperty],
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

  // Pan responder for dragging a selected diamond along the timeline.
  const dragPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => selectedId !== null,
        onPanResponderMove: (_e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          if (!selectedId || trackWidth <= 0) return;
          const timeMs = xToTime(gestureState.moveX);
          onUpdateKeyframe(selectedId, { timeMs });
        },
        onPanResponderRelease: () => {
          haptic.selection();
        },
      }),
    [selectedId, trackWidth, xToTime, onUpdateKeyframe, haptic],
  );

  return (
    <View style={styles.container}>
      {/* Property selector — underline tabs */}
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
              style={styles.propertyButton}
            >
              <Text
                style={[
                  styles.propertyLabel,
                  {
                    color: active ? colors.brand : colors.textSecondary,
                    textDecorationLine: active ? 'underline' : 'none',
                  },
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
            return (
              <Pressable
                key={kf.id}
                onPress={() => selectKeyframe(kf.id)}
                {...(isSelected ? dragPanResponder.panHandlers : undefined)}
                hitSlop={Control.hit / 2 - DIAMOND_SIZE / 2}
                accessibilityRole="button"
                accessibilityLabel={`Keyframe at ${kf.timeMs} milliseconds, value ${kf.value}`}
                style={[
                  styles.diamond,
                  {
                    left,
                    backgroundColor: isSelected ? colors.brand : colors.surfaceElevated,
                    borderColor: isSelected ? colors.brand : colors.textMuted,
                  },
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
                <Ionicons name="remove" size={18} color={colors.textPrimary} />
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
                <Ionicons name="add" size={18} color={colors.textPrimary} />
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
                    style={styles.easingButton}
                  >
                    <Text
                      style={[
                        styles.easingLabel,
                        {
                          color: active ? colors.brand : colors.textSecondary,
                          textDecorationLine: active ? 'underline' : 'none',
                        },
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
              {selected.timeMs} ms
            </Text>
          </View>

          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete keyframe"
            style={[
              styles.deleteButton,
              { backgroundColor: colors.danger },
            ]}
          >
            <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
            <Text style={styles.deleteLabel}>Delete</Text>
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
      return `${Math.round(value)}px`;
  }
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  propertyRow: {
    flexDirection: 'row',
    gap: Space.xs,
    flexWrap: 'wrap',
  },
  propertyButton: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  propertyLabel: {
    fontFamily: FontFamily.medium,
    fontSize: Type.body.size,
    letterSpacing: LetterSpacing.normal,
  },
  timelineWrap: {
    borderTopWidth: Stroke.hairline,
    borderBottomWidth: Stroke.hairline,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xs,
  },
  timelineTrack: {
    height: TIMELINE_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: Stroke.hairline,
  },
  diamond: {
    position: 'absolute',
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    transform: [{ rotate: '45deg' }],
    borderWidth: Stroke.emphasis,
    borderRadius: 2,
  },
  inspector: {
    borderTopWidth: Stroke.hairline,
    paddingTop: Space.sm,
    gap: Space.sm,
  },
  inspectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
  },
  inspectorLabel: {
    fontFamily: FontFamily.medium,
    fontSize: Type.body.size,
    letterSpacing: LetterSpacing.normal,
  },
  valueControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  stepButton: {
    width: Control.chrome,
    height: Control.chrome,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyEmphasis.size,
    letterSpacing: LetterSpacing.normal,
    minWidth: 56,
    textAlign: 'center',
  },
  easingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    flex: 1,
    justifyContent: 'flex-end',
  },
  easingButton: {
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  easingLabel: {
    fontFamily: FontFamily.medium,
    fontSize: Type.body.size,
    letterSpacing: LetterSpacing.normal,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    minHeight: 50,
  },
  deleteLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: '#FFFFFF',
    letterSpacing: LetterSpacing.normal,
  },
});

// Keep ViewStyle referenced for typed style composition without unused-import
// errors at compile time.
export type KeyframeEditorViewStyle = ViewStyle;
