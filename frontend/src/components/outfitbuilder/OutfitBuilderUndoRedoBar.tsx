import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Control, LetterSpacing, Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';

export interface OutfitBuilderUndoRedoBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Undo / Redo toolbar — progressive disclosure: only rendered by the screen
 * when there is history to traverse. Disabled states are truthful.
 */
function OutfitBuilderUndoRedoBarImpl({
  canUndo,
  canRedo,
  onUndo,
  onRedo }: OutfitBuilderUndoRedoBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.undoRedoBar}>
      <AnimatedPressable
        style={[styles.undoRedoBtn, !canUndo && styles.undoRedoBtnDisabled]}
        onPress={onUndo}
        activeOpacity={0.7}
        disabled={!canUndo}
        accessibilityRole="button"
        accessibilityLabel="Undo last change"
        accessibilityHint="Reverts the outfit to its previous state"
        hapticFeedback="light"
      >
        <Ionicons name="arrow-undo" size={18} color={canUndo ? colors.textPrimary : colors.textMuted} />
        <Text style={[styles.undoRedoLabel, !canUndo && styles.undoRedoLabelDisabled]}>Undo</Text>
      </AnimatedPressable>
      <AnimatedPressable
        style={[styles.undoRedoBtn, !canRedo && styles.undoRedoBtnDisabled]}
        onPress={onRedo}
        activeOpacity={0.7}
        disabled={!canRedo}
        accessibilityRole="button"
        accessibilityLabel="Redo change"
        accessibilityHint="Re-applies a change that was undone"
        hapticFeedback="light"
      >
        <Text style={[styles.undoRedoLabel, !canRedo && styles.undoRedoLabelDisabled]}>Redo</Text>
        <Ionicons name="arrow-redo" size={18} color={canRedo ? colors.textPrimary : colors.textMuted} />
      </AnimatedPressable>
    </View>
  );
}

export const OutfitBuilderUndoRedoBar = React.memo(OutfitBuilderUndoRedoBarImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  undoRedoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.lg,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border },
  undoRedoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
    minHeight: Control.hit },
  undoRedoBtnDisabled: {
    opacity: 0.4 },
  undoRedoLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    letterSpacing: LetterSpacing.wide },
  undoRedoLabelDisabled: {
    color: colors.textMuted } });
}
