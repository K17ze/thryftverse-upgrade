import React, { memo, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { BottomSheet } from '../BottomSheet';
import { haptics } from '../../utils/haptics';
import { Space, Radius, Typography, Type, Stroke, LetterSpacing } from '../../theme/designTokens';
import {
  SORT_OPTIONS,
  PRICE_PRESETS,
  type AuctionBrowseState,
  type AuctionBrowseSort,
} from '../../utils/auctionHomeLogic';

// ════════════════════════════════════════════════════════════════
// FILTER SHEET — redesigned with hierarchical categories, checkmarked
// sort rows, price range/presets, and bottom CTA with count
// ════════════════════════════════════════════════════════════════
export const FilterSheet = memo(function FilterSheet({
  visible,
  onDismiss,
  categoryOptions,
  categoryLabels,
  categoryCounts,
  draftBrowse,
  setDraftBrowse,
  onReset,
  onApply,
  resultCount,
  facetsLoading,
}: {
  visible: boolean;
  onDismiss: () => void;
  categoryOptions: string[];
  categoryLabels?: Record<string, string>;
  categoryCounts?: Record<string, number>;
  draftBrowse: AuctionBrowseState;
  setDraftBrowse: React.Dispatch<React.SetStateAction<AuctionBrowseState>>;
  onReset: () => void;
  onApply: () => void;
  resultCount?: number;
  facetsLoading?: boolean;
}) {
  const { colors } = useAppTheme();
  const { currencySymbol, formatFromFiat } = useFormattedPrice();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (draftBrowse.sort !== 'recommended') n++;
    n += draftBrowse.categories.length;
    if (draftBrowse.priceMin != null) n++;
    if (draftBrowse.priceMax != null) n++;
    return n;
  }, [draftBrowse]);

  const toggleCategory = useCallback((cat: string) => {
    haptics.tap();
    setDraftBrowse((prev) => {
      const has = prev.categories.includes(cat);
      return {
        ...prev,
        categories: has
          ? prev.categories.filter((c) => c !== cat)
          : [...prev.categories, cat],
      };
    });
  }, [setDraftBrowse]);

  const setSort = useCallback((sort: AuctionBrowseSort) => {
    haptics.tap();
    setDraftBrowse((prev) => ({ ...prev, sort }));
  }, [setDraftBrowse]);

  const applyPricePreset = useCallback((preset: { min?: number; max?: number }) => {
    haptics.tap();
    setDraftBrowse((prev) => ({ ...prev, priceMin: preset.min, priceMax: preset.max }));
  }, [setDraftBrowse]);

  const clearPrice = useCallback(() => {
    haptics.tap();
    setDraftBrowse((prev) => ({ ...prev, priceMin: undefined, priceMax: undefined }));
  }, [setDraftBrowse]);

  const priceLabel = useMemo(() => {
    if (draftBrowse.priceMin != null && draftBrowse.priceMax != null) {
      return `${formatFromFiat(draftBrowse.priceMin)} – ${formatFromFiat(draftBrowse.priceMax)}`;
    }
    if (draftBrowse.priceMin != null) return `Over ${formatFromFiat(draftBrowse.priceMin)}`;
    if (draftBrowse.priceMax != null) return `Under ${formatFromFiat(draftBrowse.priceMax)}`;
    return 'Any price';
  }, [draftBrowse.priceMin, draftBrowse.priceMax, formatFromFiat]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={styles.filterSheetContent}>
        <Text style={styles.filterSheetTitle}>Filter & Sort</Text>

        {/* ── Sort: checkmarked rows ── */}
        <Text style={styles.filterSectionLabel}>Sort</Text>
        <View style={styles.filterSortRows}>
          {SORT_OPTIONS.map((opt) => {
            const selected = draftBrowse.sort === opt.key;
            return (
              <Pressable
                key={opt.key}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => [
                  styles.filterSortRow,
                  pressed && styles.filterOptionPressed,
                ]}
                onPress={() => setSort(opt.key)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${opt.label}`}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterSortRowText, selected && styles.filterSortRowTextActive]}>
                  {opt.label}
                </Text>
                {selected && (
                  <Ionicons name="checkmark" size={18} color={colors.brand} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ── Price range: presets + current label ── */}
        <Text style={styles.filterSectionLabel}>Price</Text>
        <View style={styles.filterPricePresets}>
          <Pressable
            style={({ pressed }) => [
              styles.filterPriceChip,
              draftBrowse.priceMin == null && draftBrowse.priceMax == null && styles.filterPriceChipActive,
              pressed && styles.filterOptionPressed,
            ]}
            onPress={clearPrice}
            accessibilityRole="button"
            accessibilityLabel="Any price"
            accessibilityState={{ selected: draftBrowse.priceMin == null && draftBrowse.priceMax == null }}
          >
            <Text style={[styles.filterPriceChipText, draftBrowse.priceMin == null && draftBrowse.priceMax == null && styles.filterPriceChipTextActive]}>
              Any
            </Text>
          </Pressable>
          {PRICE_PRESETS.map((preset) => {
            const selected = draftBrowse.priceMin === preset.min && draftBrowse.priceMax === preset.max;
            const presetLabel = preset.min != null && preset.max != null
              ? `${currencySymbol}${preset.min} – ${currencySymbol}${preset.max}`
              : preset.max != null
                ? `Under ${currencySymbol}${preset.max}`
                : `Over ${currencySymbol}${preset.min}`;
            return (
              <Pressable
                key={presetLabel}
                style={({ pressed }) => [
                  styles.filterPriceChip,
                  selected && styles.filterPriceChipActive,
                  pressed && styles.filterOptionPressed,
                ]}
                onPress={() => applyPricePreset(preset)}
                accessibilityRole="button"
                accessibilityLabel={presetLabel}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterPriceChipText, selected && styles.filterPriceChipTextActive]}>
                  {presetLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.filterPriceCurrent}>{priceLabel}</Text>

        {/* ── Categories: hierarchical checkmarked rows ── */}
        {categoryOptions.length > 0 && (
          <>
            <Text style={styles.filterSectionLabel}>Categories</Text>
            <View style={styles.filterCategoryList}>
              {categoryOptions.map((cat) => {
                const selected = draftBrowse.categories.includes(cat);
                const displayLabel = categoryLabels?.[cat] ?? cat;
                const count = categoryCounts?.[cat];
                return (
                  <Pressable
                    key={cat}
                    style={({ pressed }) => [
                      styles.filterCategoryRow,
                      pressed && styles.filterOptionPressed,
                    ]}
                    onPress={() => toggleCategory(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={`Category ${displayLabel}${count != null ? `, ${count} auctions` : ''}`}
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.filterCategoryRowLabel}>
                      <Text style={[styles.filterCategoryRowText, selected && styles.filterCategoryRowTextActive]}>
                        {displayLabel}
                      </Text>
                      {count != null && (
                        <Text style={styles.filterCategoryCount}>{count}</Text>
                      )}
                    </View>
                    <View style={styles.filterCheckbox}>
                      {selected && <Ionicons name="checkmark" size={16} color={colors.brand} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* ── Bottom CTA with result count ── */}
        <View style={styles.filterActionsRow}>
          <Pressable
            style={styles.filterResetBtn}
            onPress={onReset}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
          >
            <Text style={styles.filterResetText}>Reset</Text>
          </Pressable>
          <Pressable
            style={styles.filterApplyBtn}
            onPress={onApply}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              resultCount != null
                ? `Show ${resultCount} results`
                : activeCount > 0
                  ? `Show ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'}`
                  : 'Show results'
            }
          >
            <Text style={styles.filterApplyText}>
              {resultCount != null
                ? `Show ${resultCount} ${resultCount === 1 ? 'result' : 'results'}`
                : activeCount > 0
                  ? `Show ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'}`
                  : 'Show results'
              }
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    filterSheetContent: {
      padding: Space.lg,
    },
    filterSheetTitle: {
      fontSize: Type.priceList.size,
      fontWeight: '700',
      color: colors.textPrimary,
      fontFamily: Typography.family.bold,
      marginBottom: Space.lg,
    },
    filterSectionLabel: {
      fontSize: Type.caption.size,
      fontWeight: '600',
      letterSpacing: LetterSpacing.wide + 0.08,
      color: colors.textSecondary,
      fontFamily: Typography.family.semibold,
      marginBottom: Space.sm,
      marginTop: Space.md,
    },
    filterOptionPressed: {
      opacity: 0.7,
    },

    // ── Sort rows (checkmarked) ──
    filterSortRows: {
      gap: 0,
    },
    filterSortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.sm,
    },
    filterSortRowText: {
      fontSize: Type.body.size,
      color: colors.textPrimary,
      fontFamily: Typography.family.medium,
    },
    filterSortRowTextActive: {
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },

    // ── Price presets ──
    filterPricePresets: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    filterPriceChip: {
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      backgroundColor: colors.surface,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    filterPriceChipActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    filterPriceChipText: {
      fontSize: Type.caption.size,
      color: colors.textPrimary,
      fontFamily: Typography.family.medium,
    },
    filterPriceChipTextActive: {
      color: colors.textInverse,
    },
    filterPriceCurrent: {
      fontSize: Type.caption.size,
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      marginTop: Space.sm,
    },

    // ── Category rows (hierarchical with checkboxes) ──
    filterCategoryList: {
      gap: 0,
    },
    filterCategoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.sm,
    },
    filterCategoryRowText: {
      fontSize: Type.body.size,
      color: colors.textPrimary,
      fontFamily: Typography.family.medium,
    },
    filterCategoryRowTextActive: {
      fontFamily: Typography.family.semibold,
    },
    filterCategoryRowLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      flex: 1,
    },
    filterCategoryCount: {
      fontSize: Type.caption.size,
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      fontVariant: ['tabular-nums'],
    },
    filterCheckbox: {
      width: 22,
      height: 22,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Filter actions ──
    filterActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: Space.xl,
    },
    filterResetBtn: {
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    filterResetText: {
      fontSize: Type.body.size,
      color: colors.textSecondary,
      fontFamily: Typography.family.medium,
    },
    filterApplyBtn: {
      flex: 1,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      alignItems: 'center',
      marginLeft: Space.md,
    },
    filterApplyText: {
      fontSize: Type.body.size,
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
    },
  });
}
