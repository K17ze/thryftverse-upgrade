import React from 'react';
import {
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  Radius,
  Space,
  Elevation,
  Control, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type AppDatePickerMode = 'date' | 'time' | 'datetime';

export interface AppDatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  mode?: AppDatePickerMode;
  minDate?: Date;
  maxDate?: Date;
  label?: string;
  testID?: string;
}

type ExpoDateTimePickerProps = {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  minimumDate?: Date;
  maximumDate?: Date;
  onChange?: (event: { type: string; nativeEvent: { timestamp?: number } }) => void;
};

type ExpoDateTimePickerComponent = React.ComponentType<ExpoDateTimePickerProps>;

let cachedExpoPicker: ExpoDateTimePickerComponent | null | undefined;

/**
 * Lazily resolves `@expo/ui`'s `DateTimePicker` if it is exported. The module
 * is probed once and cached; if the export is absent the result is `null` and
 * the fallback wheel picker is used instead.
 */
function loadExpoDateTimePicker(): ExpoDateTimePickerComponent | null {
  if (cachedExpoPicker !== undefined) return cachedExpoPicker;
  try {
    const mod = require('@expo/ui') as Record<string, unknown>;
    const Component = mod.DateTimePicker as ExpoDateTimePickerComponent | undefined;
    cachedExpoPicker = Component ?? null;
  } catch {
    cachedExpoPicker = null;
  }
  return cachedExpoPicker;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

/**
 * AppDatePicker — a cross-platform date/time picker primitive.
 *
 * On platforms where `@expo/ui` exposes a `DateTimePicker`, the native
 * component is rendered directly (lazy-loaded and cached). Otherwise a
 * modal-based wheel picker with scrollable year/month/day/hour/minute
 * selectors is rendered as a fallback. All variants use design tokens for
 * styling and expose `accessibilityRole="adjustable"` on each scroll wheel.
 */
export function AppDatePicker({
  value,
  onChange,
  mode = 'date',
  minDate,
  maxDate,
  label,
  testID }: AppDatePickerProps) {
  const { colors } = useAppTheme();
  const [modalVisible, setModalVisible] = React.useState(false);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const ExpoPicker = loadExpoDateTimePicker();

  const displayValue = React.useMemo(() => formatDisplay(value, mode), [value, mode]);

  if (ExpoPicker) {
    return (
      <View style={styles.container} accessibilityRole="adjustable" accessibilityLabel={label}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <ExpoPicker
          value={value}
          mode={mode}
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={(e) => {
            const ts = e.nativeEvent.timestamp;
            if (ts != null) onChange(new Date(ts));
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="adjustable" accessibilityLabel={label} testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={styles.field}
        onPress={() => setModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${displayValue}` : displayValue}
        accessibilityHint="Double tap to open the date picker"
      >
        <Text style={styles.fieldValue}>{displayValue}</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)} accessibilityRole="button" accessibilityLabel="Close date picker">
          <Pressable
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
            accessibilityRole="adjustable"
          >
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.sheetAction}>Done</Text>
              </Pressable>
            </View>
            <WheelPickerSheet
              value={value}
              mode={mode}
              minDate={minDate}
              maxDate={maxDate}
              colors={colors}
              styles={styles}
              onChange={onChange}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface WheelPickerSheetProps {
  value: Date;
  mode: AppDatePickerMode;
  minDate?: Date;
  maxDate?: Date;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onChange: (date: Date) => void;
}

function WheelPickerSheet({
  value,
  mode,
  minDate,
  maxDate,
  colors,
  styles,
  onChange }: WheelPickerSheetProps) {
  const showDate = mode === 'date' || mode === 'datetime';
  const showTime = mode === 'time' || mode === 'datetime';

  const minYear = minDate?.getFullYear() ?? 1900;
  const maxYear = maxDate?.getFullYear() ?? 2100;
  const years = React.useMemo(
    () => buildRange(minYear, maxYear),
    [minYear, maxYear],
  );
  const months = React.useMemo(() => MONTHS.map((_, i) => i), []);
  const days = React.useMemo(
    () => buildRange(1, daysInMonth(value.getFullYear(), value.getMonth())),
    [value],
  );
  const hours = React.useMemo(() => buildRange(0, 23), []);
  const minutes = React.useMemo(() => buildRange(0, 59), []);

  const setDatePart = React.useCallback(
    (patch: Partial<{ year: number; month: number; day: number; hour: number; minute: number }>) => {
      const next = new Date(value);
      if (patch.year != null) next.setFullYear(patch.year);
      if (patch.month != null) next.setMonth(patch.month);
      if (patch.day != null) next.setDate(patch.day);
      if (patch.hour != null) next.setHours(patch.hour);
      if (patch.minute != null) next.setMinutes(patch.minute);
      onChange(next);
    },
    [value, onChange],
  );

  return (
    <View style={styles.wheelRow}>
      {showDate ? (
        <>
          <WheelColumn
            items={months}
            selectedIndex={value.getMonth()}
            renderLabel={(i) => MONTHS[i]}
            colors={colors}
            styles={styles}
            onSelect={(i) => setDatePart({ month: i })}
            label="Month"
          />
          <WheelColumn
            items={days}
            selectedIndex={value.getDate() - 1}
            renderLabel={(d) => String(d)}
            colors={colors}
            styles={styles}
            onSelect={(d) => setDatePart({ day: d + 1 })}
            label="Day"
          />
          <WheelColumn
            items={years}
            selectedIndex={value.getFullYear() - minYear}
            renderLabel={(y) => String(y)}
            colors={colors}
            styles={styles}
            onSelect={(y) => setDatePart({ year: y })}
            label="Year"
          />
        </>
      ) : null}
      {showTime ? (
        <>
          <WheelColumn
            items={hours}
            selectedIndex={value.getHours()}
            renderLabel={(h) => String(h).padStart(2, '0')}
            colors={colors}
            styles={styles}
            onSelect={(h) => setDatePart({ hour: h })}
            label="Hour"
          />
          <WheelColumn
            items={minutes}
            selectedIndex={value.getMinutes()}
            renderLabel={(m) => String(m).padStart(2, '0')}
            colors={colors}
            styles={styles}
            onSelect={(m) => setDatePart({ minute: m })}
            label="Minute"
          />
        </>
      ) : null}
    </View>
  );
}

interface WheelColumnProps {
  items: number[];
  selectedIndex: number;
  renderLabel: (item: number) => string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onSelect: (item: number) => void;
  label: string;
}

function WheelColumn({
  items,
  selectedIndex,
  renderLabel,
  colors,
  styles,
  onSelect,
  label }: WheelColumnProps) {
  const scrollRef = React.useRef<ScrollView>(null);
  const itemKey = React.useRef(selectedIndex);

  React.useEffect(() => {
    itemKey.current = selectedIndex;
    scrollRef.current?.scrollTo({
      y: selectedIndex * ITEM_HEIGHT,
      animated: false });
  }, [selectedIndex]);

  const handleScrollEnd = React.useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      if (clamped !== itemKey.current) {
        itemKey.current = clamped;
        onSelect(items[clamped]);
      }
    },
    [items, onSelect],
  );

  return (
    <View style={styles.wheelColumn} accessibilityRole="adjustable" accessibilityLabel={label}>
      <ScrollView
        ref={scrollRef}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={styles.wheelContent}
      >
        <View style={styles.wheelSpacer} />
        {items.map((item) => {
          const isSelected = item === items[selectedIndex];
          return (
            <Pressable
              key={item}
              style={styles.wheelItem}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${renderLabel(item)}`}
            >
              <Text
                style={[
                  styles.wheelItemText,
                  isSelected && styles.wheelItemTextSelected,
                ]}
              >
                {renderLabel(item)}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.wheelSpacer} />
      </ScrollView>
      <View style={styles.wheelSelectionOverlay} pointerEvents="none" />
    </View>
  );
}

function formatDisplay(date: Date, mode: AppDatePickerMode): string {
  const dateStr = `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (mode === 'date') return dateStr;
  if (mode === 'time') return timeStr;
  return `${dateStr} · ${timeStr}`;
}

function buildRange(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      minHeight: Control.hit,
      justifyContent: 'center' } as ViewStyle,
    label: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.label.letterSpacing,
      marginBottom: Space.xs } as ViewStyle,
    field: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      backgroundColor: colors.input,
      minHeight: Control.hit,
      justifyContent: 'center' } as ViewStyle,
    fieldValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing } as ViewStyle,
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: colors.overlay } as ViewStyle,
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      paddingBottom: Space.lg,
      ...Elevation.modal } as ViewStyle,
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm } as ViewStyle,
    sheetAction: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.brand,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing } as ViewStyle,
    wheelRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: Space.sm } as ViewStyle,
    wheelColumn: {
      flex: 1,
      maxWidth: 120,
      height: PICKER_HEIGHT,
      marginHorizontal: Space.xxs } as ViewStyle,
    wheelContent: {
      paddingVertical: 0 } as ViewStyle,
    wheelSpacer: {
      height: ITEM_HEIGHT * 2 } as ViewStyle,
    wheelItem: {
      height: ITEM_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center' } as ViewStyle,
    wheelItemText: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.textMuted } as ViewStyle,
    wheelItemTextSelected: {
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.textPrimary } as ViewStyle,
    wheelSelectionOverlay: {
      position: 'absolute',
      top: ITEM_HEIGHT * 2,
      left: 0,
      right: 0,
      height: ITEM_HEIGHT,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border } as ViewStyle });
}
