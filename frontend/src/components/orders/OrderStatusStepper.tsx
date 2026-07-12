import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';

// ── Types ────────────────────────────────────────────────────────────────────

export type OrderStepperStage =
  | 'placed'
  | 'paid'
  | 'shipped'
  | 'in_transit'
  | 'delivered';

export interface OrderStatusStepperProps {
  /** Current stage of the order */
  currentStage: OrderStepperStage;
  /** Whether the order has been cancelled/refunded/returned */
  isFailure?: boolean;
  /** Failure label when isFailure is true */
  failureLabel?: string;
  /** Optional timestamps for completed stages (ISO strings) */
  stageTimestamps?: Partial<Record<OrderStepperStage, string>>;
}

// ── Stage config ─────────────────────────────────────────────────────────────

interface StageConfig {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}

const STAGE_CONFIG: Record<OrderStepperStage, StageConfig> = {
  placed: { icon: 'receipt-outline', label: 'Placed' },
  paid: { icon: 'checkmark-circle-outline', label: 'Paid' },
  shipped: { icon: 'cube-outline', label: 'Shipped' },
  in_transit: { icon: 'car-outline', label: 'In transit' },
  delivered: { icon: 'checkmark-done-circle-outline', label: 'Delivered' },
};

const STAGE_ORDER: OrderStepperStage[] = ['placed', 'paid', 'shipped', 'in_transit', 'delivered'];

// ── Component ────────────────────────────────────────────────────────────────

export function OrderStatusStepper({
  currentStage,
  isFailure = false,
  failureLabel = 'Cancelled',
  stageTimestamps,
}: OrderStatusStepperProps) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  function formatStageDate(value?: string): string | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (isFailure) {
    return (
      <View style={[styles.container, styles.failureContainer]}>
        <View style={[styles.stageIconWrap, styles.failureIconWrap]}>
          <Ionicons name="close-circle" size={20} color={Colors.danger} />
        </View>
        <Text style={[styles.failureLabel, { color: Colors.danger }]}>{failureLabel}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {STAGE_ORDER.map((stage, index) => {
        const config = STAGE_CONFIG[stage];
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;
        const isLast = index === STAGE_ORDER.length - 1;

        const iconColor = isCompleted || isCurrent ? Colors.brand : Colors.textMuted;
        const labelColor = isCompleted || isCurrent ? Colors.textPrimary : Colors.textMuted;
        const lineColor = isCompleted ? Colors.brand : Colors.border;

        return (
          <React.Fragment key={stage}>
            <View style={styles.stageColumn}>
              <View
                style={[
                  styles.stageIconWrap,
                  { backgroundColor: isCompleted || isCurrent ? `${Colors.brand}15` : Colors.surfaceAlt },
                  isCurrent && styles.stageIconWrapActive,
                ]}
              >
                <Ionicons name={config.icon as any} size={16} color={iconColor} />
              </View>
              <Text
                style={[
                  styles.stageLabel,
                  { color: labelColor },
                  isCurrent && styles.stageLabelActive,
                ]}
                numberOfLines={1}
              >
                {config.label}
              </Text>
              {isCompleted && stageTimestamps?.[stage] ? (
                <Text style={styles.stageTimestamp} numberOfLines={1}>
                  {formatStageDate(stageTimestamps[stage])}
                </Text>
              ) : null}
            </View>
            {!isLast && (
              <View style={styles.connectorWrap}>
                <View style={[styles.connectorLine, { backgroundColor: lineColor }]} />
              </View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Space.sm + 2,
  },
  stageColumn: {
    alignItems: 'center',
    gap: 4,
    width: 52,
  },
  stageIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageIconWrapActive: {
    borderWidth: 2,
    borderColor: Colors.brand,
  },
  stageLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  stageLabelActive: {
    fontFamily: Typography.family.semibold,
  },
  stageTimestamp: {
    fontSize: 8,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
  connectorWrap: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  connectorLine: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    marginTop: -14,
  },
  failureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
  },
  failureIconWrap: {
    backgroundColor: `${Colors.danger}15`,
  },
  failureLabel: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
});
