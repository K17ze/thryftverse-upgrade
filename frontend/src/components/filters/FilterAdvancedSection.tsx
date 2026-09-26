import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { haptics } from '../../utils/haptics';
import { FilterSection } from './FilterSection';
import { FilterOptionRow } from './FilterOptionRow';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  priceMin: string;
  priceMax: string;
  /** Applies a quick range preset to the existing min/max fields. */
  onSelectPreset: (min: string, max: string) => void;
}

// Advanced section — quick price range presets as a two-column grid of
// quiet cells. Rendered only when the advanced_filters feature flag is on
// (gating lives in the screen), and acts as a progressive-disclosure
// shortcut writing the existing priceMin/priceMax fields.
function FilterAdvancedSectionBase({ expanded, onToggle, priceMin, priceMax, onSelectPreset }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const { currencySymbol } = useFormattedPrice();

  const presets = React.useMemo(
    () => [
      { label: `Under ${currencySymbol}20`, min: '', max: '20' },
      { label: `${currencySymbol}20 – ${currencySymbol}50`, min: '20', max: '50' },
      { label: `${currencySymbol}50 – ${currencySymbol}100`, min: '50', max: '100' },
      { label: `${currencySymbol}100+`, min: '100', max: '' },
    ],
    [currencySymbol],
  );

  const gridRows = React.useMemo(() => {
    const rows: Array<typeof presets> = [];
    for (let i = 0; i < presets.length; i += 2) {
      rows.push(presets.slice(i, i + 2));
    }
    return rows;
  }, [presets]);

  return (
    <FilterSection sectionKey="advanced" title="Advanced" expanded={expanded} onToggle={onToggle}>
      <View style={styles.optionList}>
        {gridRows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            style={[styles.optionGridRow, rowIndex < gridRows.length - 1 && styles.optionDivider]}
          >
            {row.map((preset, colIndex) => {
              const isActive = priceMin === preset.min && priceMax === preset.max;
              return (
                <FilterOptionRow
                  key={preset.label}
                  layout="cell"
                  role="radio"
                  label={preset.label}
                  selected={isActive}
                  showDivider={false}
                  showLeadingDivider={colIndex === 1}
                  onPress={() => {
                    haptics.press();
                    onSelectPreset(preset.min, preset.max);
                  }}
                  accessibilityLabel={`Apply price preset: ${preset.label}`}
                />
              );
            })}
          </View>
        ))}
      </View>
    </FilterSection>
  );
}

const FilterAdvancedSection = React.memo(FilterAdvancedSectionBase);
FilterAdvancedSection.displayName = 'FilterAdvancedSection';
export { FilterAdvancedSection };
