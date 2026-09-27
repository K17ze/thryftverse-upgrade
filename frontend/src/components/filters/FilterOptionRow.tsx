import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { createFilterStyles } from './filterStyles';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** 'radio' — single-select lists (sort, condition, price presets);
   *  'checkbox' — multi-select lists (brand, size). */
  role: 'radio' | 'checkbox';
  /** 'row' spans the option list; 'cell' shares a two-column grid row. */
  layout?: 'row' | 'cell';
  /** Hairline separator under the option — omit on the last row. */
  showDivider?: boolean;
  /** Hairline at the leading edge — the second column of a grid row. */
  showLeadingDivider?: boolean;
  /** Quiet leading marker (e.g. the saved-size star). */
  marker?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// Quiet selectable option — the sheet's single option grammar. A hairline-
// separated row (or half-width grid cell) with the label doing the work and
// selection expressed as a brand check (radio) or a hairline checkbox
// square (multi-select), matching the auction FilterSheet idiom.
// No fills, no pills, no boxed options; 44pt target, 14–22pt visuals.
function FilterOptionRowBase({
  label,
  selected,
  onPress,
  onLongPress,
  role,
  layout = 'row',
  showDivider = true,
  showLeadingDivider = false,
  marker,
  accessibilityLabel,
  accessibilityHint }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <AnimatedPressable
      style={[
        layout === 'cell' ? styles.optionCell : styles.optionRow,
        showDivider && styles.optionDivider,
        showLeadingDivider && styles.optionCellDivider]}
      onPress={onPress}
      onLongPress={onLongPress}
      disableAnimation
      activeOpacity={0.6}
      hapticFeedback={role === 'radio' ? 'selection' : 'light'}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
    >
      {marker}
      <Text
        style={[styles.optionText, selected && styles.optionTextSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {role === 'radio' ? (
        // Fixed slot so the label never reflows when the check toggles.
        <View style={styles.optionCheckSlot}>
          {selected ? (
            <Ionicons name="checkmark" size={18} color={colors.brand} aria-hidden={true} />
          ) : null}
        </View>
      ) : (
        <View style={[styles.optionCheckbox, selected && styles.optionCheckboxSelected]}>
          {selected ? (
            <Ionicons name="checkmark" size={14} color={colors.brand} aria-hidden={true} />
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const FilterOptionRow = React.memo(FilterOptionRowBase);
FilterOptionRow.displayName = 'FilterOptionRow';
export { FilterOptionRow };
