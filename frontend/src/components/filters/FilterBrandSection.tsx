import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';
import { FilterSection } from './FilterSection';
import { FilterOptionRow } from './FilterOptionRow';
import { createFilterStyles } from './filterStyles';

/** A selectable brand row — `keywords` carry the taxonomy synonyms/display
 *  keys so in-facet search matches "lv" → "Louis Vuitton". */
export interface BrandOption {
  name: string;
  keywords: string[];
}

interface Props {
  expanded: boolean;
  onToggle: () => void;
  /** Curated taxonomy brands merged with any snapshot-only values. */
  brandOptions: BrandOption[];
  selectedBrands: string[];
  onToggleBrand: (brand: string) => void;
}

// Brand section — searchable checkbox list backed by the curated brand
// taxonomy. Selected brands pin to the top so they stay visible while
// searching; the collapsed window shows the first 8.
function FilterBrandSectionBase({ expanded, onToggle, brandOptions, selectedBrands, onToggleBrand }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [showAllBrands, setShowAllBrands] = useState(false);

  const orderedOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? brandOptions.filter((option) =>
          option.name.toLowerCase().includes(q) ||
          option.keywords.some((keyword) => keyword.toLowerCase().includes(q)))
      : brandOptions;
    const selected = filtered.filter((option) => selectedBrands.includes(option.name));
    const rest = filtered.filter((option) => !selectedBrands.includes(option.name));
    return [...selected, ...rest];
  }, [brandOptions, query, selectedBrands]);

  const isFiltering = query.trim().length > 0;
  const visibleBrandOptions =
    isFiltering || showAllBrands ? orderedOptions : orderedOptions.slice(0, 8);

  return (
    <FilterSection
      sectionKey="brand"
      title="Brand"
      expanded={expanded}
      onToggle={onToggle}
      count={selectedBrands.length}
    >
      {brandOptions.length > 8 ? (
        <View style={styles.brandSearchWrap}>
          <Ionicons
            name="search-outline"
            size={16}
            color={colors.textMuted}
            style={styles.brandSearchIcon}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search brands"
            placeholderTextColor={colors.textMuted}
            style={styles.brandSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search brands"
          />
          {isFiltering ? (
            <AppButton
              title="Clear"
              variant="secondary"
              size="sm"
              style={styles.brandSearchClear}
              titleStyle={styles.seeAllText}
              onPress={() => setQuery('')}
              accessibilityLabel="Clear brand search"
            />
          ) : null}
        </View>
      ) : null}
      {visibleBrandOptions.length > 0 ? (
        <View style={styles.optionList}>
          {visibleBrandOptions.map((option, index) => (
            <FilterOptionRow
              key={option.name}
              role="checkbox"
              label={option.name}
              selected={selectedBrands.includes(option.name)}
              onPress={() => onToggleBrand(option.name)}
              showDivider={index < visibleBrandOptions.length - 1}
              accessibilityLabel={`Toggle brand filter ${option.name}`}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptySectionText}>
          {isFiltering ? `No brands match "${query.trim()}".` : 'No brands in this category yet.'}
        </Text>
      )}
      {!isFiltering && brandOptions.length > 8 ? (
        <View style={styles.seeAllRow}>
          <AppButton
            title={showAllBrands ? 'Show less' : `See all ${brandOptions.length} brands`}
            onPress={() => setShowAllBrands((current) => !current)}
            variant="secondary"
            size="sm"
            style={styles.seeAllBtn}
            titleStyle={styles.seeAllText}
            accessibilityLabel={showAllBrands ? 'Show fewer brand options' : 'Show all brand options'}
          />
        </View>
      ) : null}
    </FilterSection>
  );
}

const FilterBrandSection = React.memo(FilterBrandSectionBase);
FilterBrandSection.displayName = 'FilterBrandSection';
export { FilterBrandSection };
