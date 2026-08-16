/**
 * DrawingPaletteBar — horizontal palette bar for the drawing workspace.
 *
 * Renders the current palette's colors as a horizontally scrollable row of
 * 44pt swatches with a 4pt gap. The active color is highlighted with a ring.
 * A palette-switcher button opens a sheet listing every predefined palette
 * plus the user's persisted custom palette. A custom-color button opens the
 * shared CreatorColorPicker so the user can author and save custom colors.
 *
 * Per AGENTS.md §4, §11, §13:
 *   - 44pt minimum touch targets (swatches and buttons).
 *   - Haptics on every color / palette selection.
 *   - Truthful UI: real curated palettes, real persisted custom colors.
 *   - Reanimated press feedback via PressScale.
 *   - TypeScript strict compatible.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  Type,
  FontFamily,
  Control,
  Stroke,
} from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import {
  CreatorColorPicker,
  fromHexString,
  toHexString,
  normalize,
} from '../../color/';
import type { CreatorColor, RecentColor } from '../../color/';
import {
  getAllPalettes,
  getPalette,
  getPaletteLabel,
  loadCustomPalette,
  saveCustomPalette,
  type Palette,
  type PaletteName,
} from './DrawingPaletteSystem';

// ── Props ──────────────────────────────────────────────────────────────

export interface DrawingPaletteBarProps {
  /** Currently selected color (canonical CreatorColor). */
  color: CreatorColor;
  /** Transient change — updates the live color without a history entry. */
  onColorChange: (color: CreatorColor) => void;
  /** Commit — updates color and creates a history entry. */
  onColorCommit: (color: CreatorColor) => void;
  /** Recent colors from useCreatorColorHistory (for the color picker). */
  recents?: RecentColor[];
  /** Called when a color is committed and should be added to recents. */
  onCommitRecent?: (color: CreatorColor) => void;
  /** Accessibility label for the bar. */
  accessibilityLabel?: string;
}

const SWATCH_SIZE = Control.hit; // 44pt
const SWATCH_GAP = Space.xs; // 4pt

// ── Component ──────────────────────────────────────────────────────────

export function DrawingPaletteBar({
  color,
  onColorChange,
  onColorCommit,
  recents = [],
  onCommitRecent,
  accessibilityLabel = 'Drawing palette',
}: DrawingPaletteBarProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeHex = useMemo(() => toHexString(normalize(color)), [color]);

  // ── Palette state ──
  const [activePalette, setActivePalette] = useState<PaletteName>('default');
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [showPaletteSheet, setShowPaletteSheet] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Load the persisted custom palette on mount.
  useEffect(() => {
    let cancelled = false;
    loadCustomPalette()
      .then((loaded) => {
        if (!cancelled && loaded.length > 0) {
          setCustomColors(loaded);
        }
      })
      .catch(() => {
        // Storage read failure is non-fatal — custom palette stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The colors shown in the bar come from the active palette. For 'custom',
  // we use the persisted custom colors (empty until the user saves some).
  const currentColors = useMemo<string[]>(() => {
    if (activePalette === 'custom') return customColors;
    return getPalette(activePalette);
  }, [activePalette, customColors]);

  // ── Selection handlers ──
  const handleSelectSwatch = useCallback(
    (hex: string) => {
      haptic.light();
      const parsed = fromHexString(hex);
      if (parsed) {
        const normalizedColor = normalize(parsed);
        onColorCommit(normalizedColor);
      }
    },
    [haptic, onColorCommit],
  );

  const handleSelectPalette = useCallback(
    (name: PaletteName) => {
      haptic.selection();
      setActivePalette(name);
      setShowPaletteSheet(false);
    },
    [haptic],
  );

  // ── Custom color picker ──
  const handleColorChange = useCallback(
    (c: CreatorColor) => {
      onColorChange(c);
    },
    [onColorChange],
  );

  const handleColorCommit = useCallback(
    (c: CreatorColor) => {
      const normalizedColor = normalize(c);
      onColorCommit(normalizedColor);
      onCommitRecent?.(normalizedColor);
    },
    [onColorCommit, onCommitRecent],
  );

  // Save the current color into the custom palette and switch to it.
  const handleSaveCustomColor = useCallback(
    async (c: CreatorColor) => {
      const hex = toHexString(normalize(c));
      // Deduplicate and prepend.
      const next = [hex, ...customColors.filter((h) => h !== hex)].slice(0, 12);
      setCustomColors(next);
      setActivePalette('custom');
      try {
        const persisted = await saveCustomPalette(next);
        setCustomColors(persisted);
      } catch {
        // Persistence failure is non-fatal — the in-memory palette still works.
      }
    },
    [customColors],
  );

  // ── Palette sheet data ──
  const allPalettes = useMemo<Palette[]>(() => {
    const predefined = getAllPalettes();
    const custom: Palette = {
      name: 'custom',
      label: 'Custom',
      colors: customColors,
    };
    return [...predefined, custom];
  }, [customColors]);

  return (
    <View style={styles.root} accessibilityLabel={accessibilityLabel}>
      {/* Swatch row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.swatchRow}
        accessibilityLabel="Current palette colors"
      >
        {currentColors.map((hex) => {
          const selected = hex.toLowerCase() === activeHex.toLowerCase();
          return (
            <PressScale
              key={hex}
              accessibilityLabel={`Color ${hex}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => handleSelectSwatch(hex)}
              style={[
                styles.swatchOuter,
                selected ? { borderColor: colors.brand } : {},
              ]}
            >
              <View style={[styles.swatchFill, { backgroundColor: hex }]} />
            </PressScale>
          );
        })}

        {/* Custom color button — opens the shared CreatorColorPicker */}
        <PressScale
          accessibilityLabel="Custom color picker"
          accessibilityRole="button"
          accessibilityState={{ expanded: showColorPicker }}
          onPress={() => setShowColorPicker((v) => !v)}
          style={[
            styles.customColorBtn,
            {
              backgroundColor: showColorPicker ? colors.brandSubtle : colors.surfaceAlt,
              borderColor: showColorPicker ? colors.brand : colors.borderSubtle,
            },
          ]}
        >
          <Ionicons
            name="color-palette-outline"
            size={Control.iconCompact}
            color={showColorPicker ? colors.brand : colors.textSecondary}
          />
        </PressScale>

        {/* Palette switcher button */}
        <PressScale
          accessibilityLabel="Switch palette"
          accessibilityRole="button"
          accessibilityState={{ expanded: showPaletteSheet }}
          onPress={() => setShowPaletteSheet(true)}
          style={[
            styles.paletteSwitchBtn,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <Ionicons
            name="grid-outline"
            size={Control.iconCompact}
            color={colors.textSecondary}
          />
          <Text style={styles.paletteSwitchLabel} numberOfLines={1}>
            {getPaletteLabel(activePalette)}
          </Text>
        </PressScale>
      </ScrollView>

      {/* Shared CreatorColorPicker — compact row */}
      {showColorPicker && (
        <View style={styles.colorPickerSection}>
          <CreatorColorPicker
            color={color}
            onChange={handleColorChange}
            onCommit={handleColorCommit}
            mode="compact"
            recents={recents}
            onCommitRecent={onCommitRecent}
            accessibilityLabel="Drawing custom color"
          />
          {/* Save current color into the custom palette */}
          <PressScale
            accessibilityLabel="Save color to custom palette"
            accessibilityRole="button"
            onPress={() => handleSaveCustomColor(color)}
            style={styles.saveCustomBtn}
          >
            <Ionicons
              name="add-circle-outline"
              size={Control.iconCompact}
              color={colors.brand}
            />
            <Text style={styles.saveCustomText}>Save to Custom</Text>
          </PressScale>
        </View>
      )}

      {/* Palette switcher sheet */}
      <SheetContainer
        visible={showPaletteSheet}
        onClose={() => setShowPaletteSheet(false)}
        maxHeight={0.7}
      >
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              Palettes
            </Text>
            <PressScale
              accessibilityLabel="Close palettes"
              accessibilityRole="button"
              onPress={() => setShowPaletteSheet(false)}
              style={styles.sheetClose}
            >
              <Ionicons name="close" size={Control.icon} color={colors.textPrimary} />
            </PressScale>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.paletteList}
          >
            {allPalettes.map((pal) => {
              const active = pal.name === activePalette;
              return (
                <PressScale
                  key={pal.name}
                  accessibilityLabel={`${pal.label} palette`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => handleSelectPalette(pal.name)}
                  style={[
                    styles.paletteRow,
                    active ? { borderColor: colors.brand } : {},
                  ]}
                >
                  <Text style={styles.paletteRowLabel} numberOfLines={1}>
                    {pal.label}
                  </Text>
                  <View style={styles.paletteRowSwatches}>
                    {pal.colors.length === 0 ? (
                      <Text style={styles.paletteRowEmpty}>No saved colors yet</Text>
                    ) : (
                      pal.colors.slice(0, 8).map((hex) => (
                        <View
                          key={hex}
                          style={[styles.paletteRowSwatch, { backgroundColor: hex }]}
                        />
                      ))
                    )}
                  </View>
                </PressScale>
              );
            })}
          </ScrollView>
        </View>
      </SheetContainer>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      gap: Space.sm,
    } as ViewStyle,
    swatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SWATCH_GAP,
      paddingVertical: Space.xxs,
      paddingRight: Space.md,
    } as ViewStyle,
    swatchOuter: {
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      borderRadius: Radius.full,
      borderWidth: Stroke.emphasis,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Stroke.standard,
    } as ViewStyle,
    swatchFill: {
      width: SWATCH_SIZE - Stroke.standard * 2 - Stroke.emphasis * 2,
      height: SWATCH_SIZE - Stroke.standard * 2 - Stroke.emphasis * 2,
      borderRadius: Radius.full,
    } as ViewStyle,
    customColorBtn: {
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    paletteSwitchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      height: SWATCH_SIZE,
      paddingHorizontal: Space.smMd,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      gap: Space.xs,
    } as ViewStyle,
    paletteSwitchLabel: {
      fontFamily: FontFamily.medium,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      color: colors.textSecondary,
    } as TextStyle,
    colorPickerSection: {
      gap: Space.sm,
      paddingTop: Space.xs,
    } as ViewStyle,
    saveCustomBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      alignSelf: 'flex-start',
      height: Control.hit,
      paddingHorizontal: Space.sm,
    } as ViewStyle,
    saveCustomText: {
      fontFamily: FontFamily.medium,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      color: colors.brand,
    } as TextStyle,
    // ── Palette sheet ──
    sheetContainer: {
      flex: 1,
      paddingHorizontal: Space.md,
    } as ViewStyle,
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
    } as ViewStyle,
    sheetTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      letterSpacing: Type.subtitle.letterSpacing,
      color: colors.textPrimary,
    } as TextStyle,
    sheetClose: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    paletteList: {
      paddingVertical: Space.sm,
      gap: Space.sm,
    } as ViewStyle,
    paletteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: 'transparent',
    } as ViewStyle,
    paletteRowLabel: {
      flex: 1,
      fontFamily: FontFamily.medium,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textPrimary,
    } as TextStyle,
    paletteRowSwatches: {
      flexDirection: 'row',
      gap: 4,
    } as ViewStyle,
    paletteRowSwatch: {
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      borderWidth: Stroke.hairline,
      borderColor: colors.borderSubtle,
    } as ViewStyle,
    paletteRowEmpty: {
      fontFamily: FontFamily.regular,
      fontSize: Type.meta.size,
      color: colors.textMuted,
    } as TextStyle,
  });
}
