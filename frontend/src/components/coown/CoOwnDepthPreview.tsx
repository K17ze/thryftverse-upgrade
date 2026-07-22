/**
 * CoOwnDepthPreview — mini depth-impact bar for the expanded order ticket.
 *
 * Shows what fraction of ±2% depth the proposed order would consume.
 * Uses DEPTH_COLORS (low-alpha bars) from the Phase 0 color system.
 * If the order would slip beyond visible depth, shows a warning instead.
 *
 * See docs/coown/flagship-exchange-upgrade/05 §1 (Expanded → DEPTH IMPACT).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { DEPTH_COLORS } from '../../constants/colors';

export interface CoOwnDepthPreviewProps {
  /** Units the order would consume. */
  orderUnits: number;
  /** Total executable units within ±2% band. */
  depthUnits: number;
  /** True if the order would slip beyond visible depth. */
  slippageBeyondDepth: boolean;
  /** Mid price for context. */
  midPrice: number;
}

export function CoOwnDepthPreview({
  orderUnits,
  depthUnits,
  slippageBeyondDepth,
  midPrice,
}: CoOwnDepthPreviewProps) {
  const { colors } = useAppTheme();

  // Consume fraction = orderUnits / depthUnits (capped at 1.0 for the bar).
  const consumePct = depthUnits > 0
    ? Math.min(100, Math.round((orderUnits / depthUnits) * 100))
    : 0;
  const isHighImpact = consumePct >= 50;

  if (slippageBeyondDepth) {
    return (
      <View style={styles.container}>
        <Text style={[styles.header, { color: colors.textMuted }]}>
          Depth impact
        </Text>
        <View style={[styles.warningRow, { backgroundColor: colors.warning + '14' }]}>
          <Ionicons name="warning-outline" size={14} color={colors.warning} />
          <Text style={[styles.warningText, { color: colors.warning }]}>
            Slippage beyond visible depth — use limit
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { color: colors.textMuted }]}>
        Depth impact
      </Text>
      <View style={styles.barRow}>
        <View style={[styles.barBg, { backgroundColor: colors.surfaceAlt }]}>
          <View
            style={[
              styles.barFill,
              {
                width: `${consumePct}%`,
                backgroundColor: isHighImpact ? colors.warning : DEPTH_COLORS.bidBar,
              },
            ]}
          />
        </View>
        <Text
          style={[
            styles.barLabel,
            { color: isHighImpact ? colors.warning : colors.textSecondary },
          ]}
        >
          {consumePct}%
        </Text>
      </View>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        consumes {consumePct}% of ±2% depth
        {midPrice > 0 && ` · mid ${midPrice.toFixed(2)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.xs,
  },
  header: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  barBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  barLabel: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    minWidth: 36,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  caption: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
  },
  warningText: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
});

export default CoOwnDepthPreview;
