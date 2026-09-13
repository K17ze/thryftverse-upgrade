import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { useToast } from '../../context/ToastContext';
import type { FilterPreset } from '../../preferences/settingsPreferences';
import type { ConditionOption, SortOption } from './filterTypes';
import { createFilterStyles } from './filterStyles';

interface Props {
  /** Whether any filter selection is active — gates the "Save current" affordances. */
  hasActiveSelection: boolean;
  /** Current selection snapshot written into a saved preset. */
  selection: {
    sort: SortOption;
    brands: string[];
    sizes: string[];
    condition: ConditionOption;
  };
  /** Applies a preset's sort/brand/size/condition values to the draft selection. */
  onApplyPreset: (preset: FilterPreset) => void;
}

// Filter presets — quick apply chips + save-current flow. Owns the
// save-in-progress name input state; the applied selection lives upstream.
function FilterPresetsBase({ hasActiveSelection, selection, onApplyPreset }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);
  const { filterPresets, saveFilterPreset, removeFilterPreset } = useSettingsPreferences();
  const { show } = useToast();
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  const handleApplyPreset = (preset: FilterPreset) => {
    onApplyPreset(preset);
    show(`Applied preset "${preset.name}"`, 'success');
  };

  const handleSavePreset = () => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    saveFilterPreset({
      name: trimmed,
      sort: selection.sort,
      brands: selection.brands,
      sizes: selection.sizes,
      condition: selection.condition });
    show(`Saved preset "${trimmed}"`, 'success');
    setPresetName('');
    setIsSavingPreset(false);
  };

  return (
    <>
      {/* Filter presets — quick apply chips + save current */}
      {(filterPresets.length > 0 || isSavingPreset) && (
        <View style={styles.presetsWrap}>
          <View style={styles.presetsHeaderRow}>
            <Text style={styles.presetsLabel}>Presets</Text>
            {!isSavingPreset && hasActiveSelection && (
              <AnimatedPressable
                onPress={() => setIsSavingPreset(true)}
                accessibilityLabel="Save current filters as a preset"
                accessibilityRole="button"
              >
                <Text style={styles.presetsSaveLink}>+ Save current</Text>
              </AnimatedPressable>
            )}
          </View>

          {isSavingPreset ? (
            <View style={styles.presetInputWrap}>
              <TextInput
                style={styles.presetInput}
                placeholder="Preset name (e.g. Streetwear M)"
                placeholderTextColor={colors.textMuted}
                value={presetName}
                onChangeText={setPresetName}
                autoFocus
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={handleSavePreset}
              />
              <AnimatedPressable
                style={[styles.presetSaveBtn, !presetName.trim() && styles.presetSaveBtnDisabled]}
                onPress={handleSavePreset}
                accessibilityLabel="Save preset"
                accessibilityRole="button"
              >
                <Ionicons name="checkmark" size={18} color={colors.surface} aria-hidden={true} />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.presetCancelBtn}
                onPress={() => { setIsSavingPreset(false); setPresetName(''); }}
                accessibilityLabel="Cancel saving preset"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={18} color={colors.textMuted} aria-hidden={true} />
              </AnimatedPressable>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsScroll}>
              {filterPresets.map((preset) => (
                <View key={preset.id} style={styles.presetChipWrap}>
                  <AnimatedPressable
                    style={styles.presetChip}
                    onPress={() => handleApplyPreset(preset)}
                    accessibilityLabel={`Apply filter preset ${preset.name}`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="bookmark" size={12} color={colors.brand} aria-hidden={true} />
                    <Text style={styles.presetChipText} numberOfLines={1}>{preset.name}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.presetRemoveBtn}
                    onPress={() => removeFilterPreset(preset.id)}
                    accessibilityLabel={`Remove filter preset ${preset.name}`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} aria-hidden={true} />
                  </AnimatedPressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Inline "Save current" entry when no presets exist yet */}
      {filterPresets.length === 0 && !isSavingPreset && hasActiveSelection && (
        <AnimatedPressable
          style={styles.presetsEmptyCta}
          onPress={() => setIsSavingPreset(true)}
          accessibilityLabel="Save current filters as a preset"
          accessibilityRole="button"
        >
          <Ionicons name="bookmark-outline" size={16} color={colors.brand} aria-hidden={true} />
          <Text style={styles.presetsEmptyCtaText}>Save current filters as a preset</Text>
        </AnimatedPressable>
      )}
    </>
  );
}

const FilterPresets = React.memo(FilterPresetsBase);
FilterPresets.displayName = 'FilterPresets';
export { FilterPresets };
