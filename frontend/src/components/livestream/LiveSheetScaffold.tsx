/**
 * LiveSheetScaffold — shared sheet chrome for the live viewer's bottom
 * sheets: a full-stage dismiss overlay and a non-actionable sheet container.
 *
 * The sheet body is a plain View that claims the responder via
 * onStartShouldSetResponder so taps on the sheet do not fall through to the
 * dismiss overlay — it is intentionally NOT a pressable.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface LiveSheetScaffoldProps {
  onClose: () => void;
  overlayAccessibilityLabel: string;
  children: React.ReactNode;
}

export function LiveSheetScaffold({ onClose, overlayAccessibilityLabel, children }: LiveSheetScaffoldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <AnimatedPressable
      style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={overlayAccessibilityLabel}
    >
      <View
        style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onStartShouldSetResponder={() => true}
      >
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        {children}
      </View>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.sm },
  sheetHandle: {
    width: Space.xxl,
    height: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    alignSelf: 'center' } });
