import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Space, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import type { OverlayLayer, TimeRange } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// OverlayTrack — a track for timed overlays (text, stickers, products,
// music, drawings).
//
// Each overlay renders as a colored bar spanning its time range across the
// track width. Bars show the overlay label and are draggable to move the
// overlay in time. Color is derived from the overlay type:
//   text=brand, sticker=warning, product=success,
//   music=antiqueGold (secondary accent), drawing=danger.
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

function overlayColor(
  type: OverlayLayer['type'],
  colors: ReturnType<typeof useAppTheme>['colors']
): string {
  switch (type) {
    case 'text': return colors.brand;
    case 'sticker': return colors.warning;
    case 'product': return colors.success;
    case 'music': return colors.antiqueGold;
    case 'drawing': return colors.danger;
    default: return colors.brand;
  }
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
        const color = ov.color || overlayColor(ov.type, colors);
        const isSelected = ov.id === selectedId;
        return (
          <OverlayBar
            key={ov.id}
            overlay={ov}
            left={left}
            width={width}
            color={color}
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
  color: string;
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
  color,
  isSelected,
  trackWidth,
  totalDurationMs,
  onPress,
  onMove,
}: OverlayBarProps) {
  const haptic = useHaptic();
  const startMsSV = useSharedValue(overlay.timeRange.startMs);
  const durationMs = overlay.timeRange.endMs - overlay.timeRange.startMs;

  React.useEffect(() => {
    startMsSV.value = overlay.timeRange.startMs;
  }, [overlay.timeRange.startMs, startMsSV]);

  const pxPerMs = trackWidth > 0 && totalDurationMs > 0 ? trackWidth / totalDurationMs : 0;

  const moveGesture = React.useMemo(() =>
    Gesture.Pan()
      .activateAfterLongPress(120)
      .onChange((e) => {
        'worklet';
        if (pxPerMs <= 0) return;
        const deltaMs = e.changeX / pxPerMs;
        let newStart = startMsSV.value + deltaMs;
        newStart = Math.max(0, Math.min(totalDurationMs - durationMs, newStart));
        startMsSV.value = newStart;
        runOnJS(onMove)(overlay.id, { startMs: newStart, endMs: newStart + durationMs });
      })
      .onEnd(() => {
        'worklet';
        runOnJS(haptic.light)();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxPerMs, totalDurationMs, durationMs, overlay.id, onMove, haptic]
  );

  return (
    <GestureDetector gesture={moveGesture}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={`${overlay.type} overlay: ${overlay.label}`}
        accessibilityRole="button"
        style={[
          overlayTrackStyles.bar,
          {
            left,
            width,
            backgroundColor: `${color}33` /* TODO: replace with subtle token once color is resolved */, // 20% fill
            borderColor: color,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
      >
        <View style={[overlayTrackStyles.barAccent, { backgroundColor: color }]} />
        <Text
          style={[overlayTrackStyles.barLabel, { color: '#fff' }]}
          numberOfLines={1}
        >
          {overlay.label}
        </Text>
      </Pressable>
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
