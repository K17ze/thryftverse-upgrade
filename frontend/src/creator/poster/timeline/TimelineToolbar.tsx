import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Space, FontFamily } from '../../../theme/designTokens';
import { IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { PressScale } from '../../CreatorAnimations';
import { formatTimecode, type PosterClip } from './TimelineTypes';
import { getToolLabel, getSliderLabel } from '../../core/a11y/CanvasAccessibilityLabels';

// ───────────────────────────────────────────────────────────────────────────
// TimelineToolbar — context-sensitive toolbar for the selected clip.
//
// Only rendered when a clip is selected. A horizontal row of 44pt-touch tool
// buttons: Split, Speed, Volume, Replace, Duplicate, Delete. Speed and
// Volume expand into inline sliders. Delete uses the danger color and is
// visually separated from the non-destructive tools. The toolbar has a
// transparent background (no card) per the surface budget.
// ───────────────────────────────────────────────────────────────────────────

const TOOL_HIT = 44;
const SPEED_MIN = 0.25;
const SPEED_MAX = 4;

export interface TimelineToolbarProps {
  selectedClip: PosterClip | null;
  // ── Playback clock integration (optional) ──────────────────────────
  // When provided, the toolbar shows a play/pause button and current
  // timecode driven by the PlaybackClock — the single authority for
  // timeline time. The play/pause button reflects the clock's isPlaying
  // state, preventing desync between UI and playback.
  isPlaying?: boolean;
  currentTimeMs?: number;
  totalDurationMs?: number;
  onPlayPause?: () => void;
  onSeek?: (ms: number) => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReplace: () => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
}

export const TimelineToolbar = React.memo(function TimelineToolbar({
  selectedClip,
  isPlaying,
  currentTimeMs,
  totalDurationMs,
  onPlayPause,
  onSplit,
  onDuplicate,
  onDelete,
  onReplace,
  onSpeedChange,
  onVolumeChange,
}: TimelineToolbarProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  if (!selectedClip) return null;

  // Playback row is shown when the clock integration props are provided.
  const hasPlaybackIntegration = onPlayPause !== undefined && isPlaying !== undefined;

  return (
    <View style={toolbarStyles.container}>
      {/* ── Playback row (clock-driven) ─────────────────────────────── */}
      {/* Play/pause button + current timecode from the PlaybackClock. */}
      {hasPlaybackIntegration && (
        <View style={toolbarStyles.playbackRow}>
          <PressScale
            onPress={() => { haptic.light(); onPlayPause!(); }}
            style={toolbarStyles.playBtn}
            accessibilityLabel={getToolLabel(isPlaying ? 'pause' : 'play')}
            accessibilityHint="Plays or pauses the timeline"
            accessibilityRole="button"
            accessibilityState={{ selected: isPlaying }}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={IconGrammar.metadata} color={colors.textPrimary} />
          </PressScale>
          <Text style={[toolbarStyles.timecode, { color: colors.textSecondary }]}>
            {formatTimecode(currentTimeMs ?? 0)} / {formatTimecode(totalDurationMs ?? 0)}
          </Text>
        </View>
      )}

      <View style={toolbarStyles.metaRow}>
        <Text style={[toolbarStyles.metaText, { color: colors.textSecondary }]}>
          {formatTimecode(selectedClip.durationMs)}
        </Text>
        <Text style={[toolbarStyles.metaDivider, { color: colors.textMuted }]}>·</Text>
        <Text style={[toolbarStyles.metaText, { color: colors.textSecondary }]}>
          {selectedClip.speed.toFixed(2)}x
        </Text>
        <Text style={[toolbarStyles.metaDivider, { color: colors.textMuted }]}>·</Text>
        <Text style={[toolbarStyles.metaText, { color: colors.textSecondary }]}>
          {Math.round(selectedClip.volume * 100)}%
        </Text>
      </View>

      <View style={toolbarStyles.toolsRow}>
        <ToolButton icon="cut-outline" label="Split" a11yLabel={getToolLabel('split')} onPress={onSplit} haptic={haptic} />
        <ToolButton icon="copy-outline" label="Duplicate" a11yLabel={getToolLabel('duplicate')} onPress={onDuplicate} haptic={haptic} />
        <ToolButton icon="swap-horizontal-outline" label="Replace" a11yLabel={getToolLabel('replace')} onPress={onReplace} haptic={haptic} />
      </View>

      <View style={toolbarStyles.slidersColumn}>
        <SliderRow
          icon="speedometer-outline"
          label="Speed"
          value={selectedClip.speed}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={0.25}
          formatValue={(v) => `${v.toFixed(2)}x`}
          color={colors.brand}
          onChange={onSpeedChange}
          haptic={haptic}
        />
        <SliderRow
          icon="volume-medium-outline"
          label="Volume"
          value={selectedClip.volume}
          min={0}
          max={1}
          step={0.05}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          color={colors.brand}
          onChange={onVolumeChange}
          haptic={haptic}
        />
      </View>

      <View style={[toolbarStyles.divider, { backgroundColor: colors.borderSubtle }]} />

      <View style={toolbarStyles.toolsRow}>
        <ToolButton
          icon="trash-outline"
          label="Delete"
          a11yLabel={getToolLabel('delete')}
          onPress={onDelete}
          danger
          haptic={haptic}
        />
      </View>
    </View>
  );
});

// ── Tool button ───────────────────────────────────────────────────────
interface ToolButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  a11yLabel?: string;
  onPress: () => void;
  danger?: boolean;
  haptic: ReturnType<typeof useHaptic>;
}

const ToolButton = React.memo(function ToolButton({
  icon,
  label,
  a11yLabel,
  onPress,
  danger,
  haptic,
}: ToolButtonProps) {
  const { colors } = useAppTheme();
  const tint = danger ? colors.danger : colors.textPrimary;
  return (
    <PressScale
      onPress={() => { danger ? haptic.heavy() : haptic.light(); onPress(); }}
      style={toolbarStyles.tool}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityRole="button"
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Ionicons name={icon} size={IconGrammar.standard} color={tint} />
      <Text style={[toolbarStyles.toolLabel, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
});

// ── Slider row (speed / volume) ───────────────────────────────────────
interface SliderRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
  color: string;
  onChange: (v: number) => void;
  haptic: ReturnType<typeof useHaptic>;
}

const SliderRow = React.memo(function SliderRow({
  icon,
  label,
  value,
  min,
  max,
  step,
  formatValue,
  color,
  onChange,
  haptic,
}: SliderRowProps) {
  const { colors } = useAppTheme();
  const widthSV = useSharedValue(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  const range = max - min;
  const ratio = range > 0 ? (value - min) / range : 0;
  const pct = Math.round(ratio * 100);

  const panGesture = React.useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const r = Math.max(0, Math.min(1, e.x / w));
        const v = min + Math.round(r * range / step) * step;
        runOnJS(haptic.selection)();
        runOnJS(onChange)(Math.max(min, Math.min(max, v)));
      })
      .onChange((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const r = Math.max(0, Math.min(1, e.x / w));
        const v = min + Math.round(r * range / step) * step;
        runOnJS(onChange)(Math.max(min, Math.min(max, v)));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max, range, step, onChange, haptic]
  );

  return (
    <View style={toolbarStyles.sliderRow}>
      <Ionicons name={icon} size={IconGrammar.metadata} color={colors.textSecondary} />
      <Text style={[toolbarStyles.sliderLabel, { color: colors.textSecondary }]}>{label}</Text>
      <GestureDetector gesture={panGesture}>
        <View
          style={toolbarStyles.sliderTrack}
          onLayout={handleLayout}
          accessibilityLabel={getSliderLabel(label, value, min, max, formatValue)}
          accessibilityRole="adjustable"
        >
          <View style={[toolbarStyles.sliderTrackBg, { backgroundColor: colors.border }]} />
          <View style={[toolbarStyles.sliderFill, { width: `${pct}%`, backgroundColor: color }]} />
          <View style={[toolbarStyles.sliderThumb, { left: `${pct}%`, backgroundColor: color }]} />
        </View>
      </GestureDetector>
      <Text style={[toolbarStyles.sliderValue, { color: colors.textPrimary }]}>
        {formatValue(value)}
      </Text>
    </View>
  );
});

const toolbarStyles = StyleSheet.create({
  container: {
    // Transparent background — no card per surface budget.
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    gap: Space.xs,
  },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xxs,
  },
  playBtn: {
    width: TOOL_HIT,
    height: TOOL_HIT,
    borderRadius: RadiusRoleValue.compactControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timecode: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xxs,
  },
  metaText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  metaDivider: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TOOL_HIT,
  },
  tool: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    minHeight: TOOL_HIT,
    paddingHorizontal: Space.xs,
  },
  toolLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    marginTop: 2,
  },
  slidersColumn: {
    gap: Space.xs,
    paddingVertical: Space.xxs,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TOOL_HIT,
  },
  sliderLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    minWidth: 48,
  },
  sliderTrack: {
    flex: 1,
    height: TOOL_HIT,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: RadiusRoleValue.compactControl,
  },
  sliderFill: {
    height: 4,
    borderRadius: RadiusRoleValue.compactControl,
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: RadiusRoleValue.pillAvatar,
    marginLeft: -9,
  },
  sliderValue: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    minWidth: 52,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xxs,
  },
});
