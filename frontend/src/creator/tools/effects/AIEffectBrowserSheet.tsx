/**
 * AIEffectBrowserSheet — bottom sheet for browsing and applying effects.
 *
 * Wraps `AIEffectGrid` in a `SheetContainer` (the canonical animated bottom
 * sheet) and adds an intensity slider (`CreatorSlider`) plus an "Apply"
 * button. The user picks an effect from the grid, dials the intensity, and
 * taps Apply — which calls `onApply(effectId, intensity)`.
 *
 * Per AGENTS.md §11 (truthful UI): effects are labelled honestly by their
 * `capabilityClass` via `getEffectCapabilityLabel` — deterministic filters
 * are never labelled "AI". When ML is unavailable, no ML-specific badges
 * are shown. The Apply button is disabled until an effect is selected —
 * no fake "applied" state. The intensity slider is likewise disabled
 * until a selection exists. When `onRemove` is provided, a "Remove"
 * button appears for an already-selected effect so the caller's removal
 * capability is preserved (AGENTS.md §8).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets, haptics on apply.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  Space,
  Radius,
  Stroke,
  FontFamily,
  FontSize,
  Type,
} from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { CreatorSlider } from '../../controls/CreatorSlider';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { AIEffectGrid } from './AIEffectGrid';
import {
  type EffectDefinition,
  getAllEffects,
  getEffect,
  getEffectCapabilityLabel,
  isMLAvailable,
} from './AIEffectRegistry';

// ── Types ──────────────────────────────────────────────────────────────

export interface AIEffectBrowserSheetProps {
  /** Whether the sheet is visible. */
  visible: boolean;
  /** Called when the user dismisses the sheet (backdrop tap or close). */
  onClose: () => void;
  /**
   * Called when the user taps Apply. Receives the selected effect id and
   * the intensity (0..1). The caller resolves the effect's render stack
   * via the AIEffectRegistry and applies it to the target media layer.
   */
  onApply: (effectId: string, intensity: number) => void;
  /** Source image URI for the effect preview thumbnails. */
  sourceImageUri: string;
  /** Optional initially selected effect id. */
  initialEffectId?: string | null;
  /** Optional initial intensity (0..1). Default 1. */
  initialIntensity?: number;
  /**
   * Optional removal callback. When provided and an effect is selected,
   * a "Remove" button is shown so the user can clear the active effect.
   * Preserves the caller's removal capability (AGENTS.md §8).
   */
  onRemove?: (effectId: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_INTENSITY = 1;

// ── Component ──────────────────────────────────────────────────────────

/**
 * Bottom sheet for browsing effects with an intensity slider and Apply.
 */
export function AIEffectBrowserSheet({
  visible,
  onClose,
  onApply,
  sourceImageUri,
  initialEffectId = null,
  initialIntensity = DEFAULT_INTENSITY,
  onRemove,
}: AIEffectBrowserSheetProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useSheetStyles(colors);

  const effects = useMemo<EffectDefinition[]>(() => getAllEffects(), []);
  const mlAvailable = useMemo(() => isMLAvailable(), []);

  const [selectedId, setSelectedId] = useState<string | null>(initialEffectId);
  const [intensity, setIntensity] = useState<number>(initialIntensity);

  // Reset internal state each time the sheet opens so stale selections from
  // a previous session do not leak in.
  useEffect(() => {
    if (visible) {
      setSelectedId(initialEffectId);
      setIntensity(initialIntensity);
    }
  }, [visible, initialEffectId, initialIntensity]);

  const hasSelection = selectedId !== null;
  const selectedEffect = hasSelection ? getEffect(selectedId) : undefined;

  const handleSelect = useCallback((effectId: string) => {
    setSelectedId(effectId);
  }, []);

  const handleIntensityChange = useCallback((v: number) => {
    setIntensity(v);
  }, []);

  const handleApply = useCallback(() => {
    if (!hasSelection) return;
    if (!reducedMotion) haptic.medium();
    onApply(selectedId, intensity);
  }, [hasSelection, selectedId, intensity, haptic, onApply, reducedMotion]);

  const handleRemove = useCallback(() => {
    if (!hasSelection || !onRemove) return;
    if (!reducedMotion) haptic.heavy();
    onRemove(selectedId);
    setSelectedId(null);
  }, [hasSelection, selectedId, onRemove, haptic, reducedMotion]);

  const handleClose = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onClose();
  }, [haptic, onClose, reducedMotion]);

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
      <View style={styles.content}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Effects
          </Text>
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close effects browser"
            accessibilityHint="Closes the effect browser sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* ── Selected effect name ────────────────────────────────── */}
        {selectedEffect ? (
          <View style={styles.selectionMeta}>
            <View style={styles.selectionHeading}>
              <Text style={[styles.selectionName, { color: colors.textPrimary }]}>
                {selectedEffect.name}
              </Text>
              {/* Honest capability badge. ML/generative classes are only
                  shown when ML is actually available; otherwise they read
                  "Unavailable" — never a fake "AI" label (AGENTS.md §11). */}
              <View
                style={[
                  styles.capabilityBadge,
                  { borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.capabilityBadgeText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {getEffectCapabilityLabel(selectedEffect)}
                </Text>
              </View>
            </View>
            <Text
              style={[styles.selectionDesc, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {selectedEffect.description}
            </Text>
            {/* Only surface the ML note when ML is genuinely available. */}
            {mlAvailable && selectedEffect.requiresML ? (
              <Text
                style={[styles.selectionNote, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                AI-assisted
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── Effect grid ─────────────────────────────────────────── */}
        <View style={styles.gridWrap}>
          <AIEffectGrid
            effects={effects}
            selectedId={selectedId}
            onSelect={handleSelect}
            sourceImageUri={sourceImageUri}
          />
        </View>

        {/* ── Intensity slider + actions ──────────────────────────── */}
        <View style={styles.footer}>
          <CreatorSlider
            value={intensity}
            min={0}
            max={1}
            step={0.01}
            onValueChange={handleIntensityChange}
            onCommit={handleIntensityChange}
            label="Intensity"
            accessibilityLabel="Effect intensity"
            disabled={!hasSelection}
          />

          <View style={styles.actionRow}>
            {/* Remove button — only when removal is supported + a selection exists */}
            {onRemove && hasSelection ? (
              <Pressable
                onPress={handleRemove}
                accessibilityLabel="Remove effect"
                accessibilityRole="button"
                accessibilityHint="Removes the selected effect"
                style={[styles.removeBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.removeBtnText, { color: colors.textSecondary }]}>
                  Remove
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleApply}
              disabled={!hasSelection}
              accessibilityLabel="Apply effect"
              accessibilityRole="button"
              accessibilityHint={
                hasSelection
                  ? `Applies ${selectedEffect?.name ?? 'the effect'} at ${Math.round(intensity * 100)}% intensity`
                  : 'Select an effect first'
              }
              accessibilityState={{ disabled: !hasSelection }}
              style={[
                styles.applyBtn,
                { backgroundColor: hasSelection ? colors.brand : colors.surfaceAlt },
                onRemove && hasSelection ? { flex: 1 } : { flex: 1 },
              ]}
            >
              <Text
                style={[
                  styles.applyBtnText,
                  { color: hasSelection ? colors.textInverse : colors.textMuted },
                ]}
              >
                Apply
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SheetContainer>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

function useSheetStyles(colors: ThemeColors) {
  return useMemo(
    () =>
      StyleSheet.create({
        content: {
          flex: 1,
          paddingTop: Space.sm,
        } as ViewStyle,
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
        } as ViewStyle,
        title: {
          fontFamily: FontFamily.semibold,
          fontSize: Type.title.size,
          lineHeight: Type.title.lineHeight,
          letterSpacing: Type.title.letterSpacing,
        } as ViewStyle,
        closeBtn: {
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        } as ViewStyle,
        selectionMeta: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
          gap: 2,
        } as ViewStyle,
        selectionHeading: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: Space.sm,
        } as ViewStyle,
        selectionName: {
          flex: 1,
          fontFamily: FontFamily.medium,
          fontSize: FontSize.bodyLarge,
        } as ViewStyle,
        capabilityBadge: {
          paddingHorizontal: Space.sm,
          paddingVertical: 2,
          borderRadius: Radius.sm,
          borderWidth: Stroke.hairline,
        } as ViewStyle,
        capabilityBadgeText: {
          fontFamily: FontFamily.medium,
          fontSize: FontSize.caption,
        } as ViewStyle,
        selectionDesc: {
          fontFamily: FontFamily.regular,
          fontSize: FontSize.caption,
          lineHeight: FontSize.caption + 4,
        } as ViewStyle,
        selectionNote: {
          fontFamily: FontFamily.regular,
          fontSize: FontSize.caption,
          lineHeight: FontSize.caption + 4,
        } as ViewStyle,
        gridWrap: {
          flex: 1,
        } as ViewStyle,
        footer: {
          paddingHorizontal: Space.md,
          paddingTop: Space.sm,
          paddingBottom: Space.md,
          gap: Space.md,
          borderTopWidth: Stroke.hairline,
          borderTopColor: colors.border,
        } as ViewStyle,
        actionRow: {
          flexDirection: 'row',
          gap: Space.sm,
        } as ViewStyle,
        removeBtn: {
          height: 50,
          paddingHorizontal: Space.md,
          borderRadius: Radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: Stroke.standard,
        } as ViewStyle,
        removeBtnText: {
          fontFamily: FontFamily.medium,
          fontSize: Type.bodyStrong.size,
        } as ViewStyle,
        applyBtn: {
          height: 50,
          borderRadius: Radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
        } as ViewStyle,
        applyBtnText: {
          fontFamily: FontFamily.semibold,
          fontSize: Type.bodyStrong.size,
        } as ViewStyle,
      }),
    [colors],
  );
}

export default AIEffectBrowserSheet;
