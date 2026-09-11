import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BottomSheet } from '../../BottomSheet';
import { AppDatePicker } from '../../primitives/AppDatePicker';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Control, Stroke, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { haptics } from '../../../utils/haptics';
import { validateCustomRange } from './useSellerAnalytics';

export interface AnalyticsDateRangeSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onApply: (startDate: string, endDate: string) => void;
  initialStartDate?: string;
  initialEndDate?: string;
  triggerRef?: React.RefObject<View>;
}

const ISO_TODAY = (() => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
})();

const QUICK_PRESETS: { label: string; days: number }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isoToDate(iso: string): Date {
  return new Date(iso + 'T00:00:00.000Z');
}

export function AnalyticsDateRangeSheet({
  visible,
  onDismiss,
  onApply,
  initialStartDate,
  initialEndDate,
  triggerRef,
}: AnalyticsDateRangeSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const today = useMemo(() => new Date(), []);
  const oneYearAgo = useMemo(() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d;
  }, []);

  const [startDate, setStartDate] = useState<string>(initialStartDate ?? ISO_TODAY);
  const [endDate, setEndDate] = useState<string>(initialEndDate ?? ISO_TODAY);

  React.useEffect(() => {
    if (visible) {
      setStartDate(initialStartDate ?? ISO_TODAY);
      setEndDate(initialEndDate ?? ISO_TODAY);
    }
  }, [visible, initialStartDate, initialEndDate]);

  const validationError = useMemo(
    () => validateCustomRange(startDate, endDate),
    [startDate, endDate],
  );

  const handleQuickPreset = useCallback((days: number) => {
    haptics.tap();
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days + 1);
    setStartDate(toISODate(start));
    setEndDate(toISODate(end));
  }, []);

  const handleApply = useCallback(() => {
    if (validationError) return;
    haptics.selection();
    onApply(startDate, endDate);
    onDismiss();
  }, [validationError, startDate, endDate, onApply, onDismiss]);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      variant="system"
      snapPoint={0.62}
      triggerRef={triggerRef}
    >
      <View style={styles.sheetContent}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
          Custom range
        </Text>

        {/* Quick presets */}
        <View style={styles.quickPresetRow}>
          {QUICK_PRESETS.map((preset) => (
            <Pressable
              key={preset.days}
              style={({ pressed }) => [
                styles.quickPresetChip,
                { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => handleQuickPreset(preset.days)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${preset.label}`}
              hitSlop={{ top: 4, bottom: 4 }}
            >
              <Text style={[styles.quickPresetText, { color: colors.textPrimary }]}>
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Date pickers */}
        <View style={styles.datePickerRow}>
          <View style={styles.datePickerCol}>
            <Text style={[styles.datePickerLabel, { color: colors.textSecondary }]}>
              Start
            </Text>
            <AppDatePicker
              value={isoToDate(startDate)}
              onChange={(d) => setStartDate(toISODate(d))}
              mode="date"
              minDate={oneYearAgo}
              maxDate={isoToDate(endDate)}
              testID="analytics-range-start"
            />
          </View>
          <View style={styles.datePickerCol}>
            <Text style={[styles.datePickerLabel, { color: colors.textSecondary }]}>
              End
            </Text>
            <AppDatePicker
              value={isoToDate(endDate)}
              onChange={(d) => setEndDate(toISODate(d))}
              mode="date"
              minDate={isoToDate(startDate)}
              maxDate={today}
              testID="analytics-range-end"
            />
          </View>
        </View>

        {/* Validation error */}
        {validationError ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {validationError}
          </Text>
        ) : null}

        {/* Actions */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              { borderColor: colors.border },
              pressed && { opacity: 0.6 },
            ]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Cancel date range selection"
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.applyButton,
              { backgroundColor: validationError ? colors.surfaceAlt : colors.brand },
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleApply}
            disabled={!!validationError}
            accessibilityRole="button"
            accessibilityLabel="Apply custom date range"
            accessibilityState={{ disabled: !!validationError }}
          >
            <Text
              style={[
                styles.applyText,
                { color: validationError ? colors.textMuted : colors.scrimTextPrimary },
              ]}
            >
              Apply
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    sheetContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.lg,
      gap: Space.md,
    },
    sheetTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    },
    quickPresetRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    quickPresetChip: {
      flex: 1,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    quickPresetText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    datePickerRow: {
      flexDirection: 'row',
      gap: Space.md,
    },
    datePickerCol: {
      flex: 1,
    },
    datePickerLabel: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      letterSpacing: TypographyV2.label.letterSpacing,
      marginBottom: Space.xs,
    },
    errorText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
    },
    actionRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      alignItems: 'center',
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    applyButton: {
      flex: 1,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.md,
      alignItems: 'center',
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    applyText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
  });
}
