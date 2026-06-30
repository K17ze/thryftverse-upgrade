import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

export type FilterClassification =
  | 'all'
  | 'needs_action'
  | 'active'
  | 'completed'
  | 'cancelled';

export interface OrdersFilterState {
  classification: FilterClassification;
  year: number | null;
}

interface OrdersFilterSheetProps {
  visible: boolean;
  currentFilter: OrdersFilterState;
  availableYears: number[];
  onApply: (filter: OrdersFilterState) => void;
  onClose: () => void;
}

const CLASSIFICATION_OPTIONS: { key: FilterClassification; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_action', label: 'Needs action' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function OrdersFilterSheet({
  visible,
  currentFilter,
  availableYears,
  onApply,
  onClose,
}: OrdersFilterSheetProps) {
  const [localClassification, setLocalClassification] =
    React.useState<FilterClassification>(currentFilter.classification);
  const [localYear, setLocalYear] = React.useState<number | null>(currentFilter.year);

  React.useEffect(() => {
    if (visible) {
      setLocalClassification(currentFilter.classification);
      setLocalYear(currentFilter.year);
    }
  }, [visible, currentFilter]);

  const handleApply = () => {
    onApply({
      classification: localClassification,
      year: localYear,
    });
    onClose();
  };

  const handleClear = () => {
    setLocalClassification('all');
    setLocalYear(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Filter orders</Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close filter sheet"
            >
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Status</Text>
            {CLASSIFICATION_OPTIONS.map((option) => {
              const isSelected = localClassification === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={styles.optionRow}
                  onPress={() => setLocalClassification(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Filter by ${option.label}`}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color={Colors.brand} />
                  )}
                </Pressable>
              );
            })}

            {availableYears.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: Space.md }]}>
                  Year
                </Text>
                <Pressable
                  style={styles.optionRow}
                  onPress={() => setLocalYear(null)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: localYear === null }}
                  accessibilityLabel="All years"
                >
                  <Text
                    style={[
                      styles.optionText,
                      localYear === null && styles.optionTextActive,
                    ]}
                  >
                    All years
                  </Text>
                  {localYear === null && (
                    <Ionicons name="checkmark" size={18} color={Colors.brand} />
                  )}
                </Pressable>
                {availableYears.map((year) => {
                  const isSelected = localYear === year;
                  return (
                    <Pressable
                      key={year}
                      style={styles.optionRow}
                      onPress={() => setLocalYear(year)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Filter by year ${year}`}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextActive,
                        ]}
                      >
                        {year}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={18} color={Colors.brand} />
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={styles.clearBtn}
              onPress={handleClear}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.applyBtn}
              onPress={handleApply}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
            >
              <Text style={styles.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  title: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Space.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    minHeight: 44,
  },
  optionText: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  optionTextActive: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  footer: {
    flexDirection: 'row',
    gap: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  clearBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  applyBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
});
