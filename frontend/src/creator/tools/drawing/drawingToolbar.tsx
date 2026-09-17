/**
 * drawingToolbar — primary tool row and brush-style pills for the drawing
 * workspace.
 *
 * Extracted from DrawingWorkspace.tsx (pure extraction, zero behavior change):
 *   - `DrawingToolBar`: brush / eraser / color / undo / redo / overflow icon
 *     buttons (44pt targets, no labels)
 *   - `DrawingBrushPills`: horizontal scroll of brush-style pills
 */
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View } from 'react-native';
import {
  Space,
  Radius,
  FontFamily,
  Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { CreatorIconButton } from '../../controls';
import type { BrushType } from './DrawingTypes';

const BRUSH_PILLS: { label: string; value: BrushType }[] = [
  { label: 'Pen', value: 'pen' },
  { label: 'Marker', value: 'marker' },
  { label: 'Highlighter', value: 'highlighter' },
  { label: 'Neon', value: 'neon' },
  { label: 'Eraser', value: 'eraser' },
  { label: 'Emoji', value: 'emoji' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool bar — primary tools, 44pt targets, no labels
// ─────────────────────────────────────────────────────────────────────────────
export interface DrawingToolBarProps {
  isDrawBrush: boolean;
  eraserSelected: boolean;
  colorPickerSelected: boolean;
  undoDisabled: boolean;
  redoDisabled: boolean;
  overflowSelected: boolean;
  onBrushTool: () => void;
  onEraserTool: () => void;
  onColorTool: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleOverflow: () => void;
}

export function DrawingToolBar({
  isDrawBrush,
  eraserSelected,
  colorPickerSelected,
  undoDisabled,
  redoDisabled,
  overflowSelected,
  onBrushTool,
  onEraserTool,
  onColorTool,
  onUndo,
  onRedo,
  onToggleOverflow,
}: DrawingToolBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.toolBar}>
      <CreatorIconButton
        icon="brush-outline"
        size={24}
        hitTarget={Control.hit}
        selected={isDrawBrush}
        onPress={onBrushTool}
        accessibilityLabel="Brush tool"
        accessibilityHint="Switches to the brush tool"
      />
      <CreatorIconButton
        icon="backspace-outline"
        size={24}
        hitTarget={Control.hit}
        selected={eraserSelected}
        onPress={onEraserTool}
        accessibilityLabel="Eraser tool"
        accessibilityHint="Switches to the eraser tool"
      />
      <CreatorIconButton
        icon="color-palette-outline"
        size={24}
        hitTarget={Control.hit}
        selected={colorPickerSelected}
        onPress={onColorTool}
        accessibilityLabel="Color picker"
        accessibilityHint="Shows stroke color options"
      />
      <CreatorIconButton
        icon="arrow-undo"
        size={20}
        hitTarget={Control.hit}
        color={colors.textPrimary}
        disabled={undoDisabled}
        onPress={onUndo}
        accessibilityLabel="Undo"
        accessibilityHint="Undo the last stroke"
      />
      <CreatorIconButton
        icon="arrow-redo"
        size={20}
        hitTarget={Control.hit}
        color={colors.textPrimary}
        disabled={redoDisabled}
        onPress={onRedo}
        accessibilityLabel="Redo"
        accessibilityHint="Redo the last undone stroke"
      />
      <CreatorIconButton
        icon="ellipsis-horizontal"
        size={24}
        hitTarget={Control.hit}
        selected={overflowSelected}
        onPress={onToggleOverflow}
        accessibilityLabel="More options"
        accessibilityHint="Shows the overflow menu"
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Brush picker — horizontal scroll of 36pt pills
// ─────────────────────────────────────────────────────────────────────────────
export interface DrawingBrushPillsProps {
  brushType: BrushType;
  onSelectBrush: (t: BrushType) => void;
}

export function DrawingBrushPills({ brushType, onSelectBrush }: DrawingBrushPillsProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.brushPillsContent}
    >
      {BRUSH_PILLS.map((pill) => {
        const selected = pill.value === brushType;
        return (
          <Pressable
            key={pill.value}
            onPress={() => onSelectBrush(pill.value)}
            accessibilityLabel={`${pill.label} brush`}
            accessibilityHint="Selects this brush style"
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.brushPill,
              {
                backgroundColor: selected ? colors.surfaceAlt : 'transparent' },
            ]}
          >
            <Text
              style={[
                styles.brushPillText,
                { color: selected ? colors.textPrimary : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {pill.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Tool bar ──
    toolBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    // ── Brush picker pills ──
    brushPillsContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xxs },
    brushPill: {
      height: 36,
      paddingHorizontal: Space.md,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center' },
    brushPillText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.captionElevated.size,
      lineHeight: 18,
      color: colors.textSecondary } });
}
