import React from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { createVisualSearchStyles } from './visualSearchStyles';
import { FacetChipRail } from './FacetChipRail';
import { COLOR_FACETS, STYLE_FACETS } from './visualSearchTypes';

interface Props {
  description: string;
  onChangeDescription: (value: string) => void;
  availableCategories: Array<{ category: string; count: number }>;
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  selectedColor: string | null;
  onSelectColor: (color: string | null) => void;
  colorCounts?: Record<string, number>;
  selectedStyle: string | null;
  onSelectStyle: (style: string | null) => void;
  styleCounts?: Record<string, number>;
  brand: string;
  onChangeBrand: (value: string) => void;
  minPrice: string;
  onChangeMinPrice: (value: string) => void;
  maxPrice: string;
  onChangeMaxPrice: (value: string) => void;
  currencySymbol: string;
  brandSuggestions: string[];
  hasActiveFilters: boolean;
  onApply: () => void;
  onClear: () => void;
}

// ── Multi-modal refinement bar ────────────────────────────────────────────
// Text description + category rail + F08 colour/style facet rails +
// brand/price fields. Facets are retrieval-scoped — sent to the backend with
// the search request; counts come from the response, never derived locally.
function VisualSearchRefinementBarBase({
  description,
  onChangeDescription,
  availableCategories,
  selectedCategory,
  onSelectCategory,
  selectedColor,
  onSelectColor,
  colorCounts,
  selectedStyle,
  onSelectStyle,
  styleCounts,
  brand,
  onChangeBrand,
  minPrice,
  onChangeMinPrice,
  maxPrice,
  onChangeMaxPrice,
  currencySymbol,
  brandSuggestions,
  hasActiveFilters,
  onApply,
  onClear,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVisualSearchStyles(colors), [colors]);
  const haptic = useHaptic();

  return (
    <View style={styles.refinementWrap}>
      <Text style={styles.refinementLabel}>Describe your photo</Text>
      <View style={styles.textInputWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.textInputIcon} />
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={onChangeDescription}
          placeholder="e.g. black leather jacket"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.brand}
          returnKeyType="search"
          onSubmitEditing={onApply}
          accessibilityLabel="Describe the item in your photo"
        />
        {description.length > 0 && (
          <AnimatedPressable onPress={() => { haptic.light(); onChangeDescription(''); }} hitSlop={12} accessibilityLabel="Clear description" accessibilityRole="button" accessibilityHint="Clears the description text">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        )}
      </View>

      {availableCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryRail}
          contentContainerStyle={styles.categoryRailContent}
        >
          <AnimatedPressable
            style={[styles.categoryPill, !selectedCategory && styles.categoryPillActive]}
            onPress={() => { haptic.selection(); onSelectCategory(null); }}
            activeOpacity={0.85}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="All categories"
            accessibilityHint="Clears the category filter to show all categories"
            accessibilityState={{ selected: !selectedCategory }}
          >
            <Text style={[styles.categoryPillText, !selectedCategory && styles.categoryPillTextActive]}>All</Text>
          </AnimatedPressable>
          {availableCategories.map(({ category, count }, idx) => {
            const active = selectedCategory === category;
            return (
              <AnimatedPressable
                key={`vscat-${idx}-${category}`}
                style={[styles.categoryPill, active && styles.categoryPillActive]}
                onPress={() => { haptic.selection(); onSelectCategory(active ? null : category); }}
                activeOpacity={0.85}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${category}, ${count} items`}
                accessibilityHint={`Filters results to ${category} category`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{category}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      )}

      {/* F08: Color facet chips — retrieval-scoped; counts come from the
          backend response (`facetCounts`), never derived locally. */}
      <FacetChipRail
        values={COLOR_FACETS}
        selectedValue={selectedColor}
        counts={colorCounts}
        onSelect={onSelectColor}
        allText="All colours"
        allAccessibilityLabel="All colors"
        labelSuffix=""
        keyPrefix="vscol"
      />

      {/* F08: Style facet chips — retrieval-scoped; counts come from the
          backend response (`facetCounts`), never derived locally. */}
      <FacetChipRail
        values={STYLE_FACETS}
        selectedValue={selectedStyle}
        counts={styleCounts}
        onSelect={onSelectStyle}
        allText="All styles"
        allAccessibilityLabel="All styles"
        labelSuffix=" style"
        keyPrefix="vsstyle"
      />

      <View style={styles.filterRow}>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Brand</Text>
          <TextInput
            style={styles.filterInput}
            value={brand}
            onChangeText={onChangeBrand}
            placeholder="Any brand"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.brand}
            returnKeyType="done"
            accessibilityLabel="Filter by brand"
          />
        </View>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Min {currencySymbol}</Text>
          <TextInput
            style={styles.filterInput}
            value={minPrice}
            onChangeText={onChangeMinPrice}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            selectionColor={colors.brand}
            returnKeyType="done"
            accessibilityLabel="Minimum price in pounds"
          />
        </View>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Max {currencySymbol}</Text>
          <TextInput
            style={styles.filterInput}
            value={maxPrice}
            onChangeText={onChangeMaxPrice}
            placeholder="Any"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            selectionColor={colors.brand}
            returnKeyType="done"
            accessibilityLabel="Maximum price in pounds"
          />
        </View>
      </View>

      {brandSuggestions.length > 0 && brand.trim().length === 0 && (
        <View style={styles.suggestionRow}>
          <Text style={styles.suggestionLabel}>Popular:</Text>
          {brandSuggestions.slice(0, 4).map((b) => (
            <AnimatedPressable
              key={b}
              style={styles.suggestionChip}
              onPress={() => { haptic.selection(); onChangeBrand(b); }}
              activeOpacity={0.85}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Set brand to ${b}`}
              accessibilityHint={`Filters results to ${b} brand`}
            >
              <Text style={styles.suggestionText}>{b}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      <View style={styles.refinementActions}>
        <AppButton
          title="Apply filters"
          variant="primary"
          size="md"
          onPress={onApply}
          style={styles.applyBtn}
        />
        {hasActiveFilters && (
          <AnimatedPressable
            style={styles.clearBtn}
            onPress={onClear}
            activeOpacity={0.85}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            accessibilityHint="Resets all filter fields and re-runs the search"
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const VisualSearchRefinementBar = React.memo(VisualSearchRefinementBarBase);
VisualSearchRefinementBar.displayName = 'VisualSearchRefinementBar';
export { VisualSearchRefinementBar };
