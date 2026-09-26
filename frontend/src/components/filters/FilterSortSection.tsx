import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { FilterSection } from './FilterSection';
import { FilterOptionRow } from './FilterOptionRow';
import type { SortOption } from './filterTypes';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  options: Array<{ value: SortOption; label: string; accessibilityLabel: string }>;
  value: SortOption;
  onChange: (next: SortOption) => void;
}

// Sort section — single-select radio list. Hairline-separated rows with a
// check on the selected option (the auction FilterSheet idiom); the
// collapsed header echoes the active sort instead of hiding it.
function FilterSortSectionBase({ expanded, onToggle, options, value, onChange }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <FilterSection
      sectionKey="sort"
      title="Sort By"
      expanded={expanded}
      onToggle={onToggle}
      summary={options.find((option) => option.value === value)?.label}
    >
      <View style={styles.optionList}>
        {options.map((option, index) => (
          <FilterOptionRow
            key={option.value}
            role="radio"
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
            showDivider={index < options.length - 1}
            accessibilityLabel={option.accessibilityLabel}
          />
        ))}
      </View>
    </FilterSection>
  );
}

const FilterSortSection = React.memo(FilterSortSectionBase);
FilterSortSection.displayName = 'FilterSortSection';
export { FilterSortSection };
