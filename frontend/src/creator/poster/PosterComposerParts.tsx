import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';

// ───────────────────────────────────────────────────────────────────────────
// Poster Composer Parts — sub-components extracted from PosterComposerScreen
// to keep the main composer file focused on layout and state.
//
// These are the frame-native equivalents of the Look composer's context
// toolbar / bottom action / overflow / opacity parts, tuned for the
// full-bleed Story chrome (white-on-glass, not themed surface).
// ───────────────────────────────────────────────────────────────────────────

// ── Context toolbar button ───────────────────────────────────────────
// Flat, transparent 44pt target with a 22pt glyph. Label below the icon.
// Danger uses the danger red. Used in the selection context toolbar.
export const FrameTool = React.memo(function FrameTool({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const haptic = useHaptic();
  return (
    <PressScale
      onPress={() => { haptic.light(); onPress(); }}
      style={partStyles.contextTool}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? '#ff6b6b' : '#fff'}
      />
      <Text
        style={[partStyles.contextToolLabel, { color: danger ? '#ff6b6b' : 'rgba(255,255,255,0.7)' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressScale>
  );
});

// ── Bottom rail tool button ──────────────────────────────────────────
// Flat, transparent 44pt target with a 24pt glyph and label below.
// Used in the default (no selection) bottom tool rail.
export const RailTool = React.memo(function RailTool({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      style={partStyles.railTool}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <Ionicons name={icon} size={24} color="#fff" />
      <Text style={partStyles.railToolLabel} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
});

// ── Overflow menu item ───────────────────────────────────────────────
// White-on-dark row for the More menu (Layers, Preview, Safe Zone, etc).
export const OverflowItem = React.memo(function OverflowItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      style={partStyles.overflowItem}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
    >
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={partStyles.overflowItemText}>{label}</Text>
    </PressScale>
  );
});

// ── Opacity bar — drag-based slider for layer opacity ────────────────
// Lives in the context toolbar (not permanent chrome) per spec 09.
// Worklet-based pan for 60fps updates without setState during drag.
export const OpacityBar = React.memo(function OpacityBar({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  const widthSV = useSharedValue(0);
  const haptic = useHaptic();

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const snapped = Math.round(ratio * 20) / 20;
        runOnJS(haptic.selection)();
        runOnJS(onChange)(snapped);
      })
      .onChange((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const snapped = Math.round(ratio * 20) / 20;
        runOnJS(haptic.selection)();
        runOnJS(onChange)(snapped);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(onCommit)(value);
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(onCommit)(value);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onChange, onCommit]
  );

  const pct = Math.round(value * 100);

  return (
    <View style={partStyles.opacityBar}>
      <Ionicons name="contrast-outline" size={16} color="rgba(255,255,255,0.7)" />
      <GestureDetector gesture={panGesture}>
        <View style={partStyles.opacitySliderTrack} onLayout={handleLayout}>
          <View style={partStyles.opacitySliderTrackBg} />
          <View style={[partStyles.opacitySliderFill, { width: `${pct}%` }]} />
          <View style={[partStyles.opacitySliderThumb, { left: `${pct}%` }]} />
        </View>
      </GestureDetector>
      <Text style={partStyles.opacityLabel}>{pct}%</Text>
    </View>
  );
});

const partStyles = StyleSheet.create({
  // ── Context toolbar ──
  contextTool: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: Space.xs,
  },
  contextToolLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    marginTop: 2,
  },
  // ── Bottom rail tool ──
  railTool: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    paddingHorizontal: Space.xs,
  },
  railToolLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  // ── Overflow menu item ──
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  overflowItemText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    color: '#fff',
  },
  // ── Opacity bar ──
  opacityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  opacitySliderTrack: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  opacitySliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: RadiusRoleValue.compactControl,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  opacitySliderFill: {
    height: 4,
    borderRadius: RadiusRoleValue.compactControl,
    backgroundColor: '#C9A46A',
  },
  opacitySliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: '#fff',
    marginLeft: -9,
  },
  opacityLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    color: 'rgba(255,255,255,0.8)',
    minWidth: 36,
    textAlign: 'right',
  },
});
