import React from 'react';
import { ScrollView } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppSegmentControl } from '../ui/AppSegmentControl';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { FilterSection } from './FilterSection';
import type { ConditionOption } from './filterTypes';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  value: ConditionOption;
  onChange: (next: ConditionOption) => void;
}

// Condition section — horizontal segmented control fed by the taxonomy
// conditions, prefixed with "Any".
function FilterConditionSectionBase({ expanded, onToggle, value, onChange }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const { conditions } = useTaxonomy();
  const conditionOptions = React.useMemo(() => [
    { value: 'Any' as const, label: 'Any', accessibilityLabel: 'Any condition' },
    ...conditions.map(c => ({
      value: c.name as ConditionOption,
      label: c.name,
      accessibilityLabel: c.name })),
  ], [conditions]);

  return (
    <FilterSection
      sectionKey="condition"
      title="Condition"
      expanded={expanded}
      onToggle={onToggle}
      count={value !== 'Any' ? 1 : 0}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
        <AppSegmentControl
          options={conditionOptions}
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

const FilterConditionSection = React.memo(FilterConditionSectionBase);
FilterConditionSection.displayName = 'FilterConditionSection';
export { FilterConditionSection };
