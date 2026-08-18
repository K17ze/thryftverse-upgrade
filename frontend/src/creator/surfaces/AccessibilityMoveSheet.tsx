/**
 * AccessibilityMoveSheet — keyboard/button-based alternative to drag.
 *
 * Per spec 09_VISUAL_SYSTEM_MOTION_ACCESSIBILITY, users who cannot
 * perform drag gestures (keyboard, switch control, voice) need an
 * alternative way to move a selected layer. This sheet provides:
 *   - the selected layer's current position (x, y as percentages)
 *   - nudge buttons (up/down/left/right) that move 1% per tap, or
 *     10% when the "Coarse" toggle is on (Fine = 1%, Coarse = 10%)
 *   - numeric inputs for X and Y position (0–100%)
 *   - a "Center on Canvas" button
 *
 * Per AGENTS.md §11: every control performs a real mutation via
 * onMove, which the host screen wires to updateLayer.
 * Per AGENTS.md §13: all buttons meet the 44pt minimum touch target.
 *
 * Uses the shared SheetContainer from ../CreatorAnimations for
 * consistent motion and chrome.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Type, Typography, FontFamily, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale, SheetContainer } from '../CreatorAnimations';

const TOUCH = 44;
const FINE_STEP = 0.01; // 1%
const COARSE_STEP = 0.1; // 10%

export interface AccessibilityMoveSheetProps {
  visible: boolean;
  layerId: string | null;
  /** Current normalized position (0–1) of the selected layer. */
  position: { x: number; y: number } | null;
  onClose: () => void;
  /** Called with the new normalized (0–1) x/y when the user commits a move. */
  onMove: (x: number, y: number) => void;
}

/**
 * Shows keyboard/button-based move alternatives for the selected layer.
 * The host screen passes the current position and an onMove callback
 * wired to updateLayer. Every nudge, numeric entry, and the center
 * button perform a real mutation.
 */
export function AccessibilityMoveSheet({
  visible,
  layerId,
  position,
  onClose,
  onMove,
}: AccessibilityMoveSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [coarse, setCoarse] = useState(false);
  const [xText, setXText] = useState('');
  const [yText, setYText] = useState('');

  // Sync local inputs with the live layer position whenever the sheet
  // opens or the position changes while open.
  useEffect(() => {
    if (!visible || !position) return;
    setXText(String(Math.round(position.x * 100)));
    setYText(String(Math.round(position.y * 100)));
  }, [visible, position]);

  const step = coarse ? COARSE_STEP : FINE_STEP;

  const clamp = useCallback((v: number) => Math.max(0, Math.min(1, v)), []);

  const nudge = useCallback(
    (axis: 'x' | 'y', delta: number) => {
      if (!position) return;
      const next = {
        x: axis === 'x' ? clamp(position.x + delta) : position.x,
        y: axis === 'y' ? clamp(position.y + delta) : position.y,
      };
      haptic.selection();
      onMove(next.x, next.y);
    },
    [position, clamp, haptic, onMove],
  );

  const handleApplyNumeric = useCallback(() => {
    if (!position) return;
    const xv = parseInt(xText, 10);
    const yv = parseInt(yText, 10);
    const nx = Number.isFinite(xv) ? clamp(xv / 100) : position.x;
    const ny = Number.isFinite(yv) ? clamp(yv / 100) : position.y;
    haptic.light();
    onMove(nx, ny);
    Keyboard.dismiss();
  }, [position, xText, yText, clamp, haptic, onMove]);

  const handleCenter = useCallback(() => {
    if (!position) return;
    haptic.medium();
    onMove(0.5, 0.5);
  }, [position, haptic, onMove]);

  const handleCoarseToggle = useCallback(() => {
    haptic.selection();
    setCoarse((p) => !p);
  }, [haptic]);

  const canEdit = !!layerId && !!position;

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.8}>
      <View style={{ paddingBottom: Math.max(insets.bottom, Space.md) }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close move sheet"
            accessibilityHint="Closes the accessibility move sheet"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Move
          </Text>
          <View style={styles.closeBtnPlaceholder} />
        </View>

        {!canEdit ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Select an object to move it
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              Tap an object on the canvas, then reopen this sheet
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            {/* ── Current position readout — flat with hairline ── */}
            <View style={[styles.readout, { borderBottomColor: colors.borderSubtle }]}>
              <View style={styles.readoutCell}>
                <Text style={[styles.readoutLabel, { color: colors.textMuted }]}>
                  X
                </Text>
                <Text style={[styles.readoutValue, { color: colors.textPrimary }]}>
                  {Math.round((position?.x ?? 0) * 100)}%
                </Text>
              </View>
              <View style={[styles.readoutDivider, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.readoutCell}>
                <Text style={[styles.readoutLabel, { color: colors.textMuted }]}>
                  Y
                </Text>
                <Text style={[styles.readoutValue, { color: colors.textPrimary }]}>
                  {Math.round((position?.y ?? 0) * 100)}%
                </Text>
              </View>
            </View>

            {/* ── Fine / Coarse toggle — underline selection ── */}
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>
                Step size
              </Text>
              <View style={styles.toggleGroup}>
                <PressScale
                  onPress={() => coarse && handleCoarseToggle()}
                  style={styles.toggleBtn}
                  accessibilityLabel="Fine step, 1 percent per tap"
                  accessibilityHint="Sets the nudge step to 1 percent"
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      {
                        color: !coarse ? colors.brand : colors.textSecondary,
                        textDecorationLine: !coarse ? 'underline' : 'none',
                      },
                    ]}
                  >
                    Fine
                  </Text>
                </PressScale>
                <PressScale
                  onPress={() => !coarse && handleCoarseToggle()}
                  style={styles.toggleBtn}
                  accessibilityLabel="Coarse step, 10 percent per tap"
                  accessibilityHint="Sets the nudge step to 10 percent"
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      {
                        color: coarse ? colors.brand : colors.textSecondary,
                        textDecorationLine: coarse ? 'underline' : 'none',
                      },
                    ]}
                  >
                    Coarse
                  </Text>
                </PressScale>
              </View>
            </View>

            {/* ── Nudge pad ── */}
            <View style={styles.nudgePad}>
              <View style={styles.nudgeRow}>
                <View style={styles.nudgeSpacer} />
                <PressScale
                  onPress={() => nudge('y', -step)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Nudge up"
                  accessibilityHint={`Moves the object up by ${coarse ? 10 : 1} percent`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-up" size={28} color={colors.textPrimary} />
                </PressScale>
                <View style={styles.nudgeSpacer} />
              </View>
              <View style={styles.nudgeRow}>
                <PressScale
                  onPress={() => nudge('x', -step)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Nudge left"
                  accessibilityHint={`Moves the object left by ${coarse ? 10 : 1} percent`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
                </PressScale>
                <View style={styles.nudgeCenter}>
                  <Ionicons name="move" size={22} color={colors.textMuted} />
                </View>
                <PressScale
                  onPress={() => nudge('x', step)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Nudge right"
                  accessibilityHint={`Moves the object right by ${coarse ? 10 : 1} percent`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-forward" size={28} color={colors.textPrimary} />
                </PressScale>
              </View>
              <View style={styles.nudgeRow}>
                <View style={styles.nudgeSpacer} />
                <PressScale
                  onPress={() => nudge('y', step)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Nudge down"
                  accessibilityHint={`Moves the object down by ${coarse ? 10 : 1} percent`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
                </PressScale>
                <View style={styles.nudgeSpacer} />
              </View>
            </View>

            {/* ── Numeric inputs ── */}
            <View style={styles.inputRow}>
              <View style={styles.inputCell}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  X (%)
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={xText}
                  onChangeText={setXText}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="X position in percent"
                  accessibilityHint="Enter the horizontal position from 0 to 100 percent"
                  returnKeyType="done"
                  onSubmitEditing={handleApplyNumeric}
                />
              </View>
              <View style={styles.inputCell}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Y (%)
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={yText}
                  onChangeText={setYText}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="Y position in percent"
                  accessibilityHint="Enter the vertical position from 0 to 100 percent"
                  returnKeyType="done"
                  onSubmitEditing={handleApplyNumeric}
                />
              </View>
            </View>

            <PressScale
              onPress={handleApplyNumeric}
              style={[styles.applyBtn, { borderColor: colors.border }]}
              accessibilityLabel="Apply position"
              accessibilityHint="Moves the object to the entered X and Y values"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.applyBtnText, { color: colors.textPrimary }]}>
                Apply Position
              </Text>
            </PressScale>

            {/* ── Center on canvas ── */}
            <PressScale
              onPress={handleCenter}
              style={[styles.centerBtn, { backgroundColor: colors.brand }]}
              accessibilityLabel="Center on canvas"
              accessibilityHint="Moves the object to the center of the canvas"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="locate-outline" size={20} color={colors.textInverse} />
              <Text style={[styles.centerBtnText, { color: colors.textInverse }]}>
                Center on Canvas
              </Text>
            </PressScale>
          </View>
        )}
      </View>
    </SheetContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  closeBtn: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  closeBtnPlaceholder: {
    width: TOUCH,
  },
  body: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  emptyText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    textAlign: 'center',
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readoutCell: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs,
  },
  readoutDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  readoutLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.metaElevated.size,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  readoutValue: {
    fontFamily: Typography.family.bold,
    fontSize: Type.bodyLarge.size,
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: Space.md,
  },
  toggleBtn: {
    paddingHorizontal: Space.xs,
    height: TOUCH - 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
  },
  nudgePad: {
    alignItems: 'center',
    gap: Space.xs,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  nudgeBtn: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nudgeCenter: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nudgeSpacer: {
    width: TOUCH,
    height: TOUCH,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  inputCell: {
    flex: 1,
    gap: Space.xs,
  },
  inputLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.metaElevated.size,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  input: {
    fontFamily: FontFamily.medium,
    fontSize: Type.bodyEmphasis.size,
    borderWidth: Stroke.standard,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    height: TOUCH,
    fontVariant: ['tabular-nums'],
  },
  applyBtn: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
  },
  applyBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  centerBtn: {
    flexDirection: 'row',
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
  },
  centerBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
});
