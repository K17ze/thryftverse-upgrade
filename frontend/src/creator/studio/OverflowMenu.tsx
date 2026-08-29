/**
 * OverflowMenu — floating overflow menu for the Creator Studio top bar.
 *
 * Extracted from CreatorStudioShell.tsx as part of the component split.
 * Contains the OverflowItem sub-component and the main OverflowMenu
 * component that renders undo/redo, preview, mention/look/stickers,
 * layers, templates, drafts, and settings actions.
 *
 * @module OverflowMenu
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Typography, IconGrammar, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale } from '../CreatorAnimations';
import { CreatorGlyph, type CreatorGlyphName } from '../controls/CreatorGlyph';

// ── Overflow menu item ─────────────────────────────────────────────
// Canonical overflow row used by the Studio overflow menu, the Poster
// composer overflow sheet, and the Look composer overflow menu.
// Supports both Ionicons (icon) and CreatorGlyph (glyph) so creative
// tools that use custom SVG glyphs in the rail also show their glyph
// in the overflow menu — not a silently-dropped fallback.
// When `colors` is provided, text/icon use theme tokens; otherwise the
// row renders white-on-dark (poster/look full-bleed chrome).

export interface OverflowItemProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  glyph?: CreatorGlyphName;
  label: string;
  colors?: ThemeColors;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  selected?: boolean;
}

export const OverflowItem = React.memo(function OverflowItem({
  icon,
  glyph,
  label,
  colors,
  onPress,
  disabled = false,
  danger = false,
  selected = false }: OverflowItemProps) {
  const haptic = useHaptic();
  const contentColor = disabled
    ? (colors?.textMuted ?? 'rgba(255,255,255,0.4)')
    : danger
      ? '#ff6b6b'
      : (colors?.textPrimary ?? '#fff');
  return (
    <PressScale
      onPress={() => {
        if (disabled) return;
        haptic.selection();
        onPress();
      }}
      disabled={disabled}
      style={[styles.overflowItem, disabled ? { opacity: 0.4 } : {}]}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : disabled ? { disabled: true } : undefined}
      hitSlop={12}
    >
      {glyph ? (
        <CreatorGlyph name={glyph} size={IconGrammar.standard} color={contentColor} />
      ) : (
        <Ionicons name={icon} size={IconGrammar.standard} color={contentColor} />
      )}
      <Text style={[styles.overflowItemText, { color: contentColor }]}>
        {label}
      </Text>
      {selected && (
        <Ionicons name="checkmark" size={IconGrammar.standard} color={contentColor} />
      )}
    </PressScale>
  );
});

// ── Overflow menu props ────────────────────────────────────────────
export interface OverflowMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Top offset for the menu position (typically insets.top + 52) */
  top: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onMention: () => void;
  isLook: boolean;
  onLook: () => void;
  onStickers: () => void;
  onLayers: () => void;
  onTemplates: () => void;
  onDrafts: () => void;
  onSettings: () => void;
  /** Whether the safe-zone overlay is currently visible */
  safeZoneVisible: boolean;
  /** Toggle the safe-zone overlay on the canvas */
  onToggleSafeZone: () => void;
}

// ── Component ──────────────────────────────────────────────────────
export function OverflowMenu({
  visible,
  onClose,
  top,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPreview,
  onMention,
  isLook,
  onLook,
  onStickers,
  onLayers,
  onTemplates,
  onDrafts,
  onSettings,
  safeZoneVisible,
  onToggleSafeZone }: OverflowMenuProps) {
  const { colors } = useAppTheme();

  if (!visible) return null;

  return (
    <Pressable
      style={styles.overflowBackdrop}
      onPress={onClose}
      accessibilityLabel="Close menu"
      accessibilityRole="button"
    >
      <View
        style={[
          styles.overflowMenu,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            top,
            right: 12 },
        ]}
      >
        <OverflowItem
          icon="arrow-undo"
          label="Undo"
          disabled={!canUndo}
          colors={colors}
          onPress={onUndo}
        />
        <OverflowItem
          icon="arrow-redo"
          label="Redo"
          disabled={!canRedo}
          colors={colors}
          onPress={onRedo}
        />
        <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
        <OverflowItem
          icon="eye-outline"
          label="Preview"
          colors={colors}
          onPress={onPreview}
        />
        <OverflowItem
          icon={safeZoneVisible ? 'scan-circle-outline' : 'scan-outline'}
          label={safeZoneVisible ? 'Safe Zone On' : 'Safe Zone'}
          colors={colors}
          onPress={onToggleSafeZone}
        />
        <OverflowItem
          icon="at-outline"
          label="Mention"
          colors={colors}
          onPress={onMention}
        />
        {isLook ? (
          <OverflowItem
            icon="shirt-outline"
            label="Look"
            colors={colors}
            onPress={onLook}
          />
        ) : (
          <OverflowItem
            icon="happy-outline"
            label="Stickers"
            colors={colors}
            onPress={onStickers}
          />
        )}
        <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
        <OverflowItem
          icon="layers-outline"
          label="Layers"
          colors={colors}
          onPress={onLayers}
        />
        <OverflowItem
          icon="grid-outline"
          label="Templates"
          colors={colors}
          onPress={onTemplates}
        />
        <OverflowItem
          icon="document-text-outline"
          label="Drafts"
          colors={colors}
          onPress={onDrafts}
        />
        <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
        <OverflowItem
          icon="settings-outline"
          label="Settings"
          colors={colors}
          onPress={onSettings}
        />
      </View>
    </Pressable>
  );
}

export default OverflowMenu;

// ── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 200 },
  overflowMenu: {
    position: 'absolute',
    minWidth: 220,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
    ...Elevation.modal },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    minHeight: 48 },
  overflowItemText: {
    flex: 1,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.bodyStrong.size },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs } });
