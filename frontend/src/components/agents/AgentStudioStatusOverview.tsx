import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { AgentStudioResourceKey, AgentStudioResources } from '../../hooks/useAgentStudioResources';
import { SecondaryButton } from './AgentStudioButtons';
import type { AgentStudioStyles } from './agentStudioStyles';

const RESOURCE_KEYS: AgentStudioResourceKey[] = ['bots', 'connections', 'approvals'];

const RESOURCE_LABEL_KEY: Record<AgentStudioResourceKey, string> = {
  bots: 'status.resources.agents',
  connections: 'status.resources.connections',
  approvals: 'status.resources.approvals' };

/**
 * Status overview — flat text with colored numbers, no cards.
 * Loading: skeleton lines; Populated: counts as typography.
 * Each resource reports its own freshness (audit F17): a failed or stale
 * resource is marked in place with its full error and a labelled retry —
 * healthy segments keep rendering and a failed fetch never reads as
 * confirmed-empty.
 */
export function AgentStudioStatusOverview({
  resources,
  onRetry,
  loading,
  agentCount,
  healthyConnections,
  totalConnections,
  pendingApprovalCount,
  onViewPending,
  styles }: {
  resources: AgentStudioResources;
  /** When called with a key, retries only that resource; without a key,
   *  refreshes everything. */
  onRetry: (resource?: AgentStudioResourceKey) => void;
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

  const anyResolved = RESOURCE_KEYS.some((key) => resources[key].status !== 'loading');
  const agentsKnown = resources.bots.status === 'ok' || resources.bots.status === 'stale';
  const connectionsKnown = resources.connections.status === 'ok' || resources.connections.status === 'stale';
  const approvalsKnown = resources.approvals.status === 'ok' || resources.approvals.status === 'stale';

  // Skeleton only until the first resource resolves — a single-resource
  // retry keeps healthy information on screen instead of blanking the page.
  if (loading && !anyResolved) {
    return (
      <View style={styles.summaryWrap}>
        <View style={styles.statusSkeleton}>
          <View style={[styles.skeletonLine, { width: '70%', backgroundColor: colors.surfaceAlt }]} />
          <View style={[styles.skeletonLine, { width: '50%', marginTop: Space.xs, backgroundColor: colors.surfaceAlt }]} />
        </View>
      </View>
    );
  }

  // Healthy segments keep their position; unresolved resources are covered
  // by an issue row below rather than a misleading count.
  const segments: React.ReactNode[] = [];
  if (agentsKnown) {
    segments.push(
      <React.Fragment key="bots">
        <Text style={{ color: agentCount > 0 ? colors.textPrimary : colors.textMuted }}>
          {agentCount}
        </Text>
        {t('status.agents', { count: agentCount })}
      </React.Fragment>);
  }
  if (connectionsKnown) {
    segments.push(
      <React.Fragment key="connections">
        {/* Health derives from the healthy/total RATIO, never from
            totalConnections > 0 — 0/2 healthy is a failure state, not
            success (F11): all-healthy=success, some=warning, none=danger,
            no connections at all=muted. */}
        <Text style={{
          color: totalConnections === 0
            ? colors.textMuted
            : healthyConnections === totalConnections
              ? colors.successText
              : healthyConnections === 0
                ? colors.dangerText
                : colors.warningText,
        }}>
          {healthyConnections}/{totalConnections}
        </Text>
        {' ' + t('status.connections')}
      </React.Fragment>);
  }
  if (approvalsKnown && pendingApprovalCount > 0) {
    segments.push(
      <React.Fragment key="approvals">
        <Text style={{ color: colors.warningText }}>
          {t('status.pendingApprovals', { count: pendingApprovalCount })}
        </Text>
      </React.Fragment>);
  }

  const issueRows = RESOURCE_KEYS
    .map((key) => ({ key, state: resources[key] }))
    .filter(({ state }) => state.status === 'error' || state.status === 'stale' || state.status === 'loading');

  return (
    <View style={styles.summaryWrap}>
      {segments.length > 0 ? (
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
          {segments.map((segment, index) => (
            <React.Fragment key={index}>
              {index > 0 ? '  ·  ' : ''}
              {segment}
            </React.Fragment>
          ))}
        </Text>
      ) : null}
      {agentsKnown && connectionsKnown ? (
        <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
          {agentCount === 0 && totalConnections === 0
            ? t('status.subtitleNone')
            : agentCount === 0
              ? t('status.subtitleNoAgents')
              : totalConnections === 0
                ? t('status.subtitleNoConnections')
                : healthyConnections === totalConnections
                  ? t('status.subtitleReady')
                  : healthyConnections === 0
                    ? t('status.subtitleNoHealthy')
                    : t('status.subtitleDegraded', { healthy: healthyConnections, total: totalConnections })}
        </Text>
      ) : null}

      {/* Per-resource freshness: only the affected resource is marked,
          with its full error verbatim and a retry that names what is
          being refreshed. */}
      {issueRows.map(({ key, state }) => {
        const resource = t(RESOURCE_LABEL_KEY[key]);
        const headline = state.status === 'loading'
          ? t('status.resourceRefreshing', { resource })
          : state.status === 'stale'
            ? t('status.resourceStale', { resource })
            : t('status.resourceFailed', { resource });
        return (
          <View key={key} style={styles.statusIssueRow}>
            <Text
              style={[styles.flatRowSubtitle, { color: state.status === 'loading' ? colors.textMuted : colors.warningText }]}
            >
              {headline}
            </Text>
            {state.errorMessage ? (
              <Text style={[styles.flatRowCaveat, { color: colors.textSecondary }]}>
                {state.errorMessage}
              </Text>
            ) : null}
            {state.status !== 'loading' ? (
              <View style={styles.actionRow}>
                <SecondaryButton
                  label={t('status.retryResource', { resource })}
                  onPress={() => onRetry(key)}
                  colors={colors}
                  styles={styles}
                />
              </View>
            ) : null}
          </View>
        );
      })}

      {approvalsKnown && pendingApprovalCount > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.pendingAction, { opacity: pressed ? 0.6 : 1 }]}
          onPress={onViewPending}
          accessibilityRole="button"
          accessibilityLabel={t('status.viewPending', { count: pendingApprovalCount })}
        >
          <Text style={[styles.pendingActionText, { color: colors.warningText }]}>
            {t('status.viewPending', { count: pendingApprovalCount })} →
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
