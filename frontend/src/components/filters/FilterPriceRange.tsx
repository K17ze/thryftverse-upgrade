import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { FilterSection } from './FilterSection';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  /** Raw input strings — empty string means "no bound" (matches store semantics). */
  priceMin: string;
  priceMax: string;
  onChangeMin: (next: string) => void;
  onChangeMax: (next: string) => void;
}

// Price Range section — paired min/max numeric inputs.
function FilterPriceRangeBase({ expanded, onToggle, priceMin, priceMax, onChangeMin, onChangeMax }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  return (
    <FilterSection
      sectionKey="price"
      title="Price Range"
      expanded={expanded}
      onToggle={onToggle}
      count={[priceMin.trim() !== '', priceMax.trim() !== ''].filter(Boolean).length}
    >
      <View style={styles.priceRangeRow}>
        <View style={styles.priceInputWrap}>
          <Text style={styles.priceInputLabel}>Min</Text>
          <TextInput
            style={styles.priceInput}
            placeholder={formatFromFiat(0, 'GBP')}
            placeholderTextColor={colors.textMuted}
            value={priceMin}
            onChangeText={onChangeMin}
            keyboardType="numeric"
            returnKeyType="done"
            accessibilityLabel="Minimum price in pounds"
          />
        </View>
        <Text style={styles.priceRangeDash}>—</Text>
        <View style={styles.priceInputWrap}>
          <Text style={styles.priceInputLabel}>Max</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="No limit"
            placeholderTextColor={colors.textMuted}
            value={priceMax}
            onChangeText={onChangeMax}
            keyboardType="numeric"
            returnKeyType="done"
            accessibilityLabel="Maximum price in pounds"
          />
        </View>
      </View>
    </FilterSection>
  );
}

const FilterPriceRange = React.memo(FilterPriceRangeBase);
FilterPriceRange.displayName = 'FilterPriceRange';
export { FilterPriceRange };
