/**
 * CutoutToolControls — the trace-toolbar controls row of
 * CreatorCutoutSheet: Preview / Undo / Clear. Extracted verbatim from
 * CreatorCutoutSheet.tsx.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { styles } from './cutoutSheetStyles';

interface CutoutToolControlsProps {
  colors: ThemeColors;
  hasEffectivePaths: boolean;
  hasPaths: boolean;
  previewCrop: boolean;
  onPreviewCrop: () => void;
  onUndo: () => void;
  onClear: () => void;
}

export function CutoutToolControls({
  colors,
  hasEffectivePaths,
  hasPaths,
  previewCrop,
  onPreviewCrop,
  onUndo,
  onClear }: CutoutToolControlsProps) {
  return (
    /* Tool controls — flattened, no card containers */
    <View style={styles.toolRow}>
      <PressScale
        onPress={onPreviewCrop}
        style={styles.toolBtn}
        disabled={!hasEffectivePaths}
        accessibilityLabel="Preview crop"
        accessibilityHint="Shows the cutout preview"
        accessibilityRole="button"
      >
        <Ionicons
          name="eye-outline"
          size={IconGrammar.standard}
          color={!hasEffectivePaths ? colors.textMuted : (previewCrop ? colors.brand : colors.textPrimary)}
        />
        <Text style={[styles.toolLabel, { color: !hasEffectivePaths ? colors.textMuted : (previewCrop ? colors.brand : colors.textSecondary) }]}>
          Preview
        </Text>
      </PressScale>

      <PressScale
        onPress={onUndo}
        style={styles.toolBtn}
        disabled={!hasPaths}
        accessibilityLabel="Undo last trace"
        accessibilityHint="Reverts the last trace"
        accessibilityRole="button"
      >
        <Ionicons
          name="arrow-undo-outline"
          size={IconGrammar.standard}
          color={!hasPaths ? colors.textMuted : colors.textPrimary}
        />
        <Text style={[styles.toolLabel, { color: !hasPaths ? colors.textMuted : colors.textSecondary }]}>
          Undo
        </Text>
      </PressScale>
      <PressScale
        onPress={onClear}
        style={styles.toolBtn}
        disabled={!hasPaths}
        accessibilityLabel="Clear all traces"
        accessibilityHint="Removes all traces"
        accessibilityRole="button"
      >
        <Ionicons
          name="trash-outline"
          size={IconGrammar.standard}
          color={!hasPaths ? colors.textMuted : colors.textPrimary}
        />
        <Text style={[styles.toolLabel, { color: !hasPaths ? colors.textMuted : colors.textSecondary }]}>
          Clear
        </Text>
      </PressScale>
    </View>
  );
}
