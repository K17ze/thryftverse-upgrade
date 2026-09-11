/**
 * CoOwnCorporateActionRow — lifecycle event timeline entry.
 *
 * Doc 10 §7.1: every corporate action is a first-class timeline entry
 * in the asset dossier and position screen. Each event has a UI label,
 * an effect description, and a status (pending / effective / completed).
 *
 * Events: Distribution, Operating cost, New issuance, Split,
 * Consolidation, Buyback, Compulsory buyout, Revaluation, Insurance
 * proceeds, Liquidation, Vote.
 *
 * Visual treatment (AGENTS.md §4 — Surface Budget):
 * - Flat canvas, no card chrome; hairline separator between rows.
 * - Leading type icon (18pt, textSecondary) in a 44pt hit-target area.
 * - Content: title (bodyStrong) + subtitle/date (meta, textMuted).
 * - Status chip (captionElevated) colored by status, right-aligned.
 * - Documents indicator (14pt) beside the status chip when present.
 * - 44pt minimum hit target; tabular figures for any numbers.
 *
 * See docs/coown/flagship-exchange-upgrade/10 §7.1.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { FontFamily } from '../../theme/fontFamily';

export type CoOwnCorporateActionType =
  | 'distribution'
  | 'operating_cost'
  | 'new_issuance'
  | 'split'
  | 'consolidation'
  | 'buyback'
  | 'compulsory_buyout'
  | 'revaluation'
  | 'insurance_proceeds'
  | 'liquidation'
  | 'vote';

export type CoOwnCorporateActionStatus = 'pending' | 'effective' | 'completed' | 'cancelled';

export interface CoOwnCorporateActionRowProps {
  /** Event type. */
  type: CoOwnCorporateActionType;
  /** Event status. */
  status: CoOwnCorporateActionStatus;
  /** Event date label (e.g. "14 Feb 2025"). */
  dateLabel: string;
  /** Effect description (e.g. "1ZE credited to holders"). */
  effectLabel: string;
  /** Amount label (e.g. "+12.40 1ZE" or "−0.50 1ZE/unit"). */
  amountLabel?: string;
  /** Record date label (e.g. "Record date: 12 Feb"). */
  recordDateLabel?: string;
  /** Payment date label (e.g. "Payment: 18 Feb"). */
  paymentDateLabel?: string;
  /** Whether the action has proposal documents attached. Shows a small
   *  document indicator next to the status chip. */
  hasDocuments?: boolean;
  /** onPress for detail view. */
  onPress?: () => void;
}

const ACTION_CONFIG: Record<CoOwnCorporateActionType, { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  distribution: { label: 'Distribution', icon: 'cash-outline' },
  operating_cost: { label: 'Operating cost', icon: 'document-text-outline' },
  new_issuance: { label: 'New issuance', icon: 'document-text-outline' },
  split: { label: 'Split', icon: 'git-branch-outline' },
  consolidation: { label: 'Consolidation', icon: 'git-branch-outline' },
  buyback: { label: 'Buyback', icon: 'arrow-undo-outline' },
  compulsory_buyout: { label: 'Compulsory buyout', icon: 'exit-outline' },
  revaluation: { label: 'Revaluation', icon: 'document-text-outline' },
  insurance_proceeds: { label: 'Insurance proceeds', icon: 'shield-checkmark-outline' },
  liquidation: { label: 'Liquidation', icon: 'exit-outline' },
  vote: { label: 'Vote', icon: 'podium-outline' },
};

type StatusTone = 'warning' | 'success' | 'danger' | 'neutral';

const STATUS_CONFIG: Record<CoOwnCorporateActionStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  effective: { label: 'Effective', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export function CoOwnCorporateActionRow({
  type,
  status,
  dateLabel,
  effectLabel,
  amountLabel,
  recordDateLabel,
  paymentDateLabel,
  hasDocuments,
  onPress,
}: CoOwnCorporateActionRowProps) {
  const { colors } = useAppTheme();
  const actionCfg = ACTION_CONFIG[type];
  const statusCfg = STATUS_CONFIG[status];

  const statusFill =
    statusCfg.tone === 'success'
      ? colors.successSubtle
      : statusCfg.tone === 'danger'
        ? colors.dangerSubtle
        : statusCfg.tone === 'warning'
          ? colors.warningSubtle
          : colors.surfaceAlt;
  const statusText =
    statusCfg.tone === 'success'
      ? colors.success
      : statusCfg.tone === 'danger'
        ? colors.danger
        : statusCfg.tone === 'warning'
          ? colors.warning
          : colors.textSecondary;

  const amountColor = amountLabel
    ? amountLabel.startsWith('+')
      ? colors.coownUp
      : amountLabel.startsWith('−')
        ? colors.coownDown
        : colors.textPrimary
    : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.container,
        { borderBottomColor: colors.borderSubtle, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${actionCfg.label}, ${statusCfg.label}, ${dateLabel}. ${effectLabel}${amountLabel ? `, ${amountLabel}` : ''}${recordDateLabel ? `, ${recordDateLabel}` : ''}${paymentDateLabel ? `, ${paymentDateLabel}` : ''}`}
    >
      {/* Leading type icon — 44pt hit-target area */}
      <View style={styles.iconArea}>
        <Ionicons name={actionCfg.icon} size={18} color={colors.textSecondary} />
      </View>

      {/* Content */}
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {actionCfg.label}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
          {effectLabel}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {dateLabel}
          {recordDateLabel ? `  ·  ${recordDateLabel}` : ''}
          {paymentDateLabel ? `  ·  ${paymentDateLabel}` : ''}
        </Text>
      </View>

      {/* Right column: amount + status chip + documents indicator */}
      <View style={styles.rightCol}>
        {amountLabel && (
          <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
            {amountLabel}
          </Text>
        )}
        <View style={styles.statusRow}>
          {hasDocuments && (
            <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
          )}
          <View style={[styles.statusChip, { backgroundColor: statusFill }]}>
            <Text style={[styles.statusText, { color: statusText }]} numberOfLines={1}>
              {statusCfg.label}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconArea: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  meta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: Space.xs,
    flexShrink: 0,
    marginLeft: Space.sm,
  },
  amount: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  statusChip: {
    paddingHorizontal: Space.sm - 2,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});

export default CoOwnCorporateActionRow;
