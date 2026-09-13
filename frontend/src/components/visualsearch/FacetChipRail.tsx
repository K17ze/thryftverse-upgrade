import React from 'react';
import { Text, ScrollView } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { createVisualSearchStyles } from './visualSearchStyles';

interface Props {
  /** Facet vocabulary rendered as chips (COLOR_FACETS / STYLE_FACETS). */
  values: readonly string[];
  selectedValue: string | null;
  /** Per-value candidate counts from the backend; absent values render no count. */
  counts?: Record<string, number>;
  onSelect: (value: string | null) => void;
  /** Visible label of the leading "all" chip. */
  allText: string;
  /** Accessibility label of the leading "all" chip. */
  allAccessibilityLabel: string;
  /** Suffix appended after the value in item a11y labels (e.g. " style"). */
  labelSuffix: string;
  /** Stable key prefix for item chips (preserves pre-extraction keys). */
  keyPrefix: string;
}

// F08: Facet chip rail — retrieval-scoped; counts come from the backend
// response (`facetCounts`), never derived locally. Used for both the colour
// and style rails, which share identical structure and differ only in copy.
function FacetChipRailBase({
  values,
  selectedValue,
  counts,
  onSelect,
  allText,
  allAccessibilityLabel,
  labelSuffix,
  keyPrefix,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVisualSearchStyles(colors), [colors]);
  const haptic = useHaptic();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.categoryRail}
      contentContainerStyle={styles.categoryRailContent}
    >
      <AnimatedPressable
        style={[styles.categoryPill, !selectedValue && styles.categoryPillActive]}
        onPress={() => { haptic.selection(); onSelect(null); }}
        activeOpacity={0.85}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={allAccessibilityLabel}
        accessibilityState={{ selected: !selectedValue }}
      >
        <Text style={[styles.categoryPillText, !selectedValue && styles.categoryPillTextActive]}>{allText}</Text>
      </AnimatedPressable>
      {values.map((value) => {
        const active = selectedValue === value;
        const count = counts?.[value];
        return (
          <AnimatedPressable
            key={`${keyPrefix}-${value}`}
            style={[styles.categoryPill, active && styles.categoryPillActive]}
            onPress={() => { haptic.selection(); onSelect(active ? null : value); }}
            activeOpacity={0.85}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={
              count !== undefined
                ? `Filter by ${value}${labelSuffix}, ${count} item${count === 1 ? '' : 's'}`
                : `Filter by ${value}${labelSuffix}`
            }
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>
              {value}{count !== undefined ? ` · ${count}` : ''}
            </Text>
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

const FacetChipRail = React.memo(FacetChipRailBase);
FacetChipRail.displayName = 'FacetChipRail';
export { FacetChipRail };
