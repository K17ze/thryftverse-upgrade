import React from 'react';
import { ScrollView } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppSegmentControl, type AppSegmentOption } from '../ui/AppSegmentControl';
import { FilterSection } from './FilterSection';
import type { SortOption } from './filterTypes';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  options: AppSegmentOption<SortOption>[];
  value: SortOption;
  onChange: (next: SortOption) => void;
}

// Sort section — horizontal segmented control of sort options.
function FilterSortSectionBase({ expanded, onToggle, options, value, onChange }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <FilterSection sectionKey="sort" title="Sort By" expanded={expanded} onToggle={onToggle}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
        <AppSegmentControl
          options={options}
          value={value}
          onChange={onChange}
          optionStyle={styles.chip}
          optionActiveStyle={styles.chipActive}
          optionTextStyle={styles.chipText}
          optionTextActiveStyle={styles.chipTextActive}
        />
      </ScrollView>
    </FilterSection>
  );
}

const FilterSortSection = React.memo(FilterSortSectionBase);
FilterSortSection.displayName = 'FilterSortSection';
export { FilterSortSection };
