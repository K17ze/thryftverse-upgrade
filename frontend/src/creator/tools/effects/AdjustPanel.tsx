/**
 * AdjustPanel — slider panel for fine-tuning image adjustments.
 * Uses CreatorSlider (RNGH + Reanimated) for 60fps dragging.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Space,
  FontSize,
  FontFamily,
  Control,
} from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { CreatorSlider } from '../../controls';
import { ADJUST_PARAMETERS } from './EffectPresets';
import type { AdjustNode } from './EffectTypes';

export interface AdjustPanelProps {
  /** Current adjustment values (partial — missing keys default to 0). */
  values: Partial<AdjustNode>;
  /** Live callback while dragging (no history commit). */
  onChange: (parameter: string, value: number) => void;
  /** Commit callback on slider release (one history entry). */
  onCommit?: (parameter: string, value: number) => void;
  /** Reset all adjustments to defaults. */
  onReset: () => void;
  /** Called when any slider drag state changes (Lightroom chrome-fade pattern). */
  onDragStateChange?: (dragging: boolean) => void;
}

/**
 * Render one slider row per adjustment parameter.
 */export function AdjustPanel({ values, onChange, onCommit, onReset, onDragStateChange }: AdjustPanelProps) {
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
        <Pressable
          onPress={handleReset}
          hitSlop={Space.sm}
          accessibilityRole="button"
          accessibilityLabel="Reset adjustments"
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
        const raw = values?.[param.id as keyof Omit<AdjustNode, 'type'>];
        const value = raw ?? param.default;
        const isBidirectional = param.min < 0 && param.max > 0;
        return (
          <AdjustSliderRow
            key={param.id}
            label={param.name}
            min={param.min}
            max={param.max}
            value={value}
            labelColor={colors.textSecondary}
            valueColor={colors.textMuted}
            onChange={(v) => onChange(param.id, v)}
            onCommit={onCommit ? (v) => onCommit(param.id, v) : undefined}
            onDragStateChange={onDragStateChange}
            isBidirectional={isBidirectional}
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
  labelColor: string;
  valueColor: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
  isBidirectional: boolean;
}

function AdjustSliderRow({
  label,
  min,
  max,
  value,
  labelColor,
  valueColor,
  onChange,
  onCommit,
  onDragStateChange,
  isBidirectional,
}: AdjustSliderRowProps) {
  const clamped = Math.min(max, Math.max(min, value));
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
      <CreatorSlider
        value={value}
        min={min}
        max={max}
        step={0.001}
        neutral={isBidirectional ? 0 : min}
        onValueChange={onChange}
        onCommit={onCommit}
        onDragStateChange={onDragStateChange}
        accessibilityLabel={label}
        hapticAtNeutral={isBidirectional}
        showNeutralTick={isBidirectional}
      />
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
    justifyContent: 'flex-end',
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.xs,
  },
  resetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
  },
  resetLabel: {
    fontSize: FontSize.caption + 1,
  },
  row: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd / 2,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  rowLabel: {
    fontSize: FontSize.caption + 1,
  },
  rowValue: {
    fontSize: FontSize.caption,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'right',
  },
});
