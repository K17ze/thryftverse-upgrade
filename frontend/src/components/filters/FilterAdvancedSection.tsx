import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { haptics } from '../../utils/haptics';
import { FilterSection } from './FilterSection';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  priceMin: string;
  priceMax: string;
  /** Applies a quick range preset to the existing min/max fields. */
  onSelectPreset: (min: string, max: string) => void;
}

// Advanced section — quick price range presets. Rendered only when the
// advanced_filters feature flag is on (gating lives in the screen), and acts
// as a progressive-disclosure shortcut writing the existing priceMin/priceMax
// fields.
function FilterAdvancedSectionBase({ expanded, onToggle, priceMin, priceMax, onSelectPreset }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const { currencySymbol } = useFormattedPrice();

  return (
    <FilterSection sectionKey="advanced" title="Advanced" expanded={expanded} onToggle={onToggle}>
      <View style={styles.wrapContainer}>
        {[
          { label: `Under ${currencySymbol}20`, min: '', max: '20' },
          { label: `${currencySymbol}20 – ${currencySymbol}50`, min: '20', max: '50' },
          { label: `${currencySymbol}50 – ${currencySymbol}100`, min: '50', max: '100' },
          { label: `${currencySymbol}100+`, min: '100', max: '' },
        ].map((preset) => {
          const isActive = priceMin === preset.min && priceMax === preset.max;
          return (
            <AppButton
              key={preset.label}
              title={preset.label}
              variant="secondary"
              size="sm"
              style={[styles.chip, isActive && styles.chipActive]}
              titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
              onPress={() => {
                haptics.press();
                onSelectPreset(preset.min, preset.max);
              }}
              accessibilityLabel={`Apply price preset: ${preset.label}`}
            />
          );
        })}
      </View>
    </FilterSection>
  );
}

const FilterAdvancedSection = React.memo(FilterAdvancedSectionBase);
FilterAdvancedSection.displayName = 'FilterAdvancedSection';
export { FilterAdvancedSection };
