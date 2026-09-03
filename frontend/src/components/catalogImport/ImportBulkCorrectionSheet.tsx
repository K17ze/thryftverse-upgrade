import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  FontFamily,
  Control,
  Stroke,
  DockConstants } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedCount: number;
  onApply: (fields: Record<string, unknown>) => void;
  availableCategories: string[];
  availableConditions: string[];
}

type SellerChoice = 'selected' | 'excluded' | null;

const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 4;

/**
 * ImportBulkCorrectionSheet — a bottom sheet for bulk-correcting multiple
 * import items at once.
 *
 * Category and condition are horizontal pill scrollers; seller decision is a
 * two-option Include/Exclude toggle. The apply button stays disabled until
 * the user has chosen at least one field. No decorative headers, gradients,
 * or glass — just the fields and the action.
 */
export function ImportBulkCorrectionSheet({
  visible,
  onClose,
  selectedCount,
  onApply,
  availableCategories,
  availableConditions }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [category, setCategory] = React.useState<string | null>(null);
  const [condition, setCondition] = React.useState<string | null>(null);
  const [sellerDecision, setSellerDecision] = React.useState<SellerChoice>(null);

  // Reset selections whenever the sheet is reopened so stale state from a
  // previous session never leaks into the next bulk edit.
  React.useEffect(() => {
    if (visible) {
      setCategory(null);
      setCondition(null);
      setSellerDecision(null);
    }
  }, [visible]);

  const hasSelection = category !== null || condition !== null || sellerDecision !== null;

  const handleCategorySelect = React.useCallback((value: string) => {
    setCategory((prev) => (prev === value ? null : value));
  }, []);

  const handleConditionSelect = React.useCallback((value: string) => {
    setCondition((prev) => (prev === value ? null : value));
  }, []);

  const handleSellerSelect = React.useCallback((value: SellerChoice) => {
    setSellerDecision((prev) => (prev === value ? null : value));
  }, []);

  const handleApply = React.useCallback(() => {
    if (!hasSelection) return;
    const fields: Record<string, unknown> = {};
    if (category) fields['category'] = category;
    if (condition) fields['condition'] = condition;
    if (sellerDecision) fields['sellerDecision'] = sellerDecision;
    onApply(fields);
  }, [hasSelection, category, condition, sellerDecision, onApply]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <View style={styles.handle} />

          <Text style={styles.title}>
            {`Edit ${selectedCount} items`}
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <FieldSection label="Category">
              <PillRow
                options={availableCategories}
                selected={category}
                onSelect={handleCategorySelect}
                styles={styles}
              />
            </FieldSection>

            <FieldSection label="Condition">
              <PillRow
                options={availableConditions}
                selected={condition}
                onSelect={handleConditionSelect}
                styles={styles}
              />
            </FieldSection>

            <FieldSection label="Seller decision">
              <PillRow
                options={['Include', 'Exclude']}
                selected={
                  sellerDecision === 'selected'
                    ? 'Include'
                    : sellerDecision === 'excluded'
                      ? 'Exclude'
                      : null
                }
                onSelect={(label) => {
                  if (label === 'Include') handleSellerSelect('selected');
                  else handleSellerSelect('excluded');
                }}
                styles={styles}
              />
            </FieldSection>
          </ScrollView>

          <View style={styles.actions}>
            <AnimatedPressable
              style={styles.cancelButton}
              onPress={onClose}
              scaleValue={1}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.applyButton, !hasSelection && styles.applyButtonDisabled]}
              onPress={handleApply}
              disabled={!hasSelection}
              scaleValue={0.97}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel={`Apply to ${selectedCount} items`}
              accessibilityState={{ disabled: !hasSelection }}
            >
              <Text
                style={[
                  styles.applyText,
                  !hasSelection && styles.applyTextDisabled,
                ]}
              >
                {`Apply to ${selectedCount} items`}
              </Text>
            </AnimatedPressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Sub-components kept local to avoid over-scaffolding ──────────────────────

function FieldSection({
  label,
  children }: {
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createSectionStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function PillRow({
  options,
  selected,
  onSelect,
  styles }: {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  if (options.length === 0) {
    return (
      <Text style={styles.emptyHint}>No options available</Text>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillRowContent}
    >
      {options.map((option) => {
        const isSelected = selected === option;
        return (
          <AnimatedPressable
            key={option}
            style={[
              styles.pill,
              isSelected && styles.pillSelected,
            ]}
            onPress={() => onSelect(option)}
            scaleValue={0.97}
            hapticFeedback="selection"
            accessibilityRole="button"
            accessibilityLabel={option}
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[
                styles.pillText,
                isSelected && styles.pillTextSelected,
              ]}
              numberOfLines={1}
            >
              {option}
            </Text>
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      maxHeight: '85%' },
    safeArea: {
      flex: 1 },
    handle: {
      width: HANDLE_WIDTH,
      height: HANDLE_HEIGHT,
      borderRadius: HANDLE_HEIGHT / 2,
      backgroundColor: colors.borderSubtle,
      alignSelf: 'center',
      marginTop: Space.sm },
    title: {
      marginTop: Space.md,
      paddingHorizontal: Space.md,
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary },
    scroll: {
      flex: 1 },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.md },
    actions: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      gap: Space.sm },
    cancelButton: {
      alignItems: 'center',
      paddingVertical: Space.sm },
    cancelText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textMuted },
    applyButton: {
      height: DockConstants.primaryButtonHeight,
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center' },
    applyButtonDisabled: {
      opacity: 0.4 },
    applyText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      color: colors.textInverse },
    applyTextDisabled: {
      opacity: 0.7 },
    pillRowContent: {
      gap: Space.sm,
      paddingVertical: Space.xs },
    pill: {
      minHeight: Control.hit,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center' },
    pillSelected: {
      backgroundColor: colors.brandSubtle,
      borderColor: colors.brandBorder },
    pillText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textPrimary },
    pillTextSelected: {
      color: colors.textPrimary },
    emptyHint: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted,
      paddingVertical: Space.sm } });

const createSectionStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    section: {
      gap: Space.sm,
      paddingTop: Space.lg },
    sectionLabel: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textMuted } });
