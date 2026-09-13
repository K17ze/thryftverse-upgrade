import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { AgentStudioStyles } from './agentStudioStyles';

/**
 * Status overview — flat text with colored numbers, no cards.
 * Loading: skeleton lines; Populated: counts as typography.
 * Failed: a tappable retry row (partial failures must not masquerade as
 * empty data — the resources hook reports them here).
 */
export function AgentStudioStatusOverview({
  failed,
  onRetry,
  loading,
  agentCount,
  healthyConnections,
  totalConnections,
  pendingApprovalCount,
  onViewPending,
  styles }: {
  failed: boolean;
  onRetry: () => void;
  loading: boolean;
  agentCount: number;
  healthyConnections: number;
  totalConnections: number;
  pendingApprovalCount: number;
  onViewPending: () => void;
  styles: AgentStudioStyles;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('aiAgent');

  if (failed) {
    return (
      <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={{ color: colors.warning, flex: 1 }}>Some agent data couldn't refresh. Tap to retry.</Text>
        <AppIcon name="refresh" size={IconSize.md} color="warning" />
      </Pressable>
    );
  }

  return (
    <View style={styles.summaryWrap}>
      {loading ? (
        <View style={styles.statusSkeleton}>
          <View style={[styles.skeletonLine, { width: '70%', backgroundColor: colors.surfaceAlt }]} />
          <View style={[styles.skeletonLine, { width: '50%', marginTop: Space.xs, backgroundColor: colors.surfaceAlt }]} />
        </View>
      ) : (
        <>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
            <Text style={{ color: agentCount > 0 ? colors.textPrimary : colors.textMuted }}>
              {agentCount}
            </Text>
            {t('status.agents', { count: agentCount })}
            {'  ·  '}
            <Text style={{ color: totalConnections > 0 ? colors.success : colors.textMuted }}>
              {healthyConnections}/{totalConnections}
            </Text>
            {' ' + t('status.connections')}
            {pendingApprovalCount > 0 ? (
              <>
                {'  ·  '}
                <Text style={{ color: colors.warning }}>
                  {t('status.pendingApprovals', { count: pendingApprovalCount })}
                </Text>
              </>
            ) : null}
          </Text>
          <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
            {agentCount === 0 && totalConnections === 0
              ? t('status.subtitleNone')
              : agentCount === 0
                ? t('status.subtitleNoAgents')
                : totalConnections === 0
                  ? t('status.subtitleNoConnections')
                  : t('status.subtitleReady')}
          </Text>
          {pendingApprovalCount > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.pendingAction, { opacity: pressed ? 0.6 : 1 }]}
              onPress={onViewPending}
              accessibilityRole="button"
              accessibilityLabel={`View ${pendingApprovalCount} pending approval${pendingApprovalCount === 1 ? '' : 's'}`}
            >
              <Text style={[styles.pendingActionText, { color: colors.warning }]}>
                {t('status.viewPending', { count: pendingApprovalCount })} →
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}
