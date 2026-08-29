import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Typography, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';

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
  onClose }: OrdersFilterSheetProps) {
  const { colors } = useAppTheme();
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
      year: localYear });
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
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filter">
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
        accessibilityRole="button"
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Filter orders
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close filter sheet"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              Status
            </Text>
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
                      { color: colors.textSecondary },
                      isSelected && { color: colors.textPrimary, fontFamily: Typography.family.semibold },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color={colors.brand} />
                  )}
                </Pressable>
              );
            })}

            {availableYears.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Space.md }]}>
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
                      { color: colors.textSecondary },
                      localYear === null && { color: colors.textPrimary, fontFamily: Typography.family.semibold },
                    ]}
                  >
                    All years
                  </Text>
                  {localYear === null && (
                    <Ionicons name="checkmark" size={18} color={colors.brand} />
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
                          { color: colors.textSecondary },
                          isSelected && { color: colors.textPrimary, fontFamily: Typography.family.semibold },
                        ]}
                      >
                        {year}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={18} color={colors.brand} />
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
            <Pressable
              style={[styles.clearBtn, { borderColor: colors.border }]}
              onPress={handleClear}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
            >
              <Text style={[styles.clearBtnText, { color: colors.textSecondary }]}>
                Clear
              </Text>
            </Pressable>
            <Pressable
              style={[styles.applyBtn, { backgroundColor: colors.brand }]}
              onPress={handleApply}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
            >
              <Text style={[styles.applyBtnText, { color: colors.textInverse }]}>
                Apply
              </Text>
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
    justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    maxHeight: '80%' },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
    minHeight: 44 },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  sectionLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    minHeight: 44 },
  optionText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  footer: {
    flexDirection: 'row',
    gap: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth },
  clearBtn: {
    flex: 1,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48 },
  clearBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  applyBtn: {
    flex: 1,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48 },
  applyBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily } });
