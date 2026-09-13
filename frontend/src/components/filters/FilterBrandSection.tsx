import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';
import { FilterSection } from './FilterSection';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  /** Distinct brand values present in the current listing snapshot. */
  brandOptions: string[];
  selectedBrands: string[];
  onToggleBrand: (brand: string) => void;
}

// Brand section — wrapping chip cloud with a "See all" expansion affordance.
// Owns the collapsed-to-8 window state; selection lives upstream.
function FilterBrandSectionBase({ expanded, onToggle, brandOptions, selectedBrands, onToggleBrand }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const [showAllBrands, setShowAllBrands] = useState(false);

  const visibleBrandOptions = React.useMemo(() => {
    if (showAllBrands) {
      return brandOptions;
    }

    return brandOptions.slice(0, 8);
  }, [brandOptions, showAllBrands]);

  return (
    <FilterSection
      sectionKey="brand"
      title="Brand"
      expanded={expanded}
      onToggle={onToggle}
      count={selectedBrands.length}
    >
      {brandOptions.length > 8 ? (
        <View style={styles.seeAllRow}>
          <AppButton
            title={showAllBrands ? 'Show less' : 'See all'}
            onPress={() => setShowAllBrands((current) => !current)}
            variant="secondary"
            size="sm"
            style={styles.seeAllBtn}
            titleStyle={styles.seeAllText}
            accessibilityLabel={showAllBrands ? 'Show fewer brand options' : 'Show all brand options'}
          />
        </View>
      ) : null}
      <View style={styles.wrapContainer}>
        {visibleBrandOptions.length > 0 ? (
          visibleBrandOptions.map(b => {
            const isActive = selectedBrands.includes(b);
            return (
              <AppButton
                key={b}
                title={b}
                variant="secondary"
                size="sm"
                style={[styles.chip, isActive && styles.chipActive]}
                titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
                onPress={() => onToggleBrand(b)}
                accessibilityLabel={`Toggle brand filter ${b}`}
              />
            );
          })
        ) : (
          <Text style={styles.emptySectionText}>No brands in this category yet.</Text>
        )}
      </View>
    </FilterSection>
  );
}

const FilterBrandSection = React.memo(FilterBrandSectionBase);
FilterBrandSection.displayName = 'FilterBrandSection';
export { FilterBrandSection };
