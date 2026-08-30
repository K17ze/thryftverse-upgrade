import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Radius, Space, Typography, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import type { ChatAgentConfig, ChatBot } from '../domain';
import {
  CAPABILITIES_BY_RISK,
  CAPABILITY_RISK_LABELS,
  buildInitialCapabilityGrants,
  enabledCapabilitiesToBackendPermissions,
  type AgentCapability,
  type AgentCategory,
  type AgentDefinition,
  type CapabilityGrantConfig,
  type ResponseLength,
  type Tone,
  type TriggerMode } from '../platform/agents/agentDefinition';
import {
  PROVIDER_CONFIGS,
  type AIProvider,
  type ConnectedProvider,
  type DiscoveredModel,
  discoverModels,
  getConnectedProviders } from '../services/aiProviderApi';
import { validateBotFromApi } from '../services/botsApi';

type Props = NativeStackScreenProps<RootStackParamList, 'BotBuilder'>;

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const CATEGORIES: Array<{ value: AgentCategory; label: string }> = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'styling', label: 'Styling' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'safety', label: 'Safety' },
  { value: 'automation', label: 'Workflow' },
];

const TRIGGERS: Array<{
  value: TriggerMode;
  label: string;
  detail: string;
}> = [
  { value: 'mention', label: 'Mention', detail: 'Replies when someone types @agent' },
  { value: 'command', label: 'Command', detail: 'Replies to its command prefix' },
  { value: 'always', label: 'Every message', detail: 'Participates throughout the chat' },
];

const REASONING_EFFORTS: Array<{ value: 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const RISK_GROUPS: Array<{
  risk: RiskLevel;
  title: string;
  hint: string;
}> = [
  { risk: 'low', title: 'Low risk — read access', hint: 'Read-only access to your data.' },
  { risk: 'medium', title: 'Medium risk — drafts & edits', hint: 'Reversible — nothing is committed externally.' },
  { risk: 'high', title: 'High risk — publish & send', hint: 'Publishes or sends on your behalf.' },
  { risk: 'critical', title: 'Critical — money & security', hint: 'Money and security actions.' },
];

const RISK_DOT: Record<RiskLevel, string> = {
  low: 'checkmark-circle',
  medium: 'create-outline',
  high: 'megaphone-outline',
  critical: 'warning-outline' };

const ACTIVE_CAPABILITIES: ReadonlySet<AgentCapability> = new Set([
  'chat.draft_reply',
  'chat.read_current',
  'chat.read_selected_history',
]);

export default function BotBuilderScreen({ navigation, route }: Props) {
  const { botId } = route.params ?? {};
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const existingBot = useStore((state) =>
    state.customBots.find((bot) => bot.id === botId && bot.type === 'custom')
  );
  const createCustomBot = useStore((state) => state.createCustomBot);
  const updateCustomBot = useStore((state) => state.updateCustomBot);
  const publishBot = useStore((state) => state.publishBot);

  // --- Existing-bot hydration (map legacy ChatBot → AgentDefinition fields) ---
  const legacyConfig = existingBot?.agentConfig;
  const initialCategory = (existingBot?.category as AgentCategory | undefined) ?? 'assistant';
  const [name, setName] = useState(existingBot?.name ?? '');
  const [description, setDescription] = useState(existingBot?.description ?? '');
  const [commandHint, setCommandHint] = useState(existingBot?.commandHint ?? '/ask');
  const [category, setCategory] = useState<AgentCategory>(initialCategory);
  const [instructions, setInstructions] = useState(legacyConfig?.instructions ?? '');
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(legacyConfig?.triggerMode ?? 'mention');
  const [tone, setTone] = useState<Tone>(legacyConfig?.tone ?? 'focused');
  const [responseLength, setResponseLength] = useState<ResponseLength>(
    legacyConfig?.responseLength ?? 'balanced'
  );
  const [starterOne, setStarterOne] = useState(legacyConfig?.starterPrompts[0] ?? '');
  const [starterTwo, setStarterTwo] = useState(legacyConfig?.starterPrompts[1] ?? '');
  const [reasoningEffort, setReasoningEffort] = useState<ChatAgentConfig['reasoningEffort']>(
    legacyConfig?.reasoningEffort ?? 'medium'
  );

  // Progressive disclosure — step collapse states.
  // Step 1 (Purpose) is always visible. Steps 2–4 are collapsible.
  // When editing an existing bot, all steps start expanded.
  const [step2Open, setStep2Open] = useState(Boolean(existingBot));
  const [step3Open, setStep3Open] = useState(Boolean(existingBot));
  const [step4Open, setStep4Open] = useState(Boolean(existingBot));

  // Preflight validation (Phase 1 /bots/validate endpoint).
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    validationError: string | null;
    checks: Array<{ key: string; passed: boolean }>;
    runtimeReady: boolean;
    runtimeReadinessReason: string | null;
  } | null>(null);
  const [validating, setValidating] = useState(false);

  // --- Capabilities (typed, from Capability Broker) ---
  // Rebuild the grant list when the category changes so defaults track the
  // selected category. When editing an existing bot, hydrate from its stored
  // permissions on first render only.
  const [capabilityGrants, setCapabilityGrants] = useState<CapabilityGrantConfig[]>(() => {
    const grants = buildInitialCapabilityGrants(initialCategory);
    if (existingBot) {
      const enabled = new Set(existingBot.permissions);
      return grants.map((g) => ({ ...g, enabled: enabled.has(g.capability) }));
    }
    return grants;
  });
  const [categoryTouched, setCategoryTouched] = useState(Boolean(existingBot));

  const handleCategoryChange = (next: AgentCategory) => {
    setCategory(next);
    setCategoryTouched(true);
    // Re-seed defaults for the new category, preserving any explicit toggles
    // the user already made for capabilities that exist in both categories.
    setCapabilityGrants((current) => {
      const nextDefaults = new Set(buildInitialCapabilityGrants(next).filter((g) => g.enabled).map((g) => g.capability));
      return current.map((g) => ({
        ...g,
        enabled: categoryTouched ? g.enabled : nextDefaults.has(g.capability) }));
    });
  };

  // --- Memory policy ---
  const [conversationContext, setConversationContext] = useState(
    legacyConfig ? legacyConfig.historyLimit > 0 : true
  );
  const [maxTurns, setMaxTurns] = useState(legacyConfig?.historyLimit ?? 16);

  // --- Provider connection (dynamic model discovery) ---
  const [connectedProviders, setConnectedProviders] = useState<ConnectedProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [providerId, setProviderId] = useState<string>('');
  const [modelId, setModelId] = useState<string>(legacyConfig?.model ?? '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const connected = await getConnectedProviders();
        if (cancelled) return;
        setConnectedProviders(connected);
        // Prefer the provider that matches the stored model when editing.
        const initialProvider =
          (connected.find((p) => p.provider === (existingBot?.runtimeMode as AIProvider | undefined))?.provider ??
            connected[0]?.provider) ??
          '';
        setProviderId(initialProvider);
      } catch {
        // Non-fatal — treated as no connected providers.
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existingBot?.runtimeMode]);

  // Discover models for the selected provider.
  useEffect(() => {
    if (!providerId) {
      setDiscoveredModels([]);
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    (async () => {
      try {
        const models = await discoverModels(providerId as AIProvider);
        if (cancelled) return;
        setDiscoveredModels(models);
        // If the current model id isn't in the discovered list, keep it as a
        // manual entry rather than silently clearing it (truthful UI).
      } catch {
        if (!cancelled) setDiscoveredModels([]);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const [isSaving, setIsSaving] = useState(false);

  const slug = useMemo(
    () => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    [name]
  );

  const enabledCapabilities = useMemo(
    () => capabilityGrants.filter((g) => g.enabled).map((g) => g.capability),
    [capabilityGrants]
  );

  const activeGrants = useMemo(
    () => capabilityGrants.filter((g) => ACTIVE_CAPABILITIES.has(g.capability)),
    [capabilityGrants]
  );

  const plannedGrantsByRisk = useMemo(() => {
    const planned = capabilityGrants.filter((g) => !ACTIVE_CAPABILITIES.has(g.capability));
    return RISK_GROUPS.map((group) => ({
      ...group,
      grants: planned.filter((g) => CAPABILITY_RISK_LABELS[g.capability].risk === group.risk) })).filter((group) => group.grants.length > 0);
  }, [capabilityGrants]);

  const nameError = name.length > 0 && name.trim().length < 2 ? 'Use at least 2 characters.' : undefined;
  const instructionError =
    instructions.length > 0 && instructions.trim().length < 20
      ? 'Add enough direction for consistent answers (20 characters minimum).'
      : undefined;
  const canSaveDraft =
    name.trim().length >= 2 &&
    description.trim().length >= 2 &&
    !isSaving;
  // Publishing requires instructions, a connected model, and at least the
  // draft-reply capability so the agent can actually respond.
  const canPublish =
    canSaveDraft &&
    instructions.trim().length >= 20 &&
    modelId.trim().length > 0 &&
    enabledCapabilities.includes('chat.draft_reply');

  // Progressive disclosure — step completion checks.
  const step1Complete = instructions.trim().length >= 20;
  const step2Complete = name.trim().length >= 2 && description.trim().length >= 2;
  const step3Complete = step2Complete; // trigger/tone/length always have defaults
  const step4Complete = modelId.trim().length > 0;
  // Step 2 becomes available once Step 1 has some content.
  const step2Available = instructions.trim().length > 0 || Boolean(existingBot);
  // Step 3 becomes available once Step 2 is complete.
  const step3Available = step2Complete || Boolean(existingBot);
  // Step 4 is always available (advanced), but typically explored last.
  const step4Available = true;
  // Step 5 (Publish) is shown when all required fields are filled.
  const step5Available = canPublish || canSaveDraft;

  // Preflight validation — calls /bots/validate to check readiness before publish.
  const runValidation = async () => {
    if (!canSaveDraft) return;
    setValidating(true);
    try {
      const def = buildAgentDefinition();
      const botData = mapDefinitionToBotData(def);
      const result = await validateBotFromApi({
        name: botData.name,
        description: botData.description,
        commandHint: botData.commandHint,
        category: botData.category,
        permissions: botData.permissions,
        isDraft: false,
        agentConfig: botData.agentConfig });
      setValidationResult(result);
    } catch {
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const setGrantEnabled = (capability: AgentCapability, enabled: boolean) => {
    setCapabilityGrants((current) =>
      current.map((g) => (g.capability === capability ? { ...g, enabled } : g))
    );
  };

  // --- Build the AgentDefinition, then map to the legacy ChatBot store shape ---
  const buildAgentDefinition = (): AgentDefinition => ({
    id: (existingBot?.id ?? slug) || 'agent',
    name: name.trim(),
    description: description.trim(),
    category,
    instructions: instructions.trim(),
    tone,
    responseLength,
    triggerMode,
    commandHint: commandHint.trim() || '/ask',
    starterPrompts: [starterOne, starterTwo].map((item) => item.trim()).filter(Boolean),
    providerConnection: {
      providerId,
      modelId: modelId.trim() },
    capabilityGrants,
    memoryPolicy: {
      conversationContext,
      maxTurns: conversationContext ? maxTurns : 0,
      longTermMemory: false },
    isDraft: false,
    createdAt: existingBot ? new Date(0).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString() });

  const mapDefinitionToBotData = (
    def: AgentDefinition
  ): Omit<ChatBot, 'id' | 'type' | 'creatorId'> => {
    const agentConfig: ChatAgentConfig = {
      instructions: def.instructions,
      // The legacy contract types model as a fixed union; the provider is now
      // the source-of-truth so we cast the discovered id through the string
      // type. The store persists the real id; the union is a legacy artefact.
      model: def.providerConnection.modelId as ChatAgentConfig['model'],
      triggerMode: def.triggerMode,
      responseLength: def.responseLength,
      tone: def.tone,
      reasoningEffort,
      historyLimit: def.memoryPolicy.conversationContext ? def.memoryPolicy.maxTurns : 0,
      starterPrompts: def.starterPrompts };
    return {
      slug: slug || existingBot?.slug || 'agent',
      name: def.name,
      description: def.description,
      commandHint: def.commandHint ?? '/ask',
      category: def.category,
      status: 'available' as const,
      runtimeMode: def.providerConnection.providerId || 'ai',
      permissions: enabledCapabilitiesToBackendPermissions(
        def.capabilityGrants.filter((g) => g.enabled && ACTIVE_CAPABILITIES.has(g.capability))
      ),
      isDraft: def.isDraft,
      agentConfig };
  };

  const handleSave = async (isDraft: boolean) => {
    if (isDraft ? !canSaveDraft : !canPublish) return;
    setIsSaving(true);
    const def = buildAgentDefinition();
    def.isDraft = isDraft;
    const botData = mapDefinitionToBotData(def);

    try {
      let savedBotId = existingBot?.id;
      if (existingBot) {
        await updateCustomBot(existingBot.id, botData);
      } else {
        savedBotId = await createCustomBot(botData);
      }

      if (isDraft) {
        show('Draft saved', 'success');
      } else {
        // Publishing: create an immutable version on the backend.
        const { versionNumber } = await publishBot(savedBotId ?? '', undefined);
        show(`${name.trim()} published as version ${versionNumber}`, 'success');
      }
      navigation.goBack();
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not save this agent.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={existingBot ? 'Edit agent' : 'Create agent'}
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {/* ── Step 1: Purpose (always visible) ── */}
        <CollapsibleStep
          stepNumber={1}
          title="Purpose"
          detail="What should this agent do?"
          complete={step1Complete}
          alwaysOpen
          colors={colors}
          styles={styles}
        >
          <AppInput
            value={instructions}
            onChangeText={setInstructions}
            placeholder="You are a vintage fashion specialist. Ask for budget and measurements before recommending items. Never invent availability..."
            multiline
            maxLength={8000}
            inputContainerStyle={styles.instructionsInput}
            inputStyle={styles.multilineInput}
            errorText={instructionError}
            helperText={`${instructions.length}/8000`}
            accessibilityLabel="Agent instructions"
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
          <OptionGrid
            options={CATEGORIES}
            selected={category}
            onSelect={(value) => handleCategoryChange(value as AgentCategory)}
          />
        </CollapsibleStep>

        {/* ── Step 2: Identity (collapsible, shown after Step 1 has content) ── */}
        {step2Available ? (
          <CollapsibleStep
            stepNumber={2}
            title="Identity"
            detail="What people will see in chat."
            complete={step2Complete}
            open={step2Open}
            onToggle={() => setStep2Open((v) => !v)}
            colors={colors}
            styles={styles}
          >
            <AppInput
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Archive stylist"
              maxLength={40}
              errorText={nameError}
              accessibilityLabel="Agent name"
            />
            <AppInput
              label="Short description"
              value={description}
              onChangeText={setDescription}
              placeholder="What can this agent help with?"
              multiline
              maxLength={240}
              inputContainerStyle={styles.multilineShort}
              inputStyle={styles.multilineInput}
              accessibilityLabel="Agent description"
            />
            <AppInput
              label="Command hint"
              value={commandHint}
              onChangeText={setCommandHint}
              placeholder="/ask"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Agent command hint"
            />
          </CollapsibleStep>
        ) : null}

        {/* ── Step 3: Behaviour (collapsible, shown after Step 2) ── */}
        {step3Available ? (
          <CollapsibleStep
            stepNumber={3}
            title="Behaviour"
            detail="How and when it joins, and its voice."
            complete={step3Complete}
            open={step3Open}
            onToggle={() => setStep3Open((v) => !v)}
            colors={colors}
            styles={styles}
          >
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Trigger mode</Text>
            <ChoiceList
              options={TRIGGERS}
              selected={triggerMode}
              onSelect={(value) => setTriggerMode(value as TriggerMode)}
            />
            {triggerMode === 'mention' && slug ? (
              <View style={styles.invocationPreview}>
                <Ionicons name="at" size={17} color={colors.textSecondary} />
                <Text style={styles.invocationText}>People will type @{slug} followed by a request.</Text>
              </View>
            ) : null}
            {triggerMode === 'always' ? (
              <View style={styles.caution}>
                <Ionicons name="information-circle-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.cautionText}>
                  Every-message agents can add noise and use more model capacity. Use this only when constant participation is intentional.
                </Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tone</Text>
            <OptionGrid
              options={[
                { value: 'focused', label: 'Focused' },
                { value: 'warm', label: 'Warm' },
                { value: 'expert', label: 'Expert' },
              ]}
              selected={tone}
              onSelect={(value) => setTone(value as Tone)}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Response length</Text>
            <OptionGrid
              options={[
                { value: 'concise', label: 'Concise' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'detailed', label: 'Detailed' },
              ]}
              selected={responseLength}
              onSelect={(value) => setResponseLength(value as ResponseLength)}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Reasoning effort</Text>
            <OptionGrid
              options={REASONING_EFFORTS}
              selected={reasoningEffort}
              onSelect={(value) => setReasoningEffort(value as ChatAgentConfig['reasoningEffort'])}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Conversation starters</Text>
            <AppInput
              value={starterOne}
              onChangeText={setStarterOne}
              placeholder="Find the strongest option in this chat"
              maxLength={160}
              accessibilityLabel="First conversation starter"
            />
            <AppInput
              value={starterTwo}
              onChangeText={setStarterTwo}
              placeholder="Summarise the decisions so far"
              maxLength={160}
              accessibilityLabel="Second conversation starter"
            />
          </CollapsibleStep>
        ) : null}

        {/* ── Step 4: Model & permissions (collapsible, advanced) ── */}
        {step4Available ? (
          <CollapsibleStep
            stepNumber={4}
            title="Model & permissions"
            detail="The AI model and what this agent can access."
            complete={step4Complete}
            open={step4Open}
            onToggle={() => setStep4Open((v) => !v)}
            colors={colors}
            styles={styles}
          >
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Provider</Text>
            {providersLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={styles.loadingText}>Checking connected providers…</Text>
              </View>
            ) : connectedProviders.length === 0 ? (
              <View style={styles.caution}>
                <Ionicons name="cloud-offline-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.cautionText}>
                  No AI provider is connected yet. Connect one in Agent Studio to discover available models, or enter a model id manually below.
                </Text>
              </View>
            ) : (
              <ChoiceList
                options={connectedProviders.map((p) => ({
                  value: p.provider,
                  label: p.config.name,
                  detail: p.config.description }))}
                selected={providerId}
                onSelect={(value) => {
                  setProviderId(value);
                  setModelId('');
                }}
              />
            )}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Model</Text>
            {providerId && discoveredModels.length > 0 ? (
              <ChoiceList
                options={discoveredModels.map((m) => ({
                  value: m.providerModelId,
                  label: m.displayName,
                  detail: m.deprecated ? 'Deprecated by provider' : m.providerModelId }))}
                selected={modelId}
                onSelect={(value) => setModelId(value)}
              />
            ) : providerId && modelsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={styles.loadingText}>Discovering models from {PROVIDER_CONFIGS[providerId as AIProvider]?.name ?? 'provider'}…</Text>
              </View>
            ) : providerId ? (
              <View style={styles.caution}>
                <Ionicons name="search-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.cautionText}>
                  No models were discovered from this provider. You can still enter a model id manually.
                </Text>
              </View>
            ) : null}
            <AppInput
              label="Model id"
              value={modelId}
              onChangeText={setModelId}
              placeholder="e.g. gpt-4o"
              maxLength={80}
              autoCapitalize="none"
              autoCorrect={false}
              helperText={
                providerId
                  ? 'Discovered from your connected provider.'
                  : 'Connect a provider in Agent Studio to discover models.'
              }
              accessibilityLabel="Provider model id"
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>History limit</Text>
            <CapabilityRow
              label="Conversation context"
              risk="low"
              enabled={conversationContext}
              onToggle={() => setConversationContext((v) => !v)}
            />
            {conversationContext ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Recent turns available</Text>
                <OptionGrid
                  options={[
                    { value: '8', label: '8' },
                    { value: '16', label: '16' },
                    { value: '32', label: '32' },
                  ]}
                  selected={String(maxTurns)}
                  onSelect={(value) => setMaxTurns(Number(value))}
                />
              </>
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Permissions</Text>
            <View style={styles.capabilityGroup}>
              <Text style={styles.capabilityGroupTitle}>Active capabilities</Text>
              <View style={styles.permissionList}>
                {activeGrants.map((grant, index) => {
                  const meta = CAPABILITY_RISK_LABELS[grant.capability];
                  return (
                    <View key={grant.capability}>
                      <CapabilityRow
                        label={meta.label}
                        risk={meta.risk}
                        enabled={grant.enabled}
                        onToggle={() => setGrantEnabled(grant.capability, !grant.enabled)}
                      />
                      {index < activeGrants.length - 1 ? <View style={styles.divider} /> : null}
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.capabilityGroup}>
              <View style={styles.plannedHeader}>
                <Text style={styles.capabilityGroupTitle}>Planned capabilities</Text>
                <Text style={styles.plannedHint}>
                  Coming soon — not yet available on this deployment.
                </Text>
              </View>
              {plannedGrantsByRisk.map((group) => (
                <View key={group.risk} style={styles.riskGroup}>
                  <View style={styles.riskGroupHeader}>
                    <View style={styles.riskGroupTitleRow}>
                      <Ionicons
                        name={RISK_DOT[group.risk] as keyof typeof Ionicons.glyphMap}
                        size={16}
                        color={group.risk === 'critical' ? colors.danger : colors.textSecondary}
                      />
                      <Text style={styles.riskGroupTitle}>{group.title}</Text>
                    </View>
                  </View>
                  <View style={styles.permissionList}>
                    {group.grants.map((grant, index) => {
                      const meta = CAPABILITY_RISK_LABELS[grant.capability];
                      return (
                        <View key={grant.capability}>
                          <CapabilityRow
                            label={meta.label}
                            risk={group.risk}
                            enabled={false}
                            planned
                          />
                          {index < group.grants.length - 1 ? <View style={styles.divider} /> : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </CollapsibleStep>
        ) : null}

        {/* ── Step 5: Publish (shown when all required fields are filled) ── */}
        {step5Available ? (
          <View style={styles.publishSection}>
            <View style={[styles.publishHeader, { borderBottomColor: colors.border }]}>
              <Ionicons
                name={canPublish ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={canPublish ? colors.success : colors.textMuted}
              />
              <Text style={[styles.publishTitle, { color: colors.textPrimary }]}>
                {canPublish ? 'Ready to publish' : 'Save as draft'}
              </Text>
            </View>

            {/* Validation status */}
            {canPublish ? (
              <View style={styles.validationRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.validateBtn,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => void runValidation()}
                  disabled={validating}
                  accessibilityRole="button"
                  accessibilityLabel="Run preflight validation"
                >
                  {validating ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Text style={[styles.validateBtnText, { color: colors.textSecondary }]}>
                      {validationResult ? 'Re-validate' : 'Validate'}
                    </Text>
                  )}
                </Pressable>
                {validationResult ? (
                  <View style={styles.validationResult}>
                    <Text
                      style={[
                        styles.validationStatus,
                        { color: validationResult.valid ? colors.success : colors.danger },
                      ]}
                    >
                      {validationResult.valid ? 'Valid' : 'Issues found'}
                    </Text>
                    {validationResult.validationError ? (
                      <Text style={[styles.validationError, { color: colors.danger }]}>
                        {validationResult.validationError}
                      </Text>
                    ) : null}
                    {validationResult.runtimeReady === false && validationResult.runtimeReadinessReason ? (
                      <Text style={[styles.validationError, { color: colors.warning }]}>
                        {validationResult.runtimeReadinessReason}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.publishHint, { color: colors.textMuted }]}>
                {canSaveDraft
                  ? 'Add instructions (20+ chars), a model, and reply access to publish.'
                  : 'Name and description are required to save a draft.'}
              </Text>
            )}

            <View style={styles.actions}>
              <AppButton
                title="Save draft"
                variant="secondary"
                size="md"
                onPress={() => void handleSave(true)}
                disabled={!canSaveDraft}
                loading={isSaving}
                style={styles.action}
              />
              <AppButton
                title={existingBot?.isDraft === false ? 'Save & publish' : 'Publish agent'}
                variant="primary"
                size="md"
                onPress={() => void handleSave(false)}
                disabled={!canPublish || (validationResult !== null && !validationResult.valid)}
                loading={isSaving}
                style={styles.action}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// CollapsibleStep — progressive disclosure section with completion checkmark
// ---------------------------------------------------------------------------

function CollapsibleStep({
  stepNumber,
  title,
  detail,
  complete,
  open,
  onToggle,
  alwaysOpen,
  colors,
  styles,
  children }: {
  stepNumber: number;
  title: string;
  detail: string;
  complete: boolean;
  open?: boolean;
  onToggle?: () => void;
  alwaysOpen?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  children: React.ReactNode;
}) {
  const isOpen = alwaysOpen ?? open ?? false;
  return (
    <View style={styles.stepSection}>
      <Pressable
        style={({ pressed }) => [
          styles.stepHeader,
          { opacity: pressed ? 0.6 : 1 },
        ]}
        onPress={alwaysOpen ? undefined : onToggle}
        disabled={alwaysOpen}
        accessibilityRole={alwaysOpen ? undefined : 'button'}
        accessibilityLabel={alwaysOpen ? undefined : `${isOpen ? 'Collapse' : 'Expand'} ${title}`}
      >
        <View style={styles.stepHeaderLeft}>
          {complete ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          ) : (
            <Text style={[styles.stepNumber, { color: colors.textMuted }]}>{stepNumber}</Text>
          )}
          <View style={styles.stepHeaderText}>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{title}</Text>
            <Text style={[styles.stepDetail, { color: colors.textMuted }]} numberOfLines={1}>
              {detail}
            </Text>
          </View>
        </View>
        {alwaysOpen ? null : (
          <Ionicons
            name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
            color={colors.textMuted}
          />
        )}
      </Pressable>
      {isOpen ? <View style={styles.stepBody}>{children}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CapabilityRow — a single typed capability grant
// ---------------------------------------------------------------------------

function CapabilityRow({
  label,
  risk,
  enabled,
  onToggle,
  planned }: {
  label: string;
  risk: RiskLevel;
  enabled: boolean;
  onToggle?: () => void;
  planned?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isCritical = risk === 'critical';

  if (planned) {
    return (
      <View style={[styles.permissionRow, { opacity: 0.5 }]}>
        <View style={styles.permissionCopy}>
          <View style={styles.permissionLabelRow}>
            <Ionicons
              name="lock-closed-outline"
              size={22}
              color={colors.textMuted}
            />
            <Text style={[styles.permissionTitle, { color: colors.textMuted }]}>{label}</Text>
          </View>
        </View>
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>Coming soon</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.permissionRow}>
      <AnimatedPressable
        onPress={onToggle}
        style={styles.permissionCopy}
        scaleValue={0.985}
        hapticFeedback="selection"
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: enabled }}
      >
        <View style={styles.permissionLabelRow}>
          <Ionicons
            name={enabled ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={enabled ? (isCritical ? colors.danger : colors.textPrimary) : colors.textMuted}
          />
          <Text style={styles.permissionTitle}>{label}</Text>
        </View>
      </AnimatedPressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared layout primitives (preserved from the previous screen)
// ---------------------------------------------------------------------------

function OptionGrid({
  options,
  selected,
  onSelect }: {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.optionGrid}>
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <AnimatedPressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.option, active && styles.optionActive]}
            scaleValue={0.97}
            hapticFeedback="selection"
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function ChoiceList({
  options,
  selected,
  onSelect }: {
  options: Array<{ value: string; label: string; detail: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.choiceList}>
      {options.map((option, index) => {
        const active = selected === option.value;
        return (
          <View key={option.value}>
            <AnimatedPressable
              onPress={() => onSelect(option.value)}
              style={styles.choiceRow}
              scaleValue={0.985}
              hapticFeedback="selection"
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: active }}
            >
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{option.label}</Text>
                <Text style={styles.choiceDetail}>{option.detail}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
            </AnimatedPressable>
            {index < options.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg },
  // Progressive disclosure — collapsible steps
  stepSection: {
    gap: Space.sm },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
    paddingVertical: Space.sm,
    gap: Space.sm },
  stepHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1 },
  stepNumber: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    width: Control.icon,
    textAlign: 'center' },
  stepHeaderText: {
    flex: 1,
    gap: Space.xs / 2 },
  stepTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  stepDetail: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  stepBody: {
    gap: Space.md - 2,
    paddingTop: Space.xs,
    paddingBottom: Space.sm },
  // Publish section (Step 5)
  publishSection: {
    gap: Space.sm,
    paddingTop: Space.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  publishHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  publishTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  publishHint: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  validateBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  validateBtnText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  validationResult: {
    flex: 1,
    gap: Space.xs / 2 },
  validationStatus: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size },
  validationError: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  multilineShort: { minHeight: Control.hit * 2, alignItems: 'flex-start' },
  instructionsInput: { minHeight: 156, alignItems: 'flex-start' },
  multilineInput: { textAlignVertical: 'top', paddingTop: Space.sm + Space.xs },
  fieldLabel: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  option: {
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background },
  optionActive: { borderColor: colors.textPrimary, backgroundColor: colors.textPrimary },
  optionText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  optionTextActive: { color: colors.textInverse, fontFamily: Typography.family.semibold },
  choiceList: {},
  choiceRow: { minHeight: Control.hit + Space.lg, flexDirection: 'row', alignItems: 'center', gap: Space.md },
  choiceCopy: { flex: 1, gap: Space.xs - 2 },
  choiceTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  choiceDetail: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  radio: {
    width: Control.icon,
    height: Control.icon,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center' },
  radioActive: { borderColor: colors.textPrimary },
  radioDot: { width: Space.sm + Space.xs, height: Space.sm + Space.xs, borderRadius: Radius.md, backgroundColor: colors.textPrimary },
  invocationPreview: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  invocationText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  caution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingTop: Space.xs - 2 },
  cautionText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight - 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.xs },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size },
  riskGroup: { gap: Space.sm },
  riskGroupHeader: { gap: Space.xs - 2 },
  riskGroupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  riskGroupTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  capabilityGroup: { gap: Space.sm },
  capabilityGroupTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  plannedHeader: { gap: Space.xs - 2 },
  plannedHint: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight - 1 },
  permissionList: {},
  permissionRow: { paddingVertical: Space.sm, gap: Space.xs, flexDirection: 'row', alignItems: 'center' },
  permissionCopy: { flex: 1, minHeight: Control.hit, justifyContent: 'center' },
  permissionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  permissionTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  comingSoonBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs - 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt },
  comingSoonText: {
    color: colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  actions: { flexDirection: 'row', gap: Space.sm },
  action: { flex: 1 } });
}
