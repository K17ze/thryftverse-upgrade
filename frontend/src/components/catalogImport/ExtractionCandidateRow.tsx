import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  FontFamily,
  Stroke,
  Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type {
  FieldCandidateDTO,
  CandidateSourceModule,
  CandidateValidationState,
  FieldDecisionKind } from '../../services/catalogImportApi';

// ── Source module labels (short, factual — no "AI-powered" language) ────────
const SOURCE_MODULE_LABEL: Record<CandidateSourceModule, string> = {
  unknown: 'Suggested',
  source_structured: 'From source',
  ocr: 'From text in photo',
  barcode: 'From barcode',
  vision: 'From photo',
  catalog_match: 'From catalog match',
  deterministic_map: 'Mapped',
  copy_generation: 'Drafted' };

interface Props {
  candidate: FieldCandidateDTO;
  fieldName: string;
  label: string;
  deciding: boolean;
  onDecide: (
    fieldName: string,
    decision: FieldDecisionKind,
    candidateId: string,
    value: unknown,
  ) => void;
  onEdit: (
    fieldName: string,
    label: string,
    candidateId: string,
    currentValue: string,
  ) => void;
  onShowEvidence: (candidate: FieldCandidateDTO) => void;
}

/**
 * ExtractionCandidateRow — a single extraction candidate shown inline below
 * the field diff, with accept/edit/reject actions.
 *
 * Composition (per AGENTS.md anti-AI policy):
 * - A hairline separator above, the source label on the left (short,
 *   factual — "From text in photo", not "AI extracted with 92% confidence"),
 *   the candidate value on the right.
 * - Three actions: Accept (checkmark), Edit (pencil), Reject (x). Each is a
 *   transparent 44pt hit target with a 20pt glyph — no filled pills, no
 *   decorative chrome.
 * - Invalid candidates are dimmed with a small warning glyph.
 * - Confidence and evidence are available on demand via a long-press or
 *   evidence chevron — NOT painted on every row.
 */
export function ExtractionCandidateRow({
  candidate,
  fieldName,
  label,
  deciding,
  onDecide,
  onEdit,
  onShowEvidence }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const sourceLabel = SOURCE_MODULE_LABEL[candidate.sourceModule] ?? 'Suggested';
  const valueText = stringify(candidate.value);
  const isInvalid = candidate.validationState === 'invalid';
  const hasWarning = candidate.validationState === 'warning';
  // Evidence icon is suppressed until the evidence bottom sheet is
  // implemented. Per AGENTS.md: no dead interactions — an icon that does
  // nothing when tapped is a prototype-level defect.
  const hasEvidence = false;

  const handleAccept = useCallback(() => {
    onDecide(fieldName, 'accepted', candidate.id, candidate.value);
  }, [fieldName, candidate, onDecide]);

  const handleReject = useCallback(() => {
    onDecide(fieldName, 'rejected', candidate.id, candidate.value);
  }, [fieldName, candidate, onDecide]);

  const handleEdit = useCallback(() => {
    onEdit(fieldName, label, candidate.id, valueText ?? '');
  }, [fieldName, label, candidate, valueText, onEdit]);

  const handleEvidence = useCallback(() => {
    if (hasEvidence) onShowEvidence(candidate);
  }, [hasEvidence, candidate, onShowEvidence]);

  return (
    <View style={styles.row}>
      <View style={styles.topRow}>
        <Text style={styles.sourceLabel} numberOfLines={1}>
          {sourceLabel.toUpperCase()}
        </Text>
        <View style={styles.valueWrap}>
          {isInvalid ? (
            <Ionicons
              name="alert-circle"
              size={14}
              color={colors.danger}
              style={styles.warningGlyph}
            />
          ) : hasWarning ? (
            <Ionicons
              name="alert"
              size={14}
              color={colors.warning}
              style={styles.warningGlyph}
            />
          ) : null}
          <Text
            style={[styles.value, isInvalid && styles.valueInvalid]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {valueText ?? '\u2014'}
          </Text>
          {hasEvidence ? (
            <AnimatedPressable
              style={styles.evidenceHit}
              onPress={handleEvidence}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="View evidence"
            >
              <Ionicons
                name="information-circle-outline"
                size={Control.iconCompact}
                color={colors.textMuted}
              />
            </AnimatedPressable>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <AnimatedPressable
          style={styles.actionHit}
          onPress={handleAccept}
          disabled={deciding || isInvalid}
          hapticFeedback="selection"
          accessibilityRole="button"
          accessibilityLabel={`Accept ${label} suggestion`}
          accessibilityState={{ disabled: deciding || isInvalid }}
        >
          <Ionicons
            name="checkmark"
            size={Control.icon}
            color={isInvalid || deciding ? colors.textMuted : colors.brand}
          />
          <Text style={[styles.actionLabel, (isInvalid || deciding) && styles.actionLabelDisabled]}>
            Accept
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.actionHit}
          onPress={handleEdit}
          disabled={deciding}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label} suggestion`}
          accessibilityState={{ disabled: deciding }}
        >
          <Ionicons
            name="pencil-outline"
            size={Control.iconCompact}
            color={deciding ? colors.textMuted : colors.textSecondary}
          />
          <Text style={[styles.actionLabel, deciding && styles.actionLabelDisabled]}>
            Edit
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.actionHit}
          onPress={handleReject}
          disabled={deciding}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={`Reject ${label} suggestion`}
          accessibilityState={{ disabled: deciding }}
        >
          <Ionicons
            name="close"
            size={Control.iconCompact}
            color={deciding ? colors.textMuted : colors.textMuted}
          />
          <Text style={[styles.actionLabel, deciding && styles.actionLabelDisabled]}>
            Reject
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json && json !== 'null' ? json : null;
  } catch {
    return null;
  }
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    row: {
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.borderSubtle,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      backgroundColor: colors.surfaceAlt },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.md },
    sourceLabel: {
      flexShrink: 0,
      maxWidth: 120,
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted,
      paddingTop: 2 },
    valueWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: Space.xs },
    warningGlyph: {
      flexShrink: 0 },
    value: {
      flexShrink: 1,
      textAlign: 'right',
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    valueInvalid: {
      color: colors.textMuted,
      textDecorationLine: 'line-through' },
    evidenceHit: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0 },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Space.sm,
      marginTop: Space.xs },
    actionHit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xxs,
      minHeight: Control.hit,
      paddingHorizontal: Space.sm },
    actionLabel: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary },
    actionLabelDisabled: {
      color: colors.textMuted } });
