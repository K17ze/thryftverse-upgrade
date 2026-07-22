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
 * See docs/coown/flagship-exchange-upgrade/10 §7.1.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

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
  /** onPress for detail view. */
  onPress?: () => void;
}

const ACTION_CONFIG: Record<CoOwnCorporateActionType, { label: string; icon: string }> = {
  distribution: { label: 'Distribution', icon: 'cash-outline' },
  operating_cost: { label: 'Operating cost', icon: 'receipt-outline' },
  new_issuance: { label: 'New issuance', icon: 'add-circle-outline' },
  split: { label: 'Split', icon: 'git-branch-outline' },
  consolidation: { label: 'Consolidation', icon: 'merge-outline' },
  buyback: { label: 'Buyback', icon: 'arrow-undo-circle-outline' },
  compulsory_buyout: { label: 'Compulsory buyout', icon: 'exit-outline' },
  revaluation: { label: 'Revaluation', icon: 'trending-up-outline' },
  insurance_proceeds: { label: 'Insurance proceeds', icon: 'shield-checkmark-outline' },
  liquidation: { label: 'Liquidation', icon: 'cube-outline' },
  vote: { label: 'Vote', icon: 'ballot-outline' },
};

const STATUS_CONFIG: Record<CoOwnCorporateActionStatus, { label: string; color: 'success' | 'textSecondary' | 'danger' | 'warning' }> = {
  pending: { label: 'Pending', color: 'warning' },
  effective: { label: 'Effective', color: 'success' },
  completed: { label: 'Completed', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'textSecondary' },
};

export function CoOwnCorporateActionRow({
  type,
  status,
  dateLabel,
  effectLabel,
  amountLabel,
  recordDateLabel,
  paymentDateLabel,
  onPress,
}: CoOwnCorporateActionRowProps) {
  const { colors } = useAppTheme();
  const actionCfg = ACTION_CONFIG[type];
  const statusCfg = STATUS_CONFIG[status];
  const statusColor = statusCfg.color === 'success'
    ? colors.success
    : statusCfg.color === 'danger'
      ? colors.danger
      : statusCfg.color === 'warning'
        ? colors.warning
        : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${actionCfg.label}, ${statusCfg.label}, ${dateLabel}. ${effectLabel}${amountLabel ? `, ${amountLabel}` : ''}${recordDateLabel ? `, ${recordDateLabel}` : ''}${paymentDateLabel ? `, ${paymentDateLabel}` : ''}`}
    >
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: colors.brand + '12' }]}>
        <Ionicons name={actionCfg.icon as any} size={16} color={colors.brand} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {actionCfg.label}
          </Text>
          <Text style={[styles.date, { color: colors.textMuted }]} numberOfLines={1}>
            {dateLabel}
          </Text>
        </View>
        <Text style={[styles.effect, { color: colors.textSecondary }]} numberOfLines={2}>
          {effectLabel}
        </Text>
        {(recordDateLabel || paymentDateLabel) && (
          <View style={styles.datesRow}>
            {recordDateLabel && (
              <Text style={[styles.dateLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {recordDateLabel}
              </Text>
            )}
            {paymentDateLabel && (
              <Text style={[styles.dateLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {paymentDateLabel}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Amount + status */}
      <View style={styles.rightCol}>
        {amountLabel && (
          <Text
            style={[
              styles.amount,
              { color: amountLabel.startsWith('+') ? colors.success : amountLabel.startsWith('−') ? colors.danger : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {amountLabel}
          </Text>
        )}
        <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
            {statusCfg.label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  date: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
    flexShrink: 0,
  },
  effect: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 1,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  datesRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: 2,
  },
  dateLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
    minWidth: 60,
  },
  amount: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
});

export default CoOwnCorporateActionRow;
