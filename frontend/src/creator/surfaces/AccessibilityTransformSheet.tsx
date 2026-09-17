/**
 * AccessibilityTransformSheet — keyboard/button-based alternative to
 * pinch-to-scale and two-finger rotate.
 *
 * Per spec 09_VISUAL_SYSTEM_MOTION_ACCESSIBILITY, users who cannot
 * perform multi-touch gestures (keyboard, switch control, voice) need
 * an alternative way to resize and rotate a selected layer. This sheet
 * provides:
 *   - the selected layer's current scale (as %) and rotation (as °)
 *   - shrink/grow and rotate-left/right buttons that step 5% / 5° per
 *     tap, or 25% / 45° when the "Coarse" toggle is on
 *   - numeric inputs for scale (20–500%) and rotation (−360–360°)
 *   - a "Reset transform" button restoring scale 1 and rotation 0
 *
 * Ranges mirror the layer schema: scale 0.2–5, rotation −360..360.
 *
 * Per AGENTS.md §11: every control performs a real mutation via
 * onTransform, which the host screen wires to updateLayer.
 * Per AGENTS.md §13: all buttons meet the 44pt minimum touch target.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Keyboard,
  AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Typography, FontFamily, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale, SheetContainer } from '../shared/CreatorAnimations';
import { AppIcon } from '../../components/common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

const TOUCH = 44;
const SCALE_MIN = 0.2;
const SCALE_MAX = 5;
const ROT_MIN = -360;
const ROT_MAX = 360;
const SCALE_FINE = 0.05;
const SCALE_COARSE = 0.25;
const ROT_FINE = 5;
const ROT_COARSE = 45;

export interface AccessibilityTransformSheetProps {
  visible: boolean;
  layerId: string | null;
  /** Current scale (0.2–5) and rotation (degrees) of the selected layer. */
  transform: { scale: number; rotation: number } | null;
  onClose: () => void;
  /** Called with the new scale/rotation when the user commits a change. */
  onTransform: (scale: number, rotation: number) => void;
}

export function AccessibilityTransformSheet({
  visible,
  layerId,
  transform,
  onClose,
  onTransform }: AccessibilityTransformSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [coarse, setCoarse] = useState(false);
  const [scaleText, setScaleText] = useState('');
  const [rotText, setRotText] = useState('');

  // Sync local inputs with the live layer transform whenever the sheet
  // opens or the transform changes while open.
  useEffect(() => {
    if (!visible || !transform) return;
    setScaleText(String(Math.round(transform.scale * 100)));
    setRotText(String(Math.round(transform.rotation)));
  }, [visible, transform]);

  const scaleStep = coarse ? SCALE_COARSE : SCALE_FINE;
  const rotStep = coarse ? ROT_COARSE : ROT_FINE;

  const clampScale = useCallback(
    (v: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, v)),
    [],
  );
  const clampRot = useCallback(
    (v: number) => Math.max(ROT_MIN, Math.min(ROT_MAX, v)),
    [],
  );

  const announce = useCallback((scale: number, rotation: number) => {
    AccessibilityInfo.announceForAccessibility(
      `Scale ${Math.round(scale * 100)} percent, rotation ${Math.round(rotation)} degrees`,
    );
  }, []);

  const nudgeScale = useCallback(
    (delta: number) => {
      if (!transform) return;
      const next = clampScale(transform.scale + delta);
      haptic.selection();
      onTransform(next, transform.rotation);
      announce(next, transform.rotation);
    },
    [transform, clampScale, haptic, onTransform, announce],
  );

  const nudgeRotation = useCallback(
    (delta: number) => {
      if (!transform) return;
      const next = clampRot(transform.rotation + delta);
      haptic.selection();
      onTransform(transform.scale, next);
      announce(transform.scale, next);
    },
    [transform, clampRot, haptic, onTransform, announce],
  );

  const handleApplyNumeric = useCallback(() => {
    if (!transform) return;
    const sv = parseInt(scaleText, 10);
    const rv = parseInt(rotText, 10);
    const ns = Number.isFinite(sv) ? clampScale(sv / 100) : transform.scale;
    const nr = Number.isFinite(rv) ? clampRot(rv) : transform.rotation;
    haptic.light();
    onTransform(ns, nr);
    Keyboard.dismiss();
    announce(ns, nr);
  }, [transform, scaleText, rotText, clampScale, clampRot, haptic, onTransform, announce]);

  const handleReset = useCallback(() => {
    if (!transform) return;
    haptic.medium();
    onTransform(1, 0);
    announce(1, 0);
  }, [transform, haptic, onTransform, announce]);

  const handleCoarseToggle = useCallback(() => {
    haptic.selection();
    setCoarse((p) => !p);
  }, [haptic]);

  const canEdit = !!layerId && !!transform;

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.8}>
      <View style={{ paddingBottom: Math.max(insets.bottom, Space.md) }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close resize and rotate sheet"
            accessibilityHint="Closes the accessibility transform sheet"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <AppIcon name="close" size={IconSize.lg} color="textSecondary" opticalCenter={true} accessible={false} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Resize & rotate
          </Text>
          <View style={styles.closeBtnPlaceholder} />
        </View>

        {!canEdit ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Select an object to resize or rotate it
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              Tap an object on the canvas, then reopen this sheet
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            {/* ── Current transform readout ── */}
            <View
              style={[styles.readout, { borderBottomColor: colors.borderSubtle }]}
              accessibilityLiveRegion="polite"
            >
              <View style={styles.readoutCell}>
                <Text style={[styles.readoutLabel, { color: colors.textMuted }]}>
                  Scale
                </Text>
                <Text style={[styles.readoutValue, { color: colors.textPrimary }]}>
                  {Math.round((transform?.scale ?? 1) * 100)}%
                </Text>
              </View>
              <View
                style={[styles.readoutDivider, { backgroundColor: colors.borderSubtle }]}
              />
              <View style={styles.readoutCell}>
                <Text style={[styles.readoutLabel, { color: colors.textMuted }]}>
                  Rotation
                </Text>
                <Text style={[styles.readoutValue, { color: colors.textPrimary }]}>
                  {Math.round(transform?.rotation ?? 0)}°
                </Text>
              </View>
            </View>

            {/* ── Fine / Coarse toggle ── */}
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>
                Step size
              </Text>
              <View style={styles.toggleGroup}>
                <PressScale
                  onPress={() => coarse && handleCoarseToggle()}
                  style={styles.toggleBtn}
                  accessibilityLabel="Fine step, 5 percent scale, 5 degrees per tap"
                  accessibilityHint="Sets the nudge step to fine"
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      {
                        color: !coarse ? colors.brand : colors.textSecondary,
                        textDecorationLine: !coarse ? 'underline' : 'none' },
                    ]}
                  >
                    Fine
                  </Text>
                </PressScale>
                <PressScale
                  onPress={() => !coarse && handleCoarseToggle()}
                  style={styles.toggleBtn}
                  accessibilityLabel="Coarse step, 25 percent scale, 45 degrees per tap"
                  accessibilityHint="Sets the nudge step to coarse"
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      {
                        color: coarse ? colors.brand : colors.textSecondary,
                        textDecorationLine: coarse ? 'underline' : 'none' },
                    ]}
                  >
                    Coarse
                  </Text>
                </PressScale>
              </View>
            </View>

            {/* ── Scale controls ── */}
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>
                Scale
              </Text>
              <View style={styles.controlGroup}>
                <PressScale
                  onPress={() => nudgeScale(-scaleStep)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Shrink"
                  accessibilityHint={`Decreases scale by ${coarse ? 25 : 5} percent`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <AppIcon name="remove" size={IconSize.hero} color="textPrimary" opticalCenter={true} accessible={false} />
                </PressScale>
                <PressScale
                  onPress={() => nudgeScale(scaleStep)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Grow"
                  accessibilityHint={`Increases scale by ${coarse ? 25 : 5} percent`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <AppIcon name="add" size={IconSize.hero} color="textPrimary" opticalCenter={true} accessible={false} />
                </PressScale>
              </View>
            </View>

            {/* ── Rotation controls ── */}
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>
                Rotate
              </Text>
              <View style={styles.controlGroup}>
                <PressScale
                  onPress={() => nudgeRotation(-rotStep)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Rotate counterclockwise"
                  accessibilityHint={`Rotates left by ${coarse ? 45 : 5} degrees`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <AppIcon name="arrow-undo-outline" size={IconSize.hero} color="textPrimary" opticalCenter={true} accessible={false} />
                </PressScale>
                <PressScale
                  onPress={() => nudgeRotation(rotStep)}
                  style={styles.nudgeBtn}
                  accessibilityLabel="Rotate clockwise"
                  accessibilityHint={`Rotates right by ${coarse ? 45 : 5} degrees`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <AppIcon name="arrow-redo-outline" size={IconSize.hero} color="textPrimary" opticalCenter={true} accessible={false} />
                </PressScale>
              </View>
            </View>

            {/* ── Numeric inputs ── */}
            <View style={styles.inputRow}>
              <View style={styles.inputCell}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Scale (%)
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={scaleText}
                  onChangeText={setScaleText}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="Scale in percent"
                  accessibilityHint="Enter a number from 20 to 500"
                  returnKeyType="done"
                  onSubmitEditing={handleApplyNumeric}
                />
              </View>
              <View style={styles.inputCell}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Rotation (°)
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={rotText}
                  onChangeText={setRotText}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  accessibilityLabel="Rotation in degrees"
                  accessibilityHint="Enter a number from minus 360 to 360"
                  returnKeyType="done"
                  onSubmitEditing={handleApplyNumeric}
                />
              </View>
            </View>

            <PressScale
              onPress={handleApplyNumeric}
              style={[styles.applyBtn, { borderColor: colors.border }]}
              accessibilityLabel="Apply transform"
              accessibilityHint="Applies the entered scale and rotation values"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.applyBtnText, { color: colors.textPrimary }]}>
                Apply
              </Text>
            </PressScale>

            {/* ── Reset transform ── */}
            <PressScale
              onPress={handleReset}
              style={[styles.resetBtn, { backgroundColor: colors.brand }]}
              accessibilityLabel="Reset transform"
              accessibilityHint="Restores scale to 100 percent and rotation to 0 degrees"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon name="refresh" size={IconSize.md} color="textInverse" opticalCenter={true} accessible={false} />
              <Text style={[styles.resetBtnText, { color: colors.textInverse }]}>
                Reset Transform
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
    paddingVertical: Space.sm },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size },
  closeBtn: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm },
  closeBtnPlaceholder: {
    width: TOUCH },
  body: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    gap: Space.md },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
    paddingHorizontal: Space.lg },
  emptyText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    textAlign: 'center' },
  emptySubtext: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    textAlign: 'center' },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth },
  readoutCell: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs },
  readoutDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch' },
  readoutLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.label.size,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  readoutValue: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.body.size,
    fontVariant: ['tabular-nums'] },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  toggleLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  toggleGroup: {
    flexDirection: 'row',
    gap: Space.md },
  toggleBtn: {
    paddingHorizontal: Space.xs,
    height: TOUCH - 8,
    justifyContent: 'center',
    alignItems: 'center' },
  toggleText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  controlLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  controlGroup: {
    flexDirection: 'row',
    gap: Space.lg },
  nudgeBtn: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center' },
  inputRow: {
    flexDirection: 'row',
    gap: Space.md },
  inputCell: {
    flex: 1,
    gap: Space.xs },
  inputLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.label.size,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  input: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.bodyStrong.size,
    borderWidth: Stroke.standard,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    height: TOUCH,
    fontVariant: ['tabular-nums'] },
  applyBtn: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard },
  applyBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  resetBtn: {
    flexDirection: 'row',
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg },
  resetBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size } });
