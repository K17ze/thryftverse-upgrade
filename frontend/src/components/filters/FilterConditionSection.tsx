import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { FilterSection } from './FilterSection';
import { FilterOptionRow } from './FilterOptionRow';
import type { ConditionOption } from './filterTypes';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  value: ConditionOption;
  onChange: (next: ConditionOption) => void;
}

// Condition section — single-select radio list fed by the taxonomy
// conditions, prefixed with "Any". Same row grammar as sort; the collapsed
// header echoes the chosen condition.
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
      summary={value !== 'Any' ? value : undefined}
    >
      <View style={styles.optionList}>
        {conditionOptions.map((option, index) => (
          <FilterOptionRow
            key={option.value}
            role="radio"
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
            showDivider={index < conditionOptions.length - 1}
            accessibilityLabel={option.accessibilityLabel}
          />
        ))}
      </View>
    </FilterSection>
  );
}

const FilterConditionSection = React.memo(FilterConditionSectionBase);
FilterConditionSection.displayName = 'FilterConditionSection';
export { FilterConditionSection };
