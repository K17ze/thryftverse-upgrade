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
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import {
  AIProvider,
  PROVIDER_CONFIGS,
  PROVIDER_ORDER,
  validateKeyFormat,
  validateBaseUrl,
  maskApiKey,
  saveApiKey,
  removeApiKey,
  getApiKey,
  getConnectedProviders,
  testApiKey,
  discoverModels,
  type ConnectedProvider,
  type DiscoveredModel,
  type TestResult,
} from '../services/aiProviderApi';
import {
  pauseAllAgents,
  getActiveAgentSessionCount,
} from '../services/chatAgentsApi';
import { useStore } from '../store/useStore';
import type { ProviderConnectionInfo } from '../services/botsApi';
import { AgentIcon } from '../components/agents/AgentIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'AIAgentIntegration'>;

// Demo mode is no longer needed — testApiKey now performs a real provider
// round-trip. This flag is kept for backward-compatible UI gating only.
const AI_PROVIDER_DEMO_MODE = false;

type ConnectionStatus = 'connected' | 'not_connected' | 'invalid';

interface ProviderState {
  stored: ConnectedProvider | null;
  editing: boolean;
  keyInput: string;
  baseUrlInput: string;
  testing: boolean;
  testResult: TestResult | null;
  /** Provider-authoritative models discovered via the /models endpoint.
   *  Null = not yet discovered; empty array = discovered but none found. */
  discoveredModels: DiscoveredModel[] | null;
  discovering: boolean;
}

export default function AIAgentIntegrationScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = React.useState(true);
  const [providers, setProviders] = React.useState<Record<AIProvider, ProviderState>>({
    openai: emptyProviderState(),
    anthropic: emptyProviderState(),
    gemini: emptyProviderState(),
    custom: emptyProviderState(),
  });
  const [activeAgentSessions, setActiveAgentSessions] = React.useState(0);

  // Server-backed provider connections (Phase 3)
  const providerConnections = useStore((s) => s.providerConnections);
  const loadProviderConnections = useStore((s) => s.loadProviderConnections);
  const createProviderConnection = useStore((s) => s.createProviderConnection);
  const deleteProviderConnection = useStore((s) => s.deleteProviderConnection);
  const reverifyProviderConnection = useStore((s) => s.reverifyProviderConnection);

  // Agent Studio hub data (Phase 7)
  const customBots = useStore((s) => s.customBots);
  const loadBotsFromApi = useStore((s) => s.loadBotsFromApi);
  const pendingApprovals = useStore((s) => s.pendingApprovals);
  const loadPendingApprovals = useStore((s) => s.loadPendingApprovals);
  const botVersions = useStore((s) => s.botVersions);
  const loadBotVersions = useStore((s) => s.loadBotVersions);

  const [agentsLoading, setAgentsLoading] = React.useState(true);
  const [approvalsLoading, setApprovalsLoading] = React.useState(true);
  const [showDeviceKeys, setShowDeviceKeys] = React.useState(false);

  const [connectionsLoading, setConnectionsLoading] = React.useState(true);
  const [showConnectForm, setShowConnectForm] = React.useState(false);
  const [connectProvider, setConnectProvider] = React.useState<'openai' | 'anthropic' | 'gemini' | 'custom'>('openai');
  const [connectKey, setConnectKey] = React.useState('');
  const [connectLabel, setConnectLabel] = React.useState('');
  const [connectBaseUrl, setConnectBaseUrl] = React.useState('');
  const [creatingConnection, setCreatingConnection] = React.useState(false);
  const [reverifyingId, setReverifyingId] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<{ connection: ProviderConnectionInfo; affectedAgents: string[] } | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const showToast = React.useCallback((kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
  }, []);

  // Auto-dismiss toast after a few seconds.
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Load stored keys on mount, then discover models for connected providers.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const connected = await getConnectedProviders();
        if (!mounted) return;
        const next = { ...providers };
        for (const c of connected) {
          next[c.provider] = {
            stored: c,
            editing: false,
            keyInput: '',
            baseUrlInput: c.baseUrl ?? '',
            testing: false,
            testResult: null,
            discoveredModels: null,
            discovering: true,
          };
        }
        setProviders(next);
        setLoading(false);

        // Discover models for each connected provider (spec 04: dynamic
        // model discovery — provider-authoritative, not hardcoded).
        for (const c of connected) {
          const models = await discoverModels(c.provider);
          if (!mounted) return;
          setProviders((prev) => ({
            ...prev,
            [c.provider]: {
              ...prev[c.provider],
              discoveredModels: models,
              discovering: false,
            },
          }));
        }
      } catch {
        // Storage read failure — leave all providers not-connected.
        if (mounted) setLoading(false);
      }
    })();
    // Refresh active agent session count on mount.
    setActiveAgentSessions(getActiveAgentSessionCount());
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load server-backed provider connections on mount (Phase 3).
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      await loadProviderConnections();
      if (mounted) setConnectionsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [loadProviderConnections]);

  // Load custom bots and pending approvals for the status overview (Phase 7).
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Promise.all([
          loadBotsFromApi(),
          loadPendingApprovals(),
        ]);
      } catch {
        // Non-fatal — status overview degrades gracefully.
      } finally {
        if (mounted) {
          setAgentsLoading(false);
          setApprovalsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadBotsFromApi, loadPendingApprovals]);

  // Load versions for each custom bot so we can show the last published version.
  React.useEffect(() => {
    if (agentsLoading) return;
    for (const bot of customBots) {
      if (!botVersions[bot.id]) {
        loadBotVersions(bot.id);
      }
    }
  }, [customBots, agentsLoading, botVersions, loadBotVersions]);

  const connectedCount = PROVIDER_ORDER.filter((p) => providers[p].stored).length;

  // Status overview derived values (Phase 7).
  const agentCount = customBots.length;
  const healthyConnections = providerConnections.filter(
    (c) => c.healthStatus === 'healthy'
  ).length;
  const totalConnections = providerConnections.length;
  const pendingApprovalCount = pendingApprovals.filter(
    (a) => a.status === 'pending'
  ).length;
  const statusLoading = loading || connectionsLoading || agentsLoading || approvalsLoading;

  const getLastPublishedVersion = (botId: string): number | null => {
    const versions = botVersions[botId];
    if (!versions || versions.length === 0) return null;
    return versions[0].versionNumber;
  };

  const startEdit = (provider: AIProvider) => {
    haptic.light();
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        editing: true,
        keyInput: '',
        baseUrlInput: prev[provider].stored?.baseUrl ?? '',
        testResult: null,
      },
    }));
  };

  const cancelEdit = (provider: AIProvider) => {
    haptic.light();
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        editing: false,
        keyInput: '',
        baseUrlInput: prev[provider].stored?.baseUrl ?? '',
        testResult: null,
      },
    }));
  };

  const handleTest = async (provider: AIProvider) => {
    const state = providers[provider];
    const config = PROVIDER_CONFIGS[provider];
    haptic.light();

    setProviders((prev) => ({ ...prev, [provider]: { ...prev[provider], testing: true, testResult: null } }));

    // Perform a real provider round-trip to verify the key is authorised.
    const result = await testApiKey(provider, state.keyInput, state.baseUrlInput.trim() || undefined, true);

    if (result.status === 'invalid') {
      setProviders((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], testing: false, testResult: result },
      }));
      haptic.medium();
      return;
    }

    // Key verified by provider — refresh stored state.
    const refreshed = await getApiKey(provider);
    const connected: ConnectedProvider | null = refreshed
      ? { ...refreshed, config }
      : null;

    setProviders((prev) => ({
      ...prev,
      [provider]: {
        stored: connected,
        editing: false,
        keyInput: '',
        baseUrlInput: connected?.baseUrl ?? '',
        testing: false,
        testResult: result,
        // Store the models discovered during the probe (spec 04).
        discoveredModels: result.models ?? prev[provider].discoveredModels,
        discovering: false,
      },
    }));
    haptic.selection();
  };

  const handleDisconnect = async (provider: AIProvider) => {
    haptic.light();
    await removeApiKey(provider);
    setProviders((prev) => ({
      ...prev,
      [provider]: emptyProviderState(),
    }));
    haptic.selection();
  };

  const handlePauseAllAgents = () => {
    if (activeAgentSessions === 0) return;
    haptic.medium();
    pauseAllAgents();
    setActiveAgentSessions(0);
    haptic.selection();
  };

  const openConnectForm = () => {
    haptic.light();
    setShowConnectForm(true);
    setConnectProvider('openai');
    setConnectKey('');
    setConnectLabel('');
    setConnectBaseUrl('');
  };

  const cancelConnectForm = () => {
    haptic.light();
    setShowConnectForm(false);
    setConnectKey('');
    setConnectLabel('');
    setConnectBaseUrl('');
  };

  const handleCreateConnection = async () => {
    if (connectKey.trim().length === 0) return;
    haptic.light();
    setCreatingConnection(true);
    try {
      await createProviderConnection({
        provider: connectProvider,
        apiKey: connectKey.trim(),
        label: connectLabel.trim() || undefined,
        baseUrl: connectBaseUrl.trim() || undefined,
      });
      if (connectProvider !== 'openai') {
        // Should not happen — form gates non-openai providers.
        return;
      }
      setShowConnectForm(false);
      setConnectKey('');
      setConnectLabel('');
      setConnectBaseUrl('');
      showToast('success', 'Connection verified and saved.');
      haptic.selection();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not verify the key. Check the key and try again.';
      showToast('error', message);
      haptic.medium();
    } finally {
      setCreatingConnection(false);
    }
  };

  const handleReverify = async (connectionId: string) => {
    haptic.light();
    setReverifyingId(connectionId);
    try {
      await reverifyProviderConnection(connectionId);
      showToast('success', 'Connection re-verified.');
      haptic.selection();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Re-verification failed.';
      showToast('error', message);
      haptic.medium();
    } finally {
      setReverifyingId(null);
    }
  };

  const handleRequestRemove = async (connection: ProviderConnectionInfo) => {
    haptic.light();
    // Optimistically fetch affected agents via the delete call, but we want to
    // confirm first. The backend returns affectedAgents on delete, so we
    // perform a two-step: show a confirmation, then delete on confirm.
    // Since we can't know affected agents without deleting, we show a generic
    // confirmation and surface the affected agents count after deletion.
    setConfirmRemove({ connection, affectedAgents: [] });
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return;
    const { connection } = confirmRemove;
    haptic.medium();
    setRemovingId(connection.id);
    try {
      const affectedAgents = await deleteProviderConnection(connection.id);
      setConfirmRemove(null);
      if (affectedAgents.length > 0) {
        showToast('success', `Removed. ${affectedAgents.length} agent${affectedAgents.length === 1 ? '' : 's'} updated.`);
      } else {
        showToast('success', 'Connection removed.');
      }
      haptic.selection();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove connection.';
      showToast('error', message);
      haptic.medium();
    } finally {
      setRemovingId(null);
    }
  };

  const cancelConfirmRemove = () => {
    haptic.light();
    setConfirmRemove(null);
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Agent Studio"
          subtitle="Manage agents, connections, and keys"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Demo mode indicator (truthful UI per AGENTS.md §11) ── */}
      {AI_PROVIDER_DEMO_MODE && (
        <View
          style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="header"
          accessibilityLabel="Demo mode"
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            Keys are validated by format only — no live request is sent to any provider.
          </Text>
        </View>
      )}

      {/* ───────────────────────────────────────────────────────────────────
          1. Status overview — flat text with colored numbers, no cards
          Loading: skeleton lines; Populated: counts as typography
      ──────────────────────────────────────────────────────────────────── */}
      <View style={styles.summaryWrap}>
        {statusLoading ? (
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
              {' agent' + (agentCount === 1 ? '' : 's')}
              {'  ·  '}
              <Text style={{ color: totalConnections > 0 ? colors.success : colors.textMuted }}>
                {healthyConnections}/{totalConnections}
              </Text>
              {' connections'}
              {pendingApprovalCount > 0 ? (
                <>
                  {'  ·  '}
                  <Text style={{ color: colors.warning }}>
                    {pendingApprovalCount} pending approval{pendingApprovalCount === 1 ? '' : 's'}
                  </Text>
                </>
              ) : null}
            </Text>
            <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
              {agentCount === 0 && totalConnections === 0
                ? 'Create an agent and connect a provider to get started'
                : agentCount === 0
                  ? 'Connect a provider, then create your first agent'
                  : totalConnections === 0
                    ? 'Connect a provider server-side to power agent execution'
                    : 'Agents run on your connected server-side keys'}
            </Text>
            {pendingApprovalCount > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.pendingAction, { opacity: pressed ? 0.6 : 1 }]}
                onPress={() => navigation.navigate('AgentLedger')}
                accessibilityRole="button"
                accessibilityLabel={`View ${pendingApprovalCount} pending approval${pendingApprovalCount === 1 ? '' : 's'}`}
              >
                <Text style={[styles.pendingActionText, { color: colors.warning }]}>
                  View {pendingApprovalCount} pending approval{pendingApprovalCount === 1 ? '' : 's'} →
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      {/* ───────────────────────────────────────────────────────────────────
          2. Your agents — flat list of custom bots
      ──────────────────────────────────────────────────────────────────── */}
      <View style={styles.sectionLabelWrap}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR AGENTS</Text>
      </View>

      {agentsLoading ? (
        <View style={styles.agentListSkeleton}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={[styles.skeletonIcon, { backgroundColor: colors.surfaceAlt }]} />
              <View style={styles.skeletonCopy}>
                <View style={[styles.skeletonLine, { width: '45%', backgroundColor: colors.surfaceAlt }]} />
                <View style={[styles.skeletonLine, { width: '65%', marginTop: Space.xs, backgroundColor: colors.surfaceAlt }]} />
              </View>
            </View>
          ))}
        </View>
      ) : customBots.length === 0 ? (
        <View style={styles.emptyAgents}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No agents yet. Create one to give it a specialty, boundaries, and context.
          </Text>
        </View>
      ) : (
        <View>
          {customBots.map((bot, index) => {
            const isLast = index === customBots.length - 1;
            const statusColor = bot.isDraft
              ? colors.textMuted
              : bot.isDisabled
                ? colors.danger
                : bot.runtimeReady === false
                  ? colors.warning
                  : colors.success;
            const statusLabel = bot.isDraft
              ? 'Draft'
              : bot.isDisabled
                ? 'Disabled'
                : bot.runtimeReady === false
                  ? 'Setup needed'
                  : 'Published';
            const runtimeLabel = bot.runtimeMode === 'ai' ? 'AI' : (bot.runtimeMode ?? 'AI');
            const lastVersion = getLastPublishedVersion(bot.id);
            return (
              <React.Fragment key={bot.id}>
                <Pressable
                  style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => navigation.navigate('BotDetail', { botId: bot.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${bot.name}`}
                >
                  <AgentIcon category={bot.category} name={bot.name} size={20} color={colors.textPrimary} />
                  <View style={styles.flatRowText}>
                    <Text style={[styles.flatRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {bot.name}
                    </Text>
                    <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {runtimeLabel}
                      {lastVersion !== null ? ` · v${lastVersion}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.providerStatus, { color: statusColor }]} numberOfLines={1}>
                    {statusLabel}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
                {!isLast ? (
                  <View style={[styles.flatRowSeparator, { backgroundColor: colors.border }]} />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* Create agent — flat text button */}
      <Pressable
        style={({ pressed }) => [styles.createAgentBtn, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => {
          haptic.light();
          navigation.navigate('BotBuilder', {});
        }}
        accessibilityRole="button"
        accessibilityLabel="Create agent"
      >
        <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
        <Text style={[styles.createAgentText, { color: colors.brand }]}>Create agent</Text>
      </Pressable>

      {/* Agent management quick actions — flat rows */}
      <Pressable
        style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={handlePauseAllAgents}
        disabled={activeAgentSessions === 0}
        accessibilityRole="button"
        accessibilityLabel={
          activeAgentSessions === 0
            ? 'Pause all agents — none running'
            : `Pause all agents — ${activeAgentSessions} running`
        }
      >
        <Ionicons
          name="pause-circle-outline"
          size={20}
          color={activeAgentSessions > 0 ? colors.danger : colors.textMuted}
        />
        <View style={styles.flatRowText}>
          <Text
            style={[
              styles.flatRowTitle,
              { color: activeAgentSessions > 0 ? colors.textPrimary : colors.textMuted },
            ]}
          >
            Pause all agents
          </Text>
          <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {activeAgentSessions > 0
              ? `${activeAgentSessions} agent session${activeAgentSessions === 1 ? '' : 's'} running`
              : 'No agent sessions running'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
      <View style={[styles.flatRowSeparator, { backgroundColor: colors.border }]} />
      <Pressable
        style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => navigation.navigate('AgentLedger')}
        accessibilityRole="button"
        accessibilityLabel="View agent activity ledger"
      >
        <Ionicons name="list-outline" size={20} color={colors.textPrimary} />
        <View style={styles.flatRowText}>
          <Text style={[styles.flatRowTitle, { color: colors.textPrimary }]}>
            Agent activity
          </Text>
          <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            Local log of agent actions and approvals
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>

      {/* ───────────────────────────────────────────────────────────────────
          3. Server connections — verified server-side keys (power execution)
      ──────────────────────────────────────────────────────────────────── */}
      <View style={styles.sectionLabelWrap}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SERVER CONNECTIONS</Text>
      </View>
      <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
        Keys verified and stored encrypted on the server. These power agent execution.
      </Text>

      {/* Connect server-side action row */}
      {!showConnectForm ? (
        <Pressable
          style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
          onPress={openConnectForm}
          accessibilityRole="button"
          accessibilityLabel="Connect a provider server-side"
        >
          <Ionicons name="server-outline" size={20} color={colors.brand} />
          <View style={styles.flatRowText}>
            <Text style={[styles.flatRowTitle, { color: colors.textPrimary }]}>
              Connect server-side
            </Text>
            <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              Keys are verified and stored encrypted on the server.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {/* Inline connect form */}
      {showConnectForm ? (
        <View style={styles.connectFormBody}>
          {/* Provider selector — OpenAI only for now */}
          <View style={styles.providerSelectorWrap}>
            {(['openai', 'anthropic', 'gemini', 'custom'] as const).map((p) => {
              const isAvailable = p === 'openai';
              const isSelected = connectProvider === p && isAvailable;
              const label = p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : p === 'gemini' ? 'Gemini' : 'Custom';
              return (
                <Pressable
                  key={p}
                  style={({ pressed }) => [
                    styles.providerChip,
                    {
                      borderColor: isSelected ? colors.brand : colors.border,
                      backgroundColor: isSelected ? colors.brandSubtle : colors.surface,
                      opacity: isAvailable ? (pressed ? 0.7 : 1) : 0.5,
                    },
                  ]}
                  onPress={() => isAvailable && (haptic.light(), setConnectProvider(p))}
                  disabled={!isAvailable}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}${isAvailable ? '' : ' — coming soon'}`}
                >
                  <Text
                    style={[
                      styles.providerChipText,
                      { color: isSelected ? colors.brand : isAvailable ? colors.textPrimary : colors.textMuted },
                    ]}
                  >
                    {label}
                  </Text>
                  {!isAvailable ? (
                    <Text style={[styles.providerChipSoon, { color: colors.textMuted }]}>Soon</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Ionicons name="key-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder="API key"
              placeholderTextColor={colors.textMuted}
              value={connectKey}
              onChangeText={setConnectKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="Server connection API key"
            />
          </View>

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder="Label (optional)"
              placeholderTextColor={colors.textMuted}
              value={connectLabel}
              onChangeText={setConnectLabel}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Server connection label"
            />
          </View>

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Ionicons name="link-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder="Base URL (optional, custom providers)"
              placeholderTextColor={colors.textMuted}
              value={connectBaseUrl}
              onChangeText={setConnectBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="Server connection base URL"
            />
          </View>

          <View style={styles.actionRow}>
            <SecondaryButton
              label="Cancel"
              onPress={cancelConnectForm}
              disabled={creatingConnection}
              colors={colors}
              styles={styles}
            />
            <PrimaryButton
              label={creatingConnection ? 'Verifying…' : 'Verify & save'}
              onPress={handleCreateConnection}
              loading={creatingConnection}
              disabled={creatingConnection || connectKey.trim().length === 0}
              colors={colors}
              styles={styles}
            />
          </View>
        </View>
      ) : null}

      {/* Server connection list — flat rows, hairline separators */}
      {connectionsLoading ? (
        <FlagshipState variant="loading" style={styles.loadingWrap} />
      ) : providerConnections.length === 0 && !showConnectForm ? (
        <View style={styles.emptyServerConnections}>
          <Text style={[styles.connectHint, { color: colors.textMuted }]}>
            No server connections yet. Connect a provider to power your agents.
          </Text>
        </View>
      ) : (
        <View>
          {providerConnections.map((conn, index) => {
            const isLast = index === providerConnections.length - 1;
            const healthColor =
              conn.healthStatus === 'healthy' ? colors.success
                : conn.healthStatus === 'failed' || conn.healthStatus === 'revoked' || conn.healthStatus === 'expired' ? colors.danger
                  : conn.healthStatus === 'degraded' ? colors.warning
                    : colors.textMuted;
            const healthLabel =
              conn.healthStatus === 'healthy' ? 'Healthy'
                : conn.healthStatus === 'failed' ? 'Failed'
                  : conn.healthStatus === 'revoked' ? 'Revoked'
                    : conn.healthStatus === 'expired' ? 'Expired'
                      : conn.healthStatus === 'degraded' ? 'Degraded'
                        : 'Unverified';
            const providerLabel = conn.provider.charAt(0).toUpperCase() + conn.provider.slice(1);
            const titleText = conn.label ? `${providerLabel} — ${conn.label}` : providerLabel;
            const isReverifying = reverifyingId === conn.id;
            const isRemoving = removingId === conn.id;
            const verifiedText = conn.lastVerifiedAt
              ? `Verified ${formatRelativeTime(conn.lastVerifiedAt)}`
              : 'Not yet verified';

            return (
              <View
                key={conn.id}
                style={[
                  styles.serverConnectionRow,
                  !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={styles.serverConnectionHeader}>
                  <View style={styles.providerIdentity}>
                    <Ionicons name="server-outline" size={20} color={colors.textPrimary} />
                    <View style={styles.providerNameWrap}>
                      <Text style={[styles.providerName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {titleText}
                      </Text>
                      <Text style={[styles.providerDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                        {conn.maskedKey}
                      </Text>
                      <Text style={[styles.flatRowCaveat, { color: colors.textMuted }]} numberOfLines={1}>
                        {verifiedText}
                        {conn.lastError ? ` · ${conn.lastError}` : ''}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.providerStatus, { color: healthColor }]}
                    numberOfLines={1}
                  >
                    {healthLabel}
                  </Text>
                </View>

                {conn.discoveredModels && conn.discoveredModels.length > 0 ? (
                  <Text style={[styles.modelsList, { color: colors.textSecondary }]} numberOfLines={2}>
                    {conn.discoveredModels.length} model{conn.discoveredModels.length === 1 ? '' : 's'} · {conn.discoveredModels.slice(0, 6).map((m) => m.displayName).join(', ')}
                    {conn.discoveredModels.length > 6 ? `, +${conn.discoveredModels.length - 6} more` : ''}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <SecondaryButton
                    label={isReverifying ? 'Verifying…' : 'Reverify'}
                    onPress={() => handleReverify(conn.id)}
                    disabled={isReverifying || isRemoving}
                    colors={colors}
                    styles={styles}
                  />
                  <SecondaryButton
                    label={isRemoving ? 'Removing…' : 'Remove'}
                    danger
                    onPress={() => handleRequestRemove(conn)}
                    disabled={isReverifying || isRemoving}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Remove confirmation */}
      {confirmRemove ? (
        <View style={[styles.confirmWrap, { backgroundColor: colors.dangerSubtle }]}>
          <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
            Remove this connection?
          </Text>
          <Text style={[styles.confirmBody, { color: colors.textSecondary }]}>
            Agents using this connection will no longer be able to run until you connect a replacement.
          </Text>
          <View style={styles.actionRow}>
            <SecondaryButton
              label="Cancel"
              onPress={cancelConfirmRemove}
              disabled={removingId !== null}
              colors={colors}
              styles={styles}
            />
            <PrimaryButton
              label={removingId ? 'Removing…' : 'Remove'}
              onPress={handleConfirmRemove}
              loading={removingId !== null}
              colors={colors}
              styles={styles}
            />
          </View>
        </View>
      ) : null}

      {/* Toast */}
      {toast ? (
        <View
          style={[
            styles.toast,
            {
              backgroundColor: toast.kind === 'success' ? colors.successSubtle : colors.dangerSubtle,
              borderColor: toast.kind === 'success' ? colors.successBorder : colors.dangerBorder,
            },
          ]}
        >
          <Ionicons
            name={toast.kind === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={16}
            color={toast.kind === 'success' ? colors.success : colors.danger}
          />
          <Text
            style={[
              styles.toastText,
              { color: toast.kind === 'success' ? colors.success : colors.danger },
            ]}
            numberOfLines={3}
          >
            {toast.message}
          </Text>
        </View>
      ) : null}

      {/* ───────────────────────────────────────────────────────────────────
          4. Device-local keys — discovery only, collapsed by default
      ──────────────────────────────────────────────────────────────────── */}
      {loading ? (
        <FlagshipState variant="loading" style={styles.loadingWrap} />
      ) : (
        <View>
          <Pressable
            style={({ pressed }) => [styles.collapseHeader, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => {
              haptic.light();
              setShowDeviceKeys((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel={showDeviceKeys ? 'Hide device-local keys' : 'Show device-local keys'}
          >
            <View style={styles.collapseHeaderLeft}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                DEVICE-LOCAL KEYS
              </Text>
              <Text style={[styles.deviceLocalNote, { color: colors.textMuted }]} numberOfLines={1}>
                Discovery only — not used for execution
              </Text>
            </View>
            <Ionicons
              name={showDeviceKeys ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>

          {showDeviceKeys ? (
            <>
              <Text style={[styles.deviceLocalNote, { color: colors.textMuted }]}>
                Device-local keys are used for model discovery only. Server connections power agent execution.
              </Text>

          {PROVIDER_ORDER.map((providerId, index) => {
            const config = PROVIDER_CONFIGS[providerId];
            const state = providers[providerId];
            const isComingSoon = providerId !== 'openai';
            const status: ConnectionStatus = state.testResult?.status === 'invalid'
              ? 'invalid'
              : state.stored
                ? 'connected'
                : 'not_connected';
            const isLast = index === PROVIDER_ORDER.length - 1;

            return (
              <View
                key={providerId}
                style={[
                  styles.providerRow,
                  !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  isComingSoon && { opacity: 0.6 },
                ]}
              >
                {/* Provider header row */}
                <View style={styles.providerHeader}>
                  <View style={styles.providerIdentity}>
                    <Ionicons name={config.icon as any} size={20} color={colors.textPrimary} />
                    <View style={styles.providerNameWrap}>
                      <Text style={[styles.providerName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {config.name}
                      </Text>
                      <Text
                        style={[styles.providerDesc, { color: colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {config.description}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.providerStatus,
                      {
                        color: isComingSoon
                          ? colors.textMuted
                          : status === 'connected'
                            ? colors.success
                            : status === 'invalid'
                              ? colors.danger
                              : colors.textMuted,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {isComingSoon
                      ? 'Coming soon'
                      : status === 'connected'
                        ? 'Connected'
                        : status === 'invalid'
                          ? 'Invalid'
                          : 'Not connected'}
                  </Text>
                </View>

                {/* Connected state — masked key + actions */}
                {!isComingSoon && state.stored && !state.editing ? (
                  <View style={styles.connectedBody}>
                    <View style={[styles.keyDisplay, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
                      <Text style={[styles.keyText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {maskApiKey(state.stored.apiKey)}
                      </Text>
                    </View>
                    {state.stored.baseUrl ? (
                      <Text style={[styles.baseUrlText, { color: colors.textMuted }]} numberOfLines={1}>
                        Endpoint: {state.stored.baseUrl}
                      </Text>
                    ) : null}
                    {state.testResult && state.testResult.status === 'valid' ? (
                      <Text style={[styles.validNote, { color: colors.success }]}>
                        {state.testResult.message}
                      </Text>
                    ) : null}
                    {/* Discovered models (provider-authoritative) — text, not chips */}
                    {state.discoveredModels && state.discoveredModels.length > 0 ? (
                      <View style={styles.modelsWrap}>
                        <Text style={[styles.modelsLabel, { color: colors.textMuted }]}>
                          {state.discoveredModels.length} model{state.discoveredModels.length === 1 ? '' : 's'} available
                        </Text>
                        <Text style={[styles.modelsList, { color: colors.textSecondary }]} numberOfLines={3}>
                          {state.discoveredModels.slice(0, 8).map((m) => m.displayName).join(', ')}
                          {state.discoveredModels.length > 8
                            ? `, +${state.discoveredModels.length - 8} more`
                            : ''}
                        </Text>
                      </View>
                    ) : state.discovering ? (
                      <View style={styles.modelDiscovering}>
                        <ActivityIndicator size="small" color={colors.textMuted} />
                        <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                          Discovering models…
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[styles.storageNote, { color: colors.textMuted }]}>
                      Stored locally · {state.stored.storageClass === 'secure' ? 'Secure storage' : 'Device storage'}
                    </Text>
                    <View style={styles.actionRow}>
                      <SecondaryButton
                        label="Disconnect"
                        danger
                        onPress={() => handleDisconnect(providerId)}
                        colors={colors}
                        styles={styles}
                      />
                      <SecondaryButton
                        label="Replace key"
                        onPress={() => startEdit(providerId)}
                        colors={colors}
                        styles={styles}
                      />
                    </View>
                  </View>
                ) : null}

                {/* Not connected state — prompt to connect */}
                {!isComingSoon && !state.stored && !state.editing ? (
                  <View style={styles.connectCta}>
                    <Text style={[styles.connectHint, { color: colors.textMuted }]}>
                      No key saved. Connect to use {config.name} models.
                    </Text>
                    <PrimaryButton
                      label="Connect"
                      onPress={() => startEdit(providerId)}
                      colors={colors}
                      styles={styles}
                    />
                  </View>
                ) : null}

                {/* Editing state — key input + test / cancel */}
                {!isComingSoon && state.editing ? (
                  <View style={styles.editBody}>
                    {config.supportsBaseUrl ? (
                      <View style={[styles.inputWrap, { borderColor: colors.border }]}>
                        <Ionicons name="link-outline" size={16} color={colors.textMuted} />
                        <TextInput
                          style={[styles.input, { color: colors.inputText }]}
                          placeholder="https://your-endpoint/v1"
                          placeholderTextColor={colors.textMuted}
                          value={state.baseUrlInput}
                          onChangeText={(text) =>
                            setProviders((prev) => ({
                              ...prev,
                              [providerId]: { ...prev[providerId], baseUrlInput: text },
                            }))
                          }
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                          accessibilityLabel={`${config.name} base URL`}
                        />
                      </View>
                    ) : null}
                    <View style={[styles.inputWrap, { borderColor: colors.border }]}>
                      <Ionicons name="key-outline" size={16} color={colors.textMuted} />
                      <TextInput
                        style={[styles.input, { color: colors.inputText }]}
                        placeholder={config.keyPlaceholder}
                        placeholderTextColor={colors.textMuted}
                        value={state.keyInput}
                        onChangeText={(text) =>
                          setProviders((prev) => ({
                            ...prev,
                            [providerId]: { ...prev[providerId], keyInput: text, testResult: null },
                          }))
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        accessibilityLabel={`${config.name} API key`}
                      />
                    </View>

                    {/* Available models — provider-authoritative (spec 04).
                        Discovered dynamically from the provider's /models
                        endpoint after a successful connection. Before the
                        first connection, we show a truthful placeholder
                        instead of a hardcoded catalogue. */}
                    <View style={styles.modelsWrap}>
                      <Text style={[styles.modelsLabel, { color: colors.textMuted }]}>
                        Available models
                      </Text>
                      {state.discoveredModels && state.discoveredModels.length > 0 ? (
                        <Text style={[styles.modelsList, { color: colors.textSecondary }]} numberOfLines={4}>
                          {state.discoveredModels.map((m) => m.displayName).join(', ')}
                        </Text>
                      ) : state.discovering ? (
                        <View style={styles.modelDiscovering}>
                          <ActivityIndicator size="small" color={colors.textMuted} />
                          <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                            Discovering models from {config.name}…
                          </Text>
                        </View>
                      ) : state.discoveredModels && state.discoveredModels.length === 0 ? (
                        <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                          No models returned by {config.name}.
                        </Text>
                      ) : (
                        <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                          Models are discovered from {config.name} after you connect.
                        </Text>
                      )}
                    </View>

                    {state.testResult ? (
                      <Text
                        style={[
                          styles.testResult,
                          {
                            color:
                              state.testResult.status === 'valid' ? colors.success : colors.danger,
                          },
                        ]}
                      >
                        {state.testResult.message}
                      </Text>
                    ) : null}

                    <View style={styles.actionRow}>
                      <SecondaryButton
                        label="Cancel"
                        onPress={() => cancelEdit(providerId)}
                        colors={colors}
                        styles={styles}
                      />
                      <PrimaryButton
                        label={state.testing ? 'Testing…' : 'Test & save'}
                        onPress={() => handleTest(providerId)}
                        loading={state.testing}
                        disabled={state.testing || state.keyInput.trim().length === 0}
                        colors={colors}
                        styles={styles}
                      />
                    </View>
                  </View>
                ) : null}

                {isComingSoon ? (
                  <View style={styles.connectCta}>
                    <Text style={[styles.connectHint, { color: colors.textMuted }]}>
                      Coming soon — not yet available on this deployment.
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
            </>
          ) : null}
        </View>
      )}

      {/* ───────────────────────────────────────────────────────────────────
          5. Help footer — honest note on what agents can and cannot do
      ──────────────────────────────────────────────────────────────────── */}
        <View style={styles.securityNote}>
          <View style={styles.securityHeader}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.securityTitle, { color: colors.textPrimary }]}>What agents can and cannot do</Text>
          </View>
          <Text style={[styles.securityBody, { color: colors.textSecondary }]}>
            Agents draft replies and summarise conversations using the provider keys you connect. They cannot access your wallet, make payments, or act outside the permissions you grant. Server-side keys are stored encrypted on the server; device-local keys never leave this device. Each agent action is logged in the activity ledger for transparency.
          </Text>
        </View>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  colors,
  styles,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: disabled ? colors.surfaceAlt : colors.brand, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <Text
          style={[
            styles.primaryBtnText,
            { color: disabled ? colors.textMuted : colors.textInverse },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  danger,
  disabled,
  colors,
  styles,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.secondaryBtn,
        {
          borderColor: danger ? colors.danger : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Text
        style={[styles.secondaryBtnText, { color: danger ? colors.danger : colors.textPrimary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyProviderState(): ProviderState {
  return {
    stored: null,
    editing: false,
    keyInput: '',
    baseUrlInput: '',
    testing: false,
    testResult: null,
    discoveredModels: null,
    discovering: false,
  };
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.md,
    },
    demoBannerText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      color: colors.textSecondary,
      flex: 1,
    },
    summaryWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
    },
    summaryTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
    },
    summarySubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.xs / 2,
    },
    flatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
      minHeight: Control.hit,
    },
    flatRowText: {
      flex: 1,
      minWidth: 0,
    },
    flatRowTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    flatRowSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      marginTop: Space.xs / 2,
    },
    flatRowCaveat: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      marginTop: Space.xs / 2,
      lineHeight: Type.caption.lineHeight,
    },
    flatRowSeparator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: Space.md + Control.icon + Space.sm,
    },
    loadingWrap: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabelWrap: {
      paddingBottom: Space.sm,
    },
    sectionLabel: {
      fontSize: Type.label.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.label.letterSpacing,
      textTransform: 'uppercase',
    },
    providerRow: {
      paddingVertical: Space.md,
    },
    providerHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    providerIdentity: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      flex: 1,
      minWidth: 0,
    },
    providerNameWrap: {
      flex: 1,
      minWidth: 0,
    },
    providerName: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    providerDesc: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.xs / 2,
    },
    providerStatus: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.caption.letterSpacing,
      flexShrink: 0,
      textAlign: 'right',
    },
    connectedBody: {
      marginTop: Space.sm,
      gap: Space.xs,
    },
    keyDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
    },
    keyText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      flex: 1,
    },
    baseUrlText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    validNote: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    storageNote: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
    },
    connectCta: {
      marginTop: Space.sm,
      gap: Space.sm,
    },
    connectHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    editBody: {
      marginTop: Space.sm,
      gap: Space.sm,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      backgroundColor: colors.input,
    },
    input: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.body.letterSpacing,
      padding: 0,
      minHeight: Space.lg,
    },
    modelsWrap: {
      gap: Space.xs,
    },
    modelsLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.meta.letterSpacing,
    },
    modelDiscovering: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
    },
    modelHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    modelsList: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight + 2,
    },
    testResult: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    primaryBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    secondaryBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.body.letterSpacing,
    },
    securityNote: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginTop: Space.lg,
      marginBottom: Space.md,
    },
    securityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
    },
    securityTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    securityBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
      letterSpacing: Type.caption.letterSpacing,
    },
    // Server connections (Phase 3)
    connectFormBody: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      gap: Space.sm,
    },
    providerSelectorWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
    },
    providerChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
    },
    providerChipText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.caption.letterSpacing,
    },
    providerChipSoon: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
    },
    serverConnectionRow: {
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      gap: Space.xs,
    },
    serverConnectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    emptyServerConnections: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    deviceLocalNote: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      paddingBottom: Space.sm,
    },
    confirmWrap: {
      marginHorizontal: Space.md,
      marginTop: Space.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      borderRadius: Radius.md,
      gap: Space.xs,
    },
    confirmTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    confirmBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      marginHorizontal: Space.md,
      marginTop: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
    },
    toastText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    // Agent Studio hub (Phase 7)
    statusSkeleton: {
      gap: Space.xs,
    },
    skeletonLine: {
      height: 14,
      borderRadius: Radius.sm,
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + Space.xs,
      paddingHorizontal: Space.md,
    },
    skeletonIcon: {
      width: Space.lg + Space.xs,
      height: Space.lg + Space.xs,
      borderRadius: Radius.sm,
    },
    skeletonCopy: {
      flex: 1,
      gap: Space.xs,
    },
    agentListSkeleton: {
      gap: 0,
    },
    emptyAgents: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    emptyText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight + 1,
    },
    createAgentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
      minHeight: Control.hit,
    },
    createAgentText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    pendingAction: {
      marginTop: Space.xs,
      paddingVertical: Space.xs,
    },
    pendingActionText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.caption.letterSpacing,
    },
    sectionHint: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
    },
    collapseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.sm,
    },
    collapseHeaderLeft: {
      flex: 1,
      gap: Space.xs / 2,
    },
  });
}
