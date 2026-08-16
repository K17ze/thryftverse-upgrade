/**
 * AdjustPanel — a panel of sliders for fine-tuning image adjustments.
 *
 * One slider per parameter from ADJUST_PARAMETERS. Each row shows the
 * parameter name (left), the current value (right), and a full-width
 * slider. A reset button sits at the top. The panel is transparent — no
 * card surface — so it composes cleanly into any host sheet.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets for the reset button.
 *
 * The slider is a self-contained PanResponder-based control so this module
 * introduces no new dependencies (the codebase has no slider library).
 */
import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
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
import { ADJUST_PARAMETERS } from './EffectPresets';
import type { EffectPreset } from './EffectTypes';

export interface AdjustPanelProps {
  values: Partial<EffectPreset['adjustments']>;
  onChange: (parameter: string, value: number) => void;
  onReset: () => void;
}

/**
 * Render one slider row per adjustment parameter.
 */
export function AdjustPanel({ values, onChange, onReset }: AdjustPanelProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleReset = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onReset();
  }, [haptic, onReset, reducedMotion]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text
          style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: FontFamily.semibold }]}
        >
          Adjust
        </Text>
        <Pressable
          onPress={handleReset}
          hitSlop={Space.sm}
          accessibilityRole="button"
          accessibilityLabel="Reset all adjustments"
          style={({ pressed }) => [
            styles.resetButton,
            { opacity: pressed ? 0.6 : 1, minHeight: Control.hit, minWidth: Control.hit },
          ]}
        >
          <Text
            style={[styles.resetLabel, { color: colors.textSecondary, fontFamily: FontFamily.medium }]}
          >
            Reset
          </Text>
        </Pressable>
      </View>

      {ADJUST_PARAMETERS.map((param) => {
        const raw = values?.[param.id as keyof EffectPreset['adjustments']];
        const value = raw ?? param.default;
        return (
          <AdjustSliderRow
            key={param.id}
            label={param.name}
            min={param.min}
            max={param.max}
            value={value}
            trackColor={colors.border}
            fillColor={colors.brand}
            thumbColor={colors.textPrimary}
            labelColor={colors.textPrimary}
            valueColor={colors.textMuted}
            onChange={(v) => onChange(param.id, v)}
          />
        );
      })}
    </View>
  );
}

// ── Internal slider row ────────────────────────────────────────────────

interface AdjustSliderRowProps {
  label: string;
  min: number;
  max: number;
  value: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  labelColor: string;
  valueColor: string;
  onChange: (value: number) => void;
}

function AdjustSliderRow({
  label,
  min,
  max,
  value,
  trackColor,
  fillColor,
  thumbColor,
  labelColor,
  valueColor,
  onChange,
}: AdjustSliderRowProps) {
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = React.useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const range = max - min;
  const clamped = Math.min(max, Math.max(min, value));
  const ratio = range === 0 ? 0 : (clamped - min) / range;
  const trackLayoutWidth = trackWidth > 0 ? trackWidth : 1;
  const thumbPosition = ratio * trackLayoutWidth;

  const valueToPosition = useCallback(
    (x: number) => {
      const r = Math.min(1, Math.max(0, x / trackLayoutWidth));
      return min + r * range;
    },
    [trackLayoutWidth, min, range],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_e: GestureResponderEvent) => {
          // Press in-place handled by onPanResponderMove using absolute 0.
        },
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          // g.moveX is absolute screen X; we need position relative to track.
          // Approximate using dx from grant point combined with last ratio.
          const next = valueToPosition(thumbPosition + g.dx);
          onChange(Math.round(next * 1000) / 1000);
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thumbPosition, valueToPosition, onChange],
  );

  const displayValue = formatValue(clamped);

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={[styles.rowLabel, { color: labelColor, fontFamily: FontFamily.regular }]}>
          {label}
        </Text>
        <Text style={[styles.rowValue, { color: valueColor, fontFamily: FontFamily.medium }]}>
          {displayValue}
        </Text>
      </View>
      <View
        style={styles.trackWrap}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.track, { backgroundColor: trackColor }]} />
        <View
          style={[
            styles.fill,
            {
              width: thumbPosition,
              backgroundColor: fillColor,
            },
          ]}
        />
        <View
          style={[
            styles.thumb,
            {
              left: thumbPosition,
              backgroundColor: thumbColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

function formatValue(v: number): string {
  if (v === 0) return '0';
  const rounded = Math.round(v * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  headerTitle: {
    fontSize: FontSize.body,
  },
  resetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
  },
  resetLabel: {
    fontSize: FontSize.caption,
  },
  row: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  rowLabel: {
    fontSize: FontSize.caption,
  },
  rowValue: {
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
    marginLeft: -8,
    borderWidth: Stroke.standard,
    borderColor: 'rgba(0,0,0,0)',
  },
});
