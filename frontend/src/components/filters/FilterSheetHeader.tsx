import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Control } from '../../theme/designTokens';
import { createFilterStyles } from './filterStyles';

interface Props {
  /** Count of currently-active filter selections — drives the header badge. */
  activeFilterCount: number;
  /** Dismisses the sheet (same as a backdrop tap / pull-down). */
  onClose: () => void;
}

// Extends the 44pt close target slightly beyond its box so the sheet's top
// corner stays forgiving.
const CLOSE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// Fixed chrome at the top of the filter sheet: iOS grabber plus a single
// title row — left-aligned section title with the active-count badge and a
// transparent 44pt close target (the "title + close" house idiom; the
// Reset/Apply action pair lives in the bottom dock).
function FilterSheetHeaderBase({ activeFilterCount, onClose }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <>
      {/* Grabber — visual only, hidden from screen readers (house grammar). */}
      <View
        style={styles.handleContainer}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={[
            styles.handle,
            { backgroundColor: isDark ? colors.border : 'rgba(0,0,0,0.2)' }]}
        />
      </View>

      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle} accessibilityRole="header">Filter & Sort</Text>
          {activeFilterCount > 0 && (
            <View style={styles.activeCountBadge}>
              <Text style={styles.activeCountBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </View>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={CLOSE_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        >
          <Ionicons name="close" size={Control.icon} color={colors.textSecondary} aria-hidden={true} />
        </Pressable>
      </View>
    </>
  );
}

const FilterSheetHeader = React.memo(FilterSheetHeaderBase);
FilterSheetHeader.displayName = 'FilterSheetHeader';
export { FilterSheetHeader };
