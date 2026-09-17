/**
 * textEditorControls — control building blocks for TextEditorSheet.
 *
 * Extracted from TextEditorSheet.tsx (pure extraction, zero behavior change):
 *   - MiniSlider: labeled CreatorSlider row
 *   - EffectSectionHeader: section label + enable/disable toggle (stroke,
 *     shadow, background sections)
 *   - EffectColorRow: color well toggle + expandable CreatorColorPicker
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CreatorSlider } from '../../controls/CreatorSlider';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  CreatorColorPicker,
  toHexString,
  type CreatorColor,
  type RecentColor } from '../../color';
import { clamp, colorToRgba } from './textEditorShared';
import { useEditorStyles } from './textEditorStyles';

// ── MiniSlider (delegates to shared CreatorSlider) ──────────────────

export interface MiniSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueFormatter: (v: number) => string;
  onChange: (v: number) => void;
  colors: ThemeColors;
}

export function MiniSlider({
  label,
  value,
  min,
  max,
  step,
  valueFormatter,
  onChange,
  colors }: MiniSliderProps) {
  const styles = useEditorStyles(colors);
  const clamped = clamp(value, min, max);

  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.sliderValue, { color: colors.textMuted }]}>
          {valueFormatter(clamped)}
        </Text>
      </View>
      <CreatorSlider
        value={clamped}
        min={min}
        max={max}
        step={step}
        onValueChange={onChange}
        accessibilityLabel={`${label} slider`}
        accessibilityHint="Adjusts the value"
      />
    </View>
  );
}

// ── EffectSectionHeader (section label + enable toggle) ───────────────

export interface EffectSectionHeaderProps {
  /** Display label, e.g. 'Stroke' — accessibility strings are derived from it. */
  label: string;
  enabled: boolean;
  onToggle: () => void;
  colors: ThemeColors;
}

export function EffectSectionHeader({
  label,
  enabled,
  onToggle,
  colors }: EffectSectionHeaderProps) {
  const haptic = useHaptic();
  const styles = useEditorStyles(colors);
  const subject = label.toLowerCase();

  return (
    <View style={styles.effectSectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Pressable
        onPress={() => { haptic.selection(); onToggle(); }}
        style={[styles.enableToggle, enabled && styles.enableToggleActive]}
        accessibilityLabel={enabled ? `Disable ${subject}` : `Enable ${subject}`}
        accessibilityHint={`Toggles the text ${subject}`}
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <AppIcon
          name={enabled ? 'checkmarkCircle' : 'ellipse-outline'}
          size={IconSize.hero}
          color={enabled ? 'brand' : 'textMuted'}
          opticalCenter={true}
          accessible={false}
        />
      </Pressable>
    </View>
  );
}

// ── EffectColorRow (color well toggle + expandable picker) ────────────

export interface EffectColorRowProps {
  /** Display label, e.g. 'Stroke' — accessibility strings are derived from it. */
  label: string;
  color: CreatorColor;
  expanded: boolean;
  onToggle: () => void;
  onChange: (c: CreatorColor) => void;
  onCommit: (c: CreatorColor) => void;
  recents: RecentColor[];
  onCommitRecent: (c: CreatorColor) => void;
  colors: ThemeColors;
}

export function EffectColorRow({
  label,
  color,
  expanded,
  onToggle,
  onChange,
  onCommit,
  recents,
  onCommitRecent,
  colors }: EffectColorRowProps) {
  const styles = useEditorStyles(colors);
  const subject = label.toLowerCase();

  return (
    <>
      <Pressable
        onPress={onToggle}
        style={styles.colorSectionToggle}
        accessibilityLabel={`${label} color`}
        accessibilityHint={`Shows the ${subject} color picker`}
        accessibilityRole="button"
      >
        <View style={[styles.colorWell, { backgroundColor: colorToRgba(color) }]} />
        <Text style={[styles.colorWellLabel, { color: colors.textSecondary }]}>
          {toHexString(color).toUpperCase()}
        </Text>
        <AppIcon
          name={expanded ? 'up' : 'down'}
          size={IconSize.xs}
          color="textSecondary"
          opticalCenter={true}
          accessible={false}
        />
      </Pressable>
      {expanded && (
        <CreatorColorPicker
          color={color}
          onChange={onChange}
          onCommit={onCommit}
          mode="expanded"
          recents={recents}
          onCommitRecent={onCommitRecent}
          accessibilityLabel={`${label} color picker`}
          accessibilityHint={`Choose a ${subject} color`}
          style={styles.colorPicker}
        />
      )}
    </>
  );
}
