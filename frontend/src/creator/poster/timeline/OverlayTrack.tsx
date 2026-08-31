import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Space, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { withAlpha } from '../../../components/poster/shared/colorUtils';
import type { OverlayLayer, TimeRange } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// OverlayTrack — a track for timed overlays (text, stickers, products,
// music, drawings).
//
// Each overlay renders as a neutral bar spanning its time range across the
// track width. Bars show the overlay label and are draggable to move the
// overlay in time. All bars share one neutral track background; the
// selected overlay gets a 3pt brand accent on its left edge.
// ───────────────────────────────────────────────────────────────────────────

const TRACK_HEIGHT = 28;

export interface OverlayTrackProps {
  overlays: OverlayLayer[];
  totalDurationMs: number;
  trackWidth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, timeRange: TimeRange) => void;
}

export const OverlayTrack = React.memo(function OverlayTrack({
  overlays,
  totalDurationMs,
  trackWidth,
  selectedId,
  onSelect,
  onMove,
}: OverlayTrackProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const widthSV = useSharedValue(trackWidth);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  if (totalDurationMs <= 0 || trackWidth <= 0) {
    return <View style={[overlayTrackStyles.track, { height: TRACK_HEIGHT }]} />;
  }

  const pxPerMs = trackWidth / totalDurationMs;

  return (
    <View
      onLayout={handleLayout}
      style={[
        overlayTrackStyles.track,
        {
          height: TRACK_HEIGHT,
          backgroundColor: colors.surfaceAlt,
        },
      ]}
      accessibilityLabel="Overlay track"
    >
      {overlays.map((ov) => {
        const left = Math.max(0, ov.timeRange.startMs) * pxPerMs;
        const width = Math.max(20, (ov.timeRange.endMs - ov.timeRange.startMs) * pxPerMs);
        const isSelected = ov.id === selectedId;
        return (
          <OverlayBar
            key={ov.id}
            overlay={ov}
            left={left}
            width={width}
            isSelected={isSelected}
            trackWidth={trackWidth}
            totalDurationMs={totalDurationMs}
            onPress={() => { haptic.selection(); onSelect(ov.id); }}
            onMove={onMove}
          />
        );
      })}
    </View>
  );
});

// ── Single overlay bar with drag-to-move ──────────────────────────────
interface OverlayBarProps {
  overlay: OverlayLayer;
  left: number;
  width: number;
  isSelected: boolean;
  trackWidth: number;
  totalDurationMs: number;
  onPress: () => void;
  onMove: (id: string, timeRange: TimeRange) => void;
}

const OverlayBar = React.memo(function OverlayBar({
  overlay,
  left,
  width,
  isSelected,
  trackWidth,
  totalDurationMs,
  onPress,
  onMove,
}: OverlayBarProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const startMsSV = useSharedValue(overlay.timeRange.startMs);
  // Pixel offset accumulated during the drag — drives the animated style
  // on the UI thread so the bar tracks the finger 1:1 without crossing
  // the JS bridge.
  const dragOffsetSV = useSharedValue(0);
  const durationMs = overlay.timeRange.endMs - overlay.timeRange.startMs;

  React.useEffect(() => {
    startMsSV.value = overlay.timeRange.startMs;
    dragOffsetSV.value = 0;
  }, [overlay.timeRange.startMs, startMsSV, dragOffsetSV]);

  const pxPerMs = trackWidth > 0 && totalDurationMs > 0 ? trackWidth / totalDurationMs : 0;

  // ── Animated position (UI thread) ───────────────────────────────────
  // The bar translates by dragOffsetSV pixels during the drag. On end,
  // the offset is converted to ms, committed to the parent, and reset.
  const barAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragOffsetSV.value }],
  }));

  // Tap selects the overlay (with haptic); pan drags it immediately. Racing
  // the two gestures means a quick touch selects, while any movement starts
  // dragging right away — no long-press delay (Instagram/CapCut behaviour).
  const tapGesture = React.useMemo(() =>
    Gesture.Tap()
      .hitSlop({ top: 10, bottom: 10 })
      .onEnd(() => {
        'worklet';
        runOnJS(onPress)();
      }),
    [onPress]
  );

  const panGesture = React.useMemo(() =>
    Gesture.Pan()
      .hitSlop({ top: 10, bottom: 10 })
      .onBegin(() => {
        'worklet';
        dragOffsetSV.value = 0;
      })
      .onChange((e) => {
        'worklet';
        if (pxPerMs <= 0) return;
        const deltaMs = e.changeX / pxPerMs;
        let newStart = startMsSV.value + deltaMs;
        newStart = Math.max(0, Math.min(totalDurationMs - durationMs, newStart));
        // Accumulate only the clamped delta in pixels for 1:1 visual.
        const actualDeltaMs = newStart - startMsSV.value;
        startMsSV.value = newStart;
        dragOffsetSV.value += actualDeltaMs * pxPerMs;
      })
      .onEnd(() => {
        'worklet';
        const finalStart = startMsSV.value;
        runOnJS(onMove)(overlay.id, { startMs: finalStart, endMs: finalStart + durationMs });
        runOnJS(haptic.light)();
        dragOffsetSV.value = 0;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxPerMs, totalDurationMs, durationMs, overlay.id, onMove, haptic, startMsSV, dragOffsetSV]
  );

  const moveGesture = React.useMemo(() =>
    Gesture.Race(tapGesture, panGesture),
    [tapGesture, panGesture]
  );

  return (
    <GestureDetector gesture={moveGesture}>
      <Reanimated.View
        accessibilityLabel={`${overlay.type} overlay: ${overlay.label}`}
        accessibilityRole="button"
        style={[
          overlayTrackStyles.bar,
          barAnimStyle,
          {
            left,
            width,
            backgroundColor: withAlpha(colors.textMuted, 0.16),
            borderColor: colors.textMuted,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
      >
        {isSelected && (
          <View style={[overlayTrackStyles.barAccent, { backgroundColor: colors.brand }]} />
        )}
        <Text
          style={[overlayTrackStyles.barLabel, { color: colors.scrimTextPrimary }]}
          numberOfLines={1}
        >
          {overlay.label}
        </Text>
      </Reanimated.View>
    </GestureDetector>
  );
});

const overlayTrackStyles = StyleSheet.create({
  track: {
    position: 'relative',
    borderRadius: RadiusRoleValue.compactControl,
    overflow: 'hidden',
    paddingHorizontal: Space.xxs,
  },
  bar: {
    position: 'absolute',
    top: Space.xxs,
    bottom: Space.xxs,
    borderRadius: RadiusRoleValue.compactControl,
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    overflow: 'hidden',
  },
  barAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  barLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    paddingLeft: Space.xs,
  },
});
