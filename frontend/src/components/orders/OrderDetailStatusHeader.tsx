import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { formatTimelineDate } from '../../utils/orderDetailLogic';
import { DispatchCountdown } from './DispatchCountdown';
import {
  orderDetailScreenStyles as styles,
  createOrderDetailThemedStyles } from './orderDetailScreenStyles';

interface OrderDetailStatusHeaderProps {
  shortOrderId: string;
  statusLabel: string;
  statusExplanation: string;
  statusColor: string;
  statusSubtleColor: string;
  updatedAt?: string;
  canDispatch: boolean | undefined;
  shipByDate: string | null;
  shipped: boolean;
}

/**
 * Current order status + order number block. Relocated verbatim from
 * OrderDetailScreen — includes the dispatch countdown for sellers when
 * the order needs shipping.
 */
export function OrderDetailStatusHeader({
  shortOrderId,
  statusLabel,
  statusExplanation,
  statusColor,
  statusSubtleColor,
  updatedAt,
  canDispatch,
  shipByDate,
  shipped }: OrderDetailStatusHeaderProps) {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createOrderDetailThemedStyles(colors), [colors]);

  return (
    <View style={styles.statusHeader}>
      <Text style={[styles.orderNumber, themed.orderNumber]}>Order #{shortOrderId}</Text>
      <View style={styles.statusBadgeRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusSubtleColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>
      <Text style={[styles.statusExplanation, themed.statusExplanation]}>{statusExplanation}</Text>
      {updatedAt ? (
        <Text style={[styles.lastUpdated, themed.lastUpdated]}>
          Last updated {formatTimelineDate(updatedAt)}
        </Text>
      ) : null}

      {/* Dispatch countdown for seller when order needs shipping */}
      {canDispatch && (
        <DispatchCountdown
          shipByDate={shipByDate}
          shipped={shipped}
        />
      )}
    </View>
  );
}
