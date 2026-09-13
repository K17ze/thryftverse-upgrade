import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { useToast } from '../../context/ToastContext';
import { haptics } from '../../utils/haptics';
import { FilterSection } from './FilterSection';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  /** Distinct size values present in the current listing snapshot. */
  sizeOptions: string[];
  selectedSizes: string[];
  onToggleSize: (size: string) => void;
}

// Size section — saved "My sizes" rail, wrapping chip cloud with long-press
// to save/remove a size, and a save-selection affordance.
function FilterSizeSectionBase({ expanded, onToggle, sizeOptions, selectedSizes, onToggleSize }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const { mySizes, setMySizes, toggleMySize } = useSettingsPreferences();
  const { show } = useToast();

  return (
    <FilterSection
      sectionKey="size"
      title="Size"
      expanded={expanded}
      onToggle={onToggle}
      count={selectedSizes.length}
    >
      {/* My Sizes — saved size profile for quick application */}
      {mySizes.length > 0 ? (
        <View style={styles.mySizesRow}>
          <Text style={styles.mySizesLabel}>My sizes:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mySizesScroll}>
            {mySizes.map(s => {
              const isActive = selectedSizes.includes(s);
              return (
                <AppButton
                  key={s}
                  title={s}
                  variant="secondary"
                  size="sm"
                  style={[styles.chip, styles.sizeChip, styles.mySizeChip, isActive && styles.chipActive]}
                  titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
                  onPress={() => onToggleSize(s)}
                  accessibilityLabel={`Toggle your saved size ${s}`}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.wrapContainer}>
        {sizeOptions.length > 0 ? (
          sizeOptions.map(s => {
            const isActive = selectedSizes.includes(s);
            const isMySize = mySizes.includes(s);
            return (
              <Pressable
                key={s}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onLongPress={() => {
                  toggleMySize(s);
                  haptics.press();
                  show(
                    mySizes.includes(s) ? `Removed ${s} from your sizes` : `Saved ${s} to your sizes`,
                    'success'
                  );
                }}
                delayLongPress={400}
              accessibilityRole="switch" accessibilityLabel="Toggle size filter"
              >
                <AppButton
                  title={s}
                  icon={isMySize ? <Ionicons name="star" size={12} color={colors.brand} aria-hidden={true} /> : undefined}
                  variant="secondary"
                  size="sm"
                  style={[styles.chip, styles.sizeChip, isActive && styles.chipActive, isMySize && styles.mySizeMarkedChip]}
                  titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
                  onPress={() => onToggleSize(s)}
                  accessibilityLabel={`Toggle size filter ${s}. Long press to ${mySizes.includes(s) ? 'remove from' : 'save to'} your sizes.`}
                />
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.emptySectionText}>No sizes in this category yet.</Text>
        )}
      </View>

      {/* Save current sizes as my sizes */}
      {selectedSizes.length > 0 ? (
        <View style={styles.saveSizesRow}>
          <AppButton
            title={selectedSizes.every(s => mySizes.includes(s)) ? 'All saved' : 'Save as my sizes'}
            icon={selectedSizes.every(s => mySizes.includes(s)) ? <Ionicons name="checkmark-circle" size={16} color={colors.brand} aria-hidden={true} /> : undefined}
            variant="secondary"
            size="sm"
            style={styles.saveSizesBtn}
            titleStyle={styles.saveSizesBtnText}
            onPress={() => {
              // Merge current selection into my sizes
              const merged = [...new Set([...mySizes, ...selectedSizes])];
              setMySizes(merged);
              show(`Saved ${selectedSizes.length} size${selectedSizes.length === 1 ? '' : 's'} to your profile`, 'success');
            }}
            accessibilityLabel="Save current size selection to your profile"
          />
        </View>
      ) : null}
    </FilterSection>
  );
}

const FilterSizeSection = React.memo(FilterSizeSectionBase);
FilterSizeSection.displayName = 'FilterSizeSection';
export { FilterSizeSection };
