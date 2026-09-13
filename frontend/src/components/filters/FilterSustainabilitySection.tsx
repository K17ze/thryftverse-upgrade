import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { haptics } from '../../utils/haptics';
import { FilterSection } from './FilterSection';
import { createFilterStyles } from './filterStyles';

interface Props {
  expanded: boolean;
  onToggle: () => void;
  checked: boolean;
  /** Called after the haptic — flips the sustainable-only flag upstream. */
  onToggleChecked: () => void;
}

// Sustainability section — custom switch row restricting results to
// seller-tagged / heuristically sustainable items.
function FilterSustainabilitySectionBase({ expanded, onToggle, checked, onToggleChecked }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <FilterSection sectionKey="sustainability" title="Sustainability" expanded={expanded} onToggle={onToggle}>
      <Pressable
        onPress={() => {
          haptics.press();
          onToggleChecked();
        }}
        style={styles.sustainableRow}
        accessibilityRole="switch"
        accessibilityState={{ checked }}
        accessibilityLabel="Toggle sustainable items only"
      >
        <View style={styles.sustainableLabelWrap}>
          <Ionicons
            name="leaf"
            size={16}
            color={checked ? colors.success : colors.textSecondary}
            aria-hidden={true}
          />
          <View style={styles.sustainableTextWrap}>
            <Text style={[styles.sustainableTitle, { color: colors.textPrimary }]}>
              Sustainable only
            </Text>
            <Text style={[styles.sustainableCaption, { color: colors.textMuted }]}>
              Items tagged sustainable by sellers
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.sustainableToggle,
            {
              borderColor: checked ? colors.success : colors.border,
              backgroundColor: checked ? colors.successSubtle : colors.surfaceAlt },
          ]}
        >
          <View
            style={[
              styles.sustainableToggleThumb,
              {
                backgroundColor: checked ? colors.success : colors.textMuted,
                alignSelf: checked ? 'flex-end' : 'flex-start' },
            ]}
          />
        </View>
      </Pressable>
    </FilterSection>
  );
}

const FilterSustainabilitySection = React.memo(FilterSustainabilitySectionBase);
FilterSustainabilitySection.displayName = 'FilterSustainabilitySection';
export { FilterSustainabilitySection };
