/**
 * AIAgentIntegrationScreen — Bring-your-own-key settings for AI providers.
 *
 * Lets the user connect their own API keys for OpenAI, Anthropic Claude,
 * Google Gemini, and any OpenAI-compatible custom endpoint — similar to how
 * Codex / Claude Code let users supply their own AI credentials.
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
 *  - One dominant surface per section (the provider list).
 *  - Max two non-avatar radius sizes (Radius.md for inputs/badges, Radius.lg
 *    for the hero summary).
 *  - Clear visual hierarchy: provider name > connection status > key input.
 *  - All colors via useAppTheme(), all geometry via design tokens.
 *
 * State coverage (per AGENTS.md §14):
 *  - Loading: while reading stored keys on mount.
 *  - Populated: provider list with connected / not-connected states.
 *  - Editing: inline key input with test / save / disconnect actions.
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
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
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
  const reducedMotionEnabled = useReducedMotion();
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

  const connectedCount = PROVIDER_ORDER.filter((p) => providers[p].stored).length;

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

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Connections"
          subtitle="Connect your own provider keys"
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

      {/* ── Hero summary — connected count ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View
              style={[
                styles.heroIcon,
                { backgroundColor: connectedCount > 0 ? colors.brand : colors.surfaceAlt },
              ]}
            >
              <Ionicons
                name="key"
                size={20}
                color={connectedCount > 0 ? colors.textInverse : colors.textMuted}
              />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {connectedCount > 0
                  ? `${connectedCount} of ${PROVIDER_ORDER.length} providers connected`
                  : 'No providers connected'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {connectedCount > 0
                  ? 'Your keys are stored on this device only'
                  : 'Connect an OpenAI, Anthropic, Gemini or custom endpoint'}
              </Text>
            </View>
          </View>
        </View>
      </Reanimated.View>

      {/* ── Agent management — pause all + activity ledger ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(40)}>
        <View style={styles.sectionLabelWrap}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>AGENT MANAGEMENT</Text>
        </View>
        <View style={[styles.agentMgmtCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [
              styles.mgmtRow,
              { opacity: pressed ? 0.7 : 1 },
            ]}
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
              size={22}
              color={activeAgentSessions > 0 ? colors.danger : colors.textMuted}
            />
            <View style={styles.mgmtText}>
              <Text
                style={[
                  styles.mgmtTitle,
                  { color: activeAgentSessions > 0 ? colors.textPrimary : colors.textMuted },
                ]}
              >
                Pause all agents
              </Text>
              <Text style={[styles.mgmtSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {activeAgentSessions > 0
                  ? `${activeAgentSessions} agent session${activeAgentSessions === 1 ? '' : 's'} running`
                  : 'No agent sessions running'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
          <View style={[styles.mgmtDivider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [
              styles.mgmtRow,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => navigation.navigate('AgentActivity')}
            accessibilityRole="button"
            accessibilityLabel="View agent activity ledger"
          >
            <Ionicons name="list-outline" size={22} color={colors.textPrimary} />
            <View style={styles.mgmtText}>
              <Text style={[styles.mgmtTitle, { color: colors.textPrimary }]}>
                Agent activity
              </Text>
              <Text style={[styles.mgmtSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                Record of agent actions and approvals
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </Reanimated.View>

      {/* ── Provider list ── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      ) : (
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
          <View style={styles.sectionLabelWrap}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PROVIDERS</Text>
          </View>

          {PROVIDER_ORDER.map((providerId, index) => {
            const config = PROVIDER_CONFIGS[providerId];
            const state = providers[providerId];
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
                ]}
              >
                {/* Provider header row */}
                <View style={styles.providerHeader}>
                  <View style={styles.providerIdentity}>
                    <Ionicons name={config.icon as any} size={22} color={colors.textPrimary} />
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
                  <StatusBadge status={status} colors={colors} styles={styles} />
                </View>

                {/* Connected state — masked key + actions */}
                {state.stored && !state.editing ? (
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
                    {/* Discovered models (provider-authoritative) */}
                    {state.discoveredModels && state.discoveredModels.length > 0 ? (
                      <View style={styles.modelsWrap}>
                        <Text style={[styles.modelsLabel, { color: colors.textMuted }]}>
                          {state.discoveredModels.length} model{state.discoveredModels.length === 1 ? '' : 's'} available
                        </Text>
                        <View style={styles.modelChips}>
                          {state.discoveredModels.slice(0, 8).map((model) => (
                            <View
                              key={model.providerModelId}
                              style={[styles.modelChip, { backgroundColor: colors.surfaceAlt }]}
                            >
                              <Text style={[styles.modelChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {model.displayName}
                              </Text>
                            </View>
                          ))}
                          {state.discoveredModels.length > 8 ? (
                            <View style={[styles.modelChip, { backgroundColor: colors.surfaceAlt }]}>
                              <Text style={[styles.modelChipText, { color: colors.textMuted }]} numberOfLines={1}>
                                +{state.discoveredModels.length - 8} more
                              </Text>
                            </View>
                          ) : null}
                        </View>
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
                {!state.stored && !state.editing ? (
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
                {state.editing ? (
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
                        <View style={styles.modelChips}>
                          {state.discoveredModels.map((model) => (
                            <View
                              key={model.providerModelId}
                              style={[styles.modelChip, { backgroundColor: colors.surfaceAlt }]}
                            >
                              <Text style={[styles.modelChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {model.displayName}
                              </Text>
                            </View>
                          ))}
                        </View>
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
              </View>
            );
          })}
        </Reanimated.View>
      )}

      {/* ── Security note (truthful) ── */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
        <View style={styles.securityNote}>
          <View style={styles.securityHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.securityTitle, { color: colors.textPrimary }]}>How your keys are stored</Text>
          </View>
          <Text style={[styles.securityBody, { color: colors.textSecondary }]}>
            Your API keys are stored locally on this device only — they are never sent to ThryftVerse servers or shared with third parties. When hardware-backed secure storage (iOS Keychain / Android Keystore) is available, keys are stored encrypted at rest; otherwise they are held in process memory only for the current session and never written to plaintext app storage. Removing a key permanently deletes it from this device. When you test a key, a minimal live request (such as listing available models) is sent directly to the provider to confirm the key is authorised — the key is only saved after the provider confirms it, and the returned model list is cached so it stays current as the provider updates it.
          </Text>
        </View>
      </Reanimated.View>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
  colors,
  styles,
}: {
  status: ConnectionStatus;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const label =
    status === 'connected' ? 'Connected' : status === 'invalid' ? 'Invalid format' : 'Not connected';
  const color = status === 'connected' ? colors.success : status === 'invalid' ? colors.danger : colors.textMuted;
  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor:
            status === 'connected'
              ? withAlpha(colors.success, 0.14)
              : status === 'invalid'
                ? withAlpha(colors.danger, 0.14)
                : colors.surfaceAlt,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

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
  colors,
  styles,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.secondaryBtn,
        { borderColor: danger ? colors.danger : colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={onPress}
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

/** Approximate alpha blend for badge backgrounds (hex + alpha percentage). */
function withAlpha(hex: string, alpha: number): string {
  // Only handle #RRGGBB inputs; fall back to the raw colour otherwise.
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
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
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.lg,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    agentMgmtCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: Space.lg,
      overflow: 'hidden',
    },
    mgmtRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      minHeight: Control.hit,
    },
    mgmtText: {
      flex: 1,
      minWidth: 0,
    },
    mgmtTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    mgmtSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      marginTop: Space.xs / 2,
    },
    mgmtDivider: {
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
      fontSize: Type.metaElevated.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.metaElevated.letterSpacing,
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
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    providerDesc: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      marginTop: Space.xs / 2,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      flexShrink: 0,
    },
    statusDot: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.full,
    },
    statusText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.caption.letterSpacing,
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
    modelChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
    },
    modelChip: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
    },
    modelChipText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
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
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    securityBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
