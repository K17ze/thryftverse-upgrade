import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';
import { SyncStatusPill, type SyncStatusTone } from '../SyncStatusPill';
import { createFilterStyles } from './filterStyles';

interface Props {
  /** Count of currently-active filter selections — drives the header badge. */
  activeFilterCount: number;
  onClear: () => void;
  /** Honest capability line — either a match count or the search-context note. */
  statusMeta: string;
  syncTone: SyncStatusTone;
  syncLabel: string;
  /** Filter context identity (route title or category id). */
  contextLabel: string;
  onPressContext: () => void;
}

// Fixed chrome at the top of the filter sheet: drag handle, title row with
// active-count badge + Clear, sync status row, and the category context pill.
function FilterSheetHeaderBase({
  activeFilterCount,
  onClear,
  statusMeta,
  syncTone,
  syncLabel,
  contextLabel,
  onPressContext,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <>
      {/* Drag Handle */}
      <View style={styles.handleContainer}>
        <View style={styles.handle} />
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
        <AppButton
          title="Clear"
          onPress={onClear}
          variant="secondary"
          size="sm"
          style={styles.clearBtn}
          titleStyle={styles.clearText}
          accessibilityLabel="Clear selected filters"
        />
      </View>

      <View style={styles.statusRow}>
        {/* In search context the count is computed against the local
            catalog snapshot, not the live query result — showing a number
            would overstate precision. Show the honest capability instead. */}
        <Text style={styles.statusMeta}>{statusMeta}</Text>
        <SyncStatusPill tone={syncTone} label={syncLabel} compact />
      </View>

      <View style={styles.contextActionRow}>
        <AnimatedPressable
          style={styles.contextIdentity}
          onPress={onPressContext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open category tree"
          accessibilityHint="Shows the full category tree for this filter context"
        >
          <Ionicons name="funnel-outline" size={16} color={colors.textPrimary} aria-hidden={true} />
          <Text style={styles.contextText} numberOfLines={1}>
            {contextLabel}
          </Text>
        </AnimatedPressable>

      </View>
    </>
  );
}

const FilterSheetHeader = React.memo(FilterSheetHeaderBase);
FilterSheetHeader.displayName = 'FilterSheetHeader';
export { FilterSheetHeader };
