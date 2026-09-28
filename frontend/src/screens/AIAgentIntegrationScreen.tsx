import { AgentStudioTabs, type AgentStudioTab } from '../components/agents/AgentStudioTabs';
import { useAgentStudioResources } from '../hooks/useAgentStudioResources';
/**
 * AIAgentIntegrationScreen — "Agent Studio" hub.
 *
 * The single surface for managing agents, server connections, and
 * device-local discovery keys. Re-architected (Phase 7) as a cohesive
 * information-architecture hub rather than a flat settings list.
 *
 * Information architecture (top → bottom):
 *  1. Header — "Agent Studio"
 *  2. Status overview — agents, connections, pending approvals (flat text)
 *  3. Your agents — flat list of custom bots, tap to open detail
 *  4. Server connections — verified server-side keys that power execution
 *  5. Device-local keys — discovery-only keys, collapsed by default
 *  6. Help footer — honest note on what agents can and cannot do
 *
 * Per AGENTS.md §11 (Truthful UI):
 *  - "Verify connection" performs a real provider round-trip (GET /models
 *    or equivalent). The result is labelled "Connected" only after the
 *    provider confirms the key is authorised.
 *  - Status badges are truthful: "Connected" (key verified by provider),
 *    "Not connected" (no key), "Invalid" (failed verification).
 *  - A security note makes clear keys are stored locally on-device only.
 *
 * Design (per AGENTS.md §4):
 *  - Flat canvas, hairline separators, no card-on-card composition.
 *  - Status indicators as colored text, not decorative badges or pills.
 *  - One icon family (Ionicons), consistent optical size.
 *  - Section headers as small caps text, not large bold headers.
 *  - All colors via useAppTheme(), all geometry via design tokens.
 *
 * State coverage (per AGENTS.md §14):
 *  - Loading: skeleton for status overview + agent list while data loads.
 *  - Populated: agent rows, connection rows, provider rows.
 *  - Empty: explanatory empty states, not just "No data".
 *  - Error: invalid format badge with truthful message.
 */

import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import {
  AgentStudioAgentsSection,
  AgentStudioConnectionsSection,
  AgentStudioDeviceKeysSection,
  AgentStudioSecurityNote,
  AgentStudioStatusOverview,
  createAgentStudioStyles } from '../components/agents';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import {
  useBotVersionPrefetch,
  useDeviceProviderKeys,
  useServerConnections } from '../hooks/agents';
import { useAppTranslation } from '../i18n/useAppTranslation';

type Props = NativeStackScreenProps<RootStackParamList, 'AIAgentIntegration'>;

export default function AIAgentIntegrationScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createAgentStudioStyles(colors), [colors]);
  const { t } = useAppTranslation('aiAgent');

  // Server-backed provider connections (Phase 3)
  const providerConnections = useStore(useShallow((s) => s.providerConnections));

  // Agent Studio hub data (Phase 7)
  const pendingApprovals = useStore(useShallow((s) => s.pendingApprovals));

  const [studioTab, setStudioTab] = React.useState<AgentStudioTab>('agents');
  // Per-resource freshness (audit F17): bots / connections / approvals each
  // carry their own loading/ok/stale/error state so a single failure marks
  // only what failed and never reads as confirmed-empty.
  const { resources, reload: reloadResources } = useAgentStudioResources();
  const agentsLoading = resources.bots.status === 'loading';
  const approvalsLoading = resources.approvals.status === 'loading';
  const [showDeviceKeys, setShowDeviceKeys] = React.useState(false);

  const connectionsLoading = resources.connections.status === 'loading';
  // 'error' means the fetch failed before anything loaded — hand the section
  // the failure so it never renders an empty state as confirmed-empty.
  const agentsLoadError = resources.bots.status === 'error' ? resources.bots.errorMessage : null;
  const connectionsLoadError = resources.connections.status === 'error' ? resources.connections.errorMessage : null;
  // Stale = previously loaded data whose last refresh failed — the sections
  // label it in place so scrolled users never read stale rows as fresh.
  const agentsStale = resources.bots.status === 'stale';
  const connectionsStale = resources.connections.status === 'stale';

  // Server connections controller (connect form, reverify/remove, toast).
  const serverConnections = useServerConnections({
    openConnectionsTab: () => setStudioTab('connections') });

  // Device-local provider keys + active agent sessions.
  const deviceKeys = useDeviceProviderKeys();

  // Custom bots + per-bot version prefetch (last published version labels).
  const { customBots, botVersions } = useBotVersionPrefetch(agentsLoading);

  // Status overview derived values (Phase 7).
  const agentCount = customBots.length;
  const healthyConnections = providerConnections.filter(
    (c) => c.healthStatus === 'healthy'
  ).length;
  const totalConnections = providerConnections.length;
  const pendingApprovalCount = pendingApprovals.filter(
    (a) => a.status === 'pending'
  ).length;
  // The overview skeleton tracks only the three fetched resources — the
  // device-local keystore is unrelated and must not hold the gate.
  const statusLoading = connectionsLoading || agentsLoading || approvalsLoading;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('header.title')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* 1. Status overview — flat text with colored numbers, no cards */}
      <AgentStudioStatusOverview
        resources={resources}
        onRetry={(resource) => void reloadResources(resource)}
        loading={statusLoading}
        agentCount={agentCount}
        healthyConnections={healthyConnections}
        totalConnections={totalConnections}
        pendingApprovalCount={pendingApprovalCount}
        onViewPending={() => navigation.navigate('AgentLedger')}
        styles={styles}
      />
      <AgentStudioTabs selected={studioTab} onSelect={(tab) => { haptic.selection(); setStudioTab(tab); }} />
      {studioTab === 'agents' ? (
        <AgentStudioAgentsSection
          loading={agentsLoading}
          customBots={customBots}
          botVersions={botVersions}
          activeAgentSessions={deviceKeys.activeAgentSessions}
          onPauseAll={deviceKeys.handlePauseAllAgents}
          loadError={agentsLoadError}
          stale={agentsStale}
          onRetry={() => void reloadResources('bots')}
          navigation={navigation}
          styles={styles}
        />
      ) : null}
      {studioTab === 'connections' ? (
        <AgentStudioConnectionsSection
          loading={connectionsLoading}
          connections={providerConnections}
          loadError={connectionsLoadError}
          stale={connectionsStale}
          onRetry={() => void reloadResources('connections')}
          controller={serverConnections}
          styles={styles}
        />
      ) : null}
      {studioTab === 'device' ? (
        <AgentStudioDeviceKeysSection
          loading={deviceKeys.loading}
          providers={deviceKeys.providers}
          onPatchProvider={deviceKeys.patchProvider}
          showDeviceKeys={showDeviceKeys}
          onToggleDeviceKeys={() => {
            haptic.light();
            setShowDeviceKeys((v) => !v);
          }}
          onStartEdit={deviceKeys.startEdit}
          onCancelEdit={deviceKeys.cancelEdit}
          onTest={deviceKeys.handleTest}
          onDisconnect={deviceKeys.handleDisconnect}
          styles={styles}
        />
      ) : null}
      {/* Help footer — honest note on what agents can and cannot do */}
      <AgentStudioSecurityNote styles={styles} />
    </FlagshipScreen>
  );
}
