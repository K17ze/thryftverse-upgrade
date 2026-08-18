/**
 * AdjustPanel — a panel of sliders for fine-tuning image adjustments.
 *
 * One slider per parameter from ADJUST_PARAMETERS. Each row shows the
 * parameter name (left), the current value (right), and a full-width
 * CreatorSlider. A reset button sits at the top. The panel is transparent —
 * no card surface — so it composes cleanly into any host sheet.
 *
 * Uses CreatorSlider (RNGH + Reanimated) for smooth 60fps slider dragging.
 * Features:
 * - drag to adjust
 * - tap to jump
 * - haptic at neutral (0)
 * - one history commit on release (onCommit)
 * - numeric label
 * - reset button per slider
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets for reset buttons.
 * Per AGENTS.md §17: spring/timing respects reduced motion.
 * Per AGENTS.md §18: accessibility role adjustable, value announced.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Space,
  FontSize,
  FontFamily,
  Radius,
  Control,
} from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { CreatorSlider, CreatorGlyph } from '../../controls';
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
}

/**
 * Render one slider row per adjustment parameter.
 */
export function AdjustPanel({ values, onChange, onCommit, onReset }: AdjustPanelProps) {
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
        <View style={styles.headerLeft}>
          <CreatorGlyph
            name="adjust"
            size={20}
            color={colors.textPrimary}
            accessibilityLabel="Adjust"
          />
          <Text
            style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: FontFamily.semibold }]}
          >
            Adjust
          </Text>
        </View>
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
        const raw = values?.[param.id as keyof Omit<AdjustNode, 'type'>];
        const value = raw ?? param.default;
        return (
          <AdjustSliderRow
            key={param.id}
            paramId={param.id}
            label={param.name}
            min={param.min}
            max={param.max}
            value={value}
            labelColor={colors.textPrimary}
            valueColor={colors.textMuted}
            resetColor={colors.textMuted}
            onChange={(v) => onChange(param.id, v)}
            onCommit={onCommit ? (v) => onCommit(param.id, v) : undefined}
          />
        );
      })}
    </View>
  );
}

// ── Internal slider row ────────────────────────────────────────────────

interface AdjustSliderRowProps {
  paramId: string;
  label: string;
  min: number;
  max: number;
  value: number;
  labelColor: string;
  valueColor: string;
  resetColor: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

function AdjustSliderRow({
  paramId,
  label,
  min,
  max,
  value,
  labelColor,
  valueColor,
  resetColor,
  onChange,
  onCommit,
}: AdjustSliderRowProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  // ── Reset per slider ─────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    haptic.light();
    onChange(0);
    if (onCommit) onCommit(0);
  }, [haptic, onChange, onCommit]);

  const clamped = Math.min(max, Math.max(min, value));
  const displayValue = formatValue(clamped);
  const isNonZero = Math.abs(clamped) > 0.001;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={[styles.rowLabel, { color: labelColor, fontFamily: FontFamily.regular }]}>
          {label}
        </Text>
        <View style={styles.rowRight}>
          {isNonZero && (
            <Pressable
              onPress={handleReset}
              hitSlop={Space.xs}
              accessibilityRole="button"
              accessibilityLabel={`Reset ${label}`}
              style={({ pressed }) => [
                styles.rowReset,
                { opacity: pressed ? 0.5 : 1, minHeight: Control.hit, minWidth: Control.hit },
              ]}
            >
              <Text style={[styles.rowResetText, { color: resetColor }]}>
                Reset
              </Text>
            </Pressable>
          )}
          <Text style={[styles.rowValue, { color: valueColor, fontFamily: FontFamily.medium }]}>
            {displayValue}
          </Text>
        </View>
      </View>
      <CreatorSlider
        value={value}
        min={min}
        max={max}
        step={0.001}
        onValueChange={onChange}
        onCommit={onCommit}
        accessibilityLabel={label}
        hapticAtNeutral={min < 0 && max > 0}
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
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  rowLabel: {
    fontSize: FontSize.caption,
  },
  rowValue: {
    fontSize: FontSize.caption,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'right',
  },
  rowReset: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
  },
  rowResetText: {
    fontSize: FontSize.micro,
    fontFamily: FontFamily.regular,
  },
});
