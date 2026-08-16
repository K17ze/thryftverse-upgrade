/**
 * AIEffectGrid — 3-column grid UI for browsing AI effects.
 *
 * Renders a 3-column grid of `EffectPreviewThumb` thumbnails, one per
 * registered AI effect, with category filter tabs at the top (All,
 * Portrait, Creative, Color, Atmospheric). Each thumbnail renders a real
 * Skia preview of the effect's color matrix applied to the source image —
 * no CSS filters, no stubs (AGENTS.md §11).
 *
 * The selected effect is highlighted with a brand border (delegated to
 * EffectPreviewThumb's `selected` prop). Haptics fire on selection. Every
 * thumbnail enforces a 44pt touch target.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets, haptics on selection.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Space, Radius, Stroke, FontFamily, FontSize, Control } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { EffectPreviewThumb } from './EffectPreviewThumb';
import {
  type AIEffectCategory,
  type AIEffectDefinition,
  AI_EFFECT_CATEGORIES,
} from './AIEffectRegistry';
import {
  type EffectPreset,
  type EffectPresetCategory,
  type EffectNode,
  type MatrixNode,
  IDENTITY_MATRIX,
} from './EffectTypes';

// ── Types ──────────────────────────────────────────────────────────────

/** The filter tab key — 'all' or a specific category. */
type FilterTab = 'all' | AIEffectCategory;

export interface AIEffectGridProps {
  /** The effects to display (typically from getAllAIEffects()). */
  effects: AIEffectDefinition[];
  /** The id of the currently selected effect, or null if none. */
  selectedId: string | null;
  /** Called when the user selects an effect. */
  onSelect: (effectId: string) => void;
  /** Source image URI for the preview thumbnails. */
  sourceImageUri: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Map an AI effect category to the closest `EffectPresetCategory` so the
 * synthetic preset satisfies the EffectPreviewThumb type. The thumbnail
 * only uses the matrix, name, id, and version — the category is not
 * rendered, but must be type-valid.
 */
function mapCategory(category: AIEffectCategory): EffectPresetCategory {
  switch (category) {
    case 'portrait':
      return 'soft';
    case 'creative':
      return 'dramatic';
    case 'color':
      return 'vintage';
    case 'atmospheric':
      return 'cool';
    default:
      return 'original';
  }
}

/**
 * Extract a 4×5 thumbnail color matrix from an AI effect's render stack.
 * The full stack may contain matrix, adjust, blur, and grain nodes; the
 * thumbnail can only render a single ColorMatrix, so we use the first
 * `matrix` node (the dominant color grade). If the stack has no matrix
 * node, we fall back to the identity matrix — the thumbnail then shows the
 * ungraded image, which is truthful (the effect's visible color shift is
 * in non-matrix nodes the thumbnail cannot preview).
 */
function extractThumbnailMatrix(effect: AIEffectDefinition): number[] {
  const nodes: EffectNode[] = effect.render(1);
  const matrixNode = nodes.find((n): n is MatrixNode => n.type === 'matrix');
  if (matrixNode) return matrixNode.matrix;
  return [...IDENTITY_MATRIX];
}

/**
 * Build a synthetic `EffectPreset` from an `AIEffectDefinition` so it can
 * be rendered by `EffectPreviewThumb`. The preset's `nodes` carry the full
 * effect stack; `thumbnailMatrix` carries the preview matrix. `version` is
 * stable (1) — the registry is static per build.
 */
function aiEffectToPreset(effect: AIEffectDefinition): EffectPreset {
  return {
    id: effect.id,
    name: effect.name,
    category: mapCategory(effect.category),
    nodes: effect.render(1),
    intensity: 1,
    thumbnailMatrix: extractThumbnailMatrix(effect),
    version: 1,
  };
}

// ── Filter tab metadata ────────────────────────────────────────────────

interface TabMeta {
  key: FilterTab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const TAB_META: TabMeta[] = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'portrait', label: 'Portrait', icon: 'person-outline' },
  { key: 'creative', label: 'Creative', icon: 'color-palette-outline' },
  { key: 'color', label: 'Color', icon: 'color-filter-outline' },
  { key: 'atmospheric', label: 'Atmospheric', icon: 'cloud-outline' },
];

// ── Component ──────────────────────────────────────────────────────────

/**
 * 3-column grid of AI effect preview thumbnails with category filter tabs.
 */
export function AIEffectGrid({
  effects,
  selectedId,
  onSelect,
  sourceImageUri,
}: AIEffectGridProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Precompute synthetic presets once per effect set.
  const presets = useMemo(
    () => effects.map((e) => ({ effect: e, preset: aiEffectToPreset(e) })),
    [effects],
  );

  // Filter by the active category tab.
  const filtered = useMemo(() => {
    if (activeTab === 'all') return presets;
    return presets.filter(({ effect }) => effect.category === activeTab);
  }, [presets, activeTab]);

  const handleTabSwitch = useCallback(
    (tab: FilterTab) => {
      if (tab === activeTab) return;
      if (!reducedMotion) haptic.selection();
      setActiveTab(tab);
    },
    [activeTab, haptic, reducedMotion],
  );

  const handleSelect = useCallback(
    (effectId: string) => {
      if (!reducedMotion) haptic.light();
      onSelect(effectId);
    },
    [haptic, onSelect, reducedMotion],
  );

  const styles = useGridStyles(colors);

  return (
    <View style={styles.container}>
      {/* ── Category filter tabs ─────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TAB_META.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabSwitch(tab.key)}
              accessibilityLabel={`${tab.label} effects`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              style={[
                styles.tab,
                isActive && { borderColor: colors.brand, backgroundColor: colors.brandSubtle },
              ]}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={isActive ? colors.brand : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.brand : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── 3-column effect grid ─────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.effect.id}
        numColumns={3}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <EffectPreviewThumb
              sourceUri={sourceImageUri}
              preset={item.preset}
              selected={selectedId === item.effect.id}
              onPress={() => handleSelect(item.effect.id)}
              size={92}
            />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.gridContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No effects in this category
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
              Switch categories to browse more effects.
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

function useGridStyles(colors: ThemeColors) {
  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
        } as ViewStyle,
        tabBar: {
          flexDirection: 'row',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
        } as ViewStyle,
        tab: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: Space.sm,
          height: 32,
          borderRadius: Radius.full,
          borderWidth: Stroke.hairline,
          borderColor: colors.border,
        } as ViewStyle,
        tabLabel: {
          fontFamily: FontFamily.medium,
          fontSize: FontSize.caption,
        } as ViewStyle,
        gridContent: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.lg,
        } as ViewStyle,
        row: {
          gap: Space.sm,
          justifyContent: 'flex-start',
        } as ViewStyle,
        cell: {
          flex: 1,
          alignItems: 'center',
          minHeight: Control.hit,
        } as ViewStyle,
        rowSeparator: {
          height: Space.sm,
        } as ViewStyle,
        emptyState: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: Space.xl,
          gap: Space.sm,
        } as ViewStyle,
        emptyTitle: {
          fontFamily: FontFamily.semibold,
          fontSize: FontSize.body,
        } as ViewStyle,
        emptyHint: {
          fontFamily: FontFamily.regular,
          fontSize: FontSize.caption,
          textAlign: 'center',
        } as ViewStyle,
      }),
    [colors],
  );
}

export default AIEffectGrid;
