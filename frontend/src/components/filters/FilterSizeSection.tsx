import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { useToast } from '../../context/ToastContext';
import { FilterSection } from './FilterSection';
import { FilterOptionRow } from './FilterOptionRow';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  /** Distinct size values present in the current listing snapshot. */
  sizeOptions: string[];
  selectedSizes: string[];
  onToggleSize: (size: string) => void;
}

// Size section — a two-column grid of quiet cells. Snapshot sizes and saved
// "My sizes" share the one grid (saved sizes carry a small star and stay
// selectable even when absent from the snapshot); long-press still saves or
// removes a size from the profile, and a quiet text action saves the whole
// current selection.
function FilterSizeSectionBase({ expanded, onToggle, sizeOptions, selectedSizes, onToggleSize }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const { mySizes, setMySizes, toggleMySize } = useSettingsPreferences();
  const { show } = useToast();

  // One grid, one vocabulary — saved sizes absent from the snapshot append
  // after the snapshot values so nothing selectable disappears.
  const sizeChoices = React.useMemo(() => {
    const extras = mySizes.filter((size) => !sizeOptions.includes(size));
    return [...sizeOptions, ...extras];
  }, [sizeOptions, mySizes]);

  const gridRows = React.useMemo(() => {
    const rows: string[][] = [];
    for (let i = 0; i < sizeChoices.length; i += 2) {
      rows.push(sizeChoices.slice(i, i + 2));
    }
    return rows;
  }, [sizeChoices]);

  const allSelectedSaved =
    selectedSizes.length > 0 && selectedSizes.every((size) => mySizes.includes(size));

  return (
    <FilterSection
      sectionKey="size"
      title="Size"
      expanded={expanded}
      onToggle={onToggle}
      count={selectedSizes.length}
    >
      {gridRows.length > 0 ? (
        <View style={styles.optionList}>
          {gridRows.map((row, rowIndex) => (
            <View
              key={row.join('|')}
              style={[styles.optionGridRow, rowIndex < gridRows.length - 1 && styles.optionDivider]}
            >
              {row.map((size, colIndex) => {
                const isActive = selectedSizes.includes(size);
                const isMySize = mySizes.includes(size);
                return (
                  <FilterOptionRow
                    key={size}
                    layout="cell"
                    role="checkbox"
                    label={size}
                    selected={isActive}
                    showDivider={false}
                    showLeadingDivider={colIndex === 1}
                    marker={
                      isMySize ? (
                        <Ionicons name="star" size={11} color={colors.brand} aria-hidden={true} />
                      ) : undefined
                    }
                    onPress={() => onToggleSize(size)}
                    onLongPress={() => {
                      toggleMySize(size);
                      show(
                        isMySize ? `Removed ${size} from your sizes` : `Saved ${size} to your sizes`,
                        'success'
                      );
                    }}
                    accessibilityLabel={`${size}. Long press to ${isMySize ? 'remove from' : 'save to'} your sizes`}
                  />
                );
              })}
              {/* Keep the grid rectangular when the last row is short. */}
              {row.length === 1 ? <View style={styles.optionCell} /> : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptySectionText}>No sizes in this category yet.</Text>
      )}

      {/* Save current sizes as my sizes — quiet text action, not a button. */}
      {selectedSizes.length > 0 ? (
        allSelectedSaved ? (
          <View style={styles.optionQuietAction} accessibilityRole="text">
            <Ionicons name="checkmark-circle" size={14} color={colors.textMuted} aria-hidden={true} />
            <Text style={[styles.optionQuietActionText, { color: colors.textMuted }]}>
              Saved to your sizes
            </Text>
          </View>
        ) : (
          <AnimatedPressable
            style={styles.optionQuietAction}
            disableAnimation
            activeOpacity={0.6}
            hapticFeedback="light"
            onPress={() => {
              // Merge current selection into my sizes
              const merged = [...new Set([...mySizes, ...selectedSizes])];
              setMySizes(merged);
              show(`Saved ${selectedSizes.length} size${selectedSizes.length === 1 ? '' : 's'} to your profile`, 'success');
            }}
            accessibilityRole="button"
            accessibilityLabel="Save current size selection to your profile"
          >
            <Ionicons name="bookmark-outline" size={14} color={colors.brand} aria-hidden={true} />
            <Text style={styles.optionQuietActionText}>Save as my sizes</Text>
          </AnimatedPressable>
        )
      ) : null}
    </FilterSection>
  );
}

const FilterSizeSection = React.memo(FilterSizeSectionBase);
FilterSizeSection.displayName = 'FilterSizeSection';
export { FilterSizeSection };
