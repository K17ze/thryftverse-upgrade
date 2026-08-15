import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Radius, Space, Type, Typography, Stroke, Control } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import type { ChatAgentConfig, ChatBot } from '../domain';
import {
  CAPABILITIES_BY_RISK,
  CAPABILITY_RISK_LABELS,
  buildInitialCapabilityGrants,
  type AgentCapability,
  type AgentCategory,
  type AgentDefinition,
  type CapabilityGrantConfig,
  type ResponseLength,
  type Tone,
  type TriggerMode,
} from '../platform/agents/agentDefinition';
import {
  PROVIDER_CONFIGS,
  type AIProvider,
  type ConnectedProvider,
  type DiscoveredModel,
  discoverModels,
  getConnectedProviders,
} from '../services/aiProviderApi';

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

const RISK_GROUPS: Array<{
  risk: RiskLevel;
  title: string;
  hint: string;
}> = [
  { risk: 'low', title: 'Low risk — read access', hint: 'Auto-approved after you grant once.' },
  { risk: 'medium', title: 'Medium risk — drafts & edits', hint: 'Reversible — nothing is committed externally.' },
  { risk: 'high', title: 'High risk — publish & send', hint: 'Asks before every publication or message.' },
  { risk: 'critical', title: 'Critical — money & security', hint: 'Always requires explicit approval — never auto-allowed.' },
];

const RISK_DOT: Record<RiskLevel, string> = {
  low: 'checkmark-circle',
  medium: 'create-outline',
  high: 'megaphone-outline',
  critical: 'warning-outline',
};

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
        enabled: categoryTouched ? g.enabled : nextDefaults.has(g.capability),
      }));
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

  const setGrantEnabled = (capability: AgentCapability, enabled: boolean) => {
    setCapabilityGrants((current) =>
      current.map((g) => (g.capability === capability ? { ...g, enabled } : g))
    );
  };

  const setGrantApprovalMode = (
    capability: AgentCapability,
    approvalMode: CapabilityGrantConfig['approvalMode']
  ) => {
    setCapabilityGrants((current) =>
      current.map((g) => (g.capability === capability ? { ...g, approvalMode } : g))
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
      modelId: modelId.trim(),
    },
    capabilityGrants,
    memoryPolicy: {
      conversationContext,
      maxTurns: conversationContext ? maxTurns : 0,
      longTermMemory: false,
    },
    isDraft: false,
    createdAt: existingBot ? new Date(0).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

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
      reasoningEffort: 'medium',
      historyLimit: def.memoryPolicy.conversationContext ? def.memoryPolicy.maxTurns : 0,
      starterPrompts: def.starterPrompts,
    };
    return {
      slug: slug || existingBot?.slug || 'agent',
      name: def.name,
      description: def.description,
      commandHint: def.commandHint ?? '/ask',
      category: def.category,
      status: 'available' as const,
      runtimeMode: def.providerConnection.providerId || 'ai',
      permissions: def.capabilityGrants.filter((g) => g.enabled).map((g) => g.capability),
      isDraft: def.isDraft,
      agentConfig,
    };
  };

  const handleSave = async (isDraft: boolean) => {
    if (isDraft ? !canSaveDraft : !canPublish) return;
    setIsSaving(true);
    const def = buildAgentDefinition();
    def.isDraft = isDraft;
    const botData = mapDefinitionToBotData(def);

    try {
      if (existingBot) {
        await updateCustomBot(existingBot.id, botData);
      } else {
        await createCustomBot(botData);
      }
      show(isDraft ? 'Draft saved' : `${name.trim()} is ready to connect`, 'success');
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
        <View style={styles.intro}>
          <View style={styles.agentMark}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textPrimary} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>A specialist for your conversations</Text>
            <Text style={styles.introBody}>
              Configure behavior, triggers, and access.
            </Text>
          </View>
        </View>

        <Section title="Identity" detail="What people will see in chat.">
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
          <OptionGrid
            options={CATEGORIES}
            selected={category}
            onSelect={(value) => handleCategoryChange(value as AgentCategory)}
          />
        </Section>

        <Section title="Instructions" detail="Give it a role, boundaries, and a definition of a good answer.">
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
        </Section>

        <Section title="How it joins" detail="Mention is the quietest and safest default.">
          <ChoiceList
            options={TRIGGERS}
            selected={triggerMode}
            onSelect={(value) => setTriggerMode(value as TriggerMode)}
          />
          {triggerMode === 'command' ? (
            <AppInput
              label="Command"
              value={commandHint}
              onChangeText={setCommandHint}
              placeholder="/ask"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Agent command"
            />
          ) : null}
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
        </Section>

        <Section
          title="Voice & model"
          detail="Choose the tone, answer length, and the AI model that powers this agent."
        >
          <Text style={styles.fieldLabel}>Voice</Text>
          <OptionGrid
            options={[
              { value: 'focused', label: 'Focused' },
              { value: 'warm', label: 'Warm' },
              { value: 'expert', label: 'Expert' },
            ]}
            selected={tone}
            onSelect={(value) => setTone(value as Tone)}
          />
          <Text style={styles.fieldLabel}>Response length</Text>
          <OptionGrid
            options={[
              { value: 'concise', label: 'Concise' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'detailed', label: 'Detailed' },
            ]}
            selected={responseLength}
            onSelect={(value) => setResponseLength(value as ResponseLength)}
          />

          <Text style={styles.fieldLabel}>Provider</Text>
          {providersLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={styles.loadingText}>Checking connected providers…</Text>
            </View>
          ) : connectedProviders.length === 0 ? (
            <View style={styles.caution}>
              <Ionicons name="cloud-offline-outline" size={17} color={colors.textSecondary} />
              <Text style={styles.cautionText}>
                No AI provider is connected yet. Connect one in Settings to discover available models, or enter a model id manually below.
              </Text>
            </View>
          ) : (
            <ChoiceList
              options={connectedProviders.map((p) => ({
                value: p.provider,
                label: p.config.name,
                detail: p.config.description,
              }))}
              selected={providerId}
              onSelect={(value) => {
                setProviderId(value);
                // Reset the model id when switching providers — the discovered
                // list will refresh via the effect above.
                setModelId('');
              }}
            />
          )}

          <Text style={styles.fieldLabel}>Model</Text>
          {providerId && discoveredModels.length > 0 ? (
            <ChoiceList
              options={discoveredModels.map((m) => ({
                value: m.providerModelId,
                label: m.displayName,
                detail: m.deprecated ? 'Deprecated by provider' : m.providerModelId,
              }))}
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
                : 'Connect a provider in Settings to discover models.'
            }
            accessibilityLabel="Provider model id"
          />
        </Section>

        <Section
          title="Capabilities"
          detail="Control what this agent can do. High-risk and critical actions always need your approval."
        >
          {RISK_GROUPS.map((group) => {
            const groupGrants = capabilityGrants.filter(
              (g) => CAPABILITY_RISK_LABELS[g.capability].risk === group.risk
            );
            if (groupGrants.length === 0) return null;
            return (
              <View key={group.risk} style={styles.riskGroup}>
                <View style={styles.riskGroupHeader}>
                  <View style={styles.riskGroupTitleRow}>
                    <Ionicons
                      name={RISK_DOT[group.risk] as any}
                      size={16}
                      color={group.risk === 'critical' ? colors.danger : colors.textSecondary}
                    />
                    <Text style={styles.riskGroupTitle}>{group.title}</Text>
                  </View>
                  <Text style={styles.riskGroupHint}>{group.hint}</Text>
                </View>
                <View style={styles.permissionList}>
                  {groupGrants.map((grant, index) => {
                    const meta = CAPABILITY_RISK_LABELS[grant.capability];
                    return (
                      <View key={grant.capability}>
                        <CapabilityRow
                          label={meta.label}
                          risk={group.risk}
                          enabled={grant.enabled}
                          approvalMode={grant.approvalMode}
                          onToggle={() => setGrantEnabled(grant.capability, !grant.enabled)}
                          onApprovalModeChange={(mode) => setGrantApprovalMode(grant.capability, mode)}
                        />
                        {index < groupGrants.length - 1 ? <View style={styles.divider} /> : null}
                      </View>
                    );
                  })}
                </View>
                {group.risk === 'critical' ? (
                  <View style={styles.criticalWarning}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={colors.danger} />
                    <Text style={styles.criticalWarningText}>
                      Money and security actions always need your approval. The agent will send every request through the secure payment screens — it can never complete them on its own.
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Section>

        <Section
          title="Memory"
          detail="How much conversation context the agent can read."
        >
          <CapabilityRow
            label="Conversation context"
            risk="low"
            enabled={conversationContext}
            approvalMode="never_ask"
            onToggle={() => setConversationContext((v) => !v)}
            hideApprovalMode
          />
          {conversationContext ? (
            <>
              <Text style={styles.fieldLabel}>Recent turns available</Text>
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
        </Section>

        <Section title="Conversation starters" detail="Optional prompts help people understand what to ask.">
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
        </Section>

        <View style={styles.readiness}>
          <View style={styles.readinessIcon}>
            <Ionicons
              name={canPublish ? 'checkmark' : 'ellipsis-horizontal'}
              size={18}
              color={colors.textPrimary}
            />
          </View>
          <View style={styles.readinessCopy}>
            <Text style={styles.readinessTitle}>
              {canPublish ? 'Ready to publish' : 'Finish the required details'}
            </Text>
            <Text style={styles.readinessDetail}>
              {canPublish
                ? 'After publishing, connect this agent from a group chat.'
                : 'Name, description, instructions, a model, and reply access are required.'}
            </Text>
          </View>
        </View>

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
            disabled={!canPublish}
            loading={isSaving}
            style={styles.action}
          />
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// CapabilityRow — a single typed capability grant with approval-mode control
// ---------------------------------------------------------------------------

function CapabilityRow({
  label,
  risk,
  enabled,
  approvalMode,
  onToggle,
  onApprovalModeChange,
  hideApprovalMode,
}: {
  label: string;
  risk: RiskLevel;
  enabled: boolean;
  approvalMode: CapabilityGrantConfig['approvalMode'];
  onToggle: () => void;
  onApprovalModeChange?: (mode: CapabilityGrantConfig['approvalMode']) => void;
  hideApprovalMode?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isCritical = risk === 'critical';
  const approvalOptions: Array<{
    value: CapabilityGrantConfig['approvalMode'];
    label: string;
  }> = isCritical
    ? [{ value: 'always_ask', label: 'Always ask' }]
    : [
        { value: 'always_ask', label: 'Always ask' },
        { value: 'ask_once', label: 'Ask once' },
        { value: 'never_ask', label: 'Never ask' },
      ];

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
      {enabled && !hideApprovalMode && onApprovalModeChange ? (
        <View style={styles.approvalChips}>
          {approvalOptions.map((opt) => {
            const active = approvalMode === opt.value;
            return (
              <AnimatedPressable
                key={opt.value}
                onPress={() => onApprovalModeChange(opt.value)}
                style={[styles.approvalChip, active && styles.approvalChipActive]}
                scaleValue={0.96}
                hapticFeedback="selection"
                accessibilityRole="radio"
                accessibilityLabel={`${opt.label} for ${label}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.approvalChipText, active && styles.approvalChipTextActive]}>
                  {opt.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared layout primitives (preserved from the previous screen)
// ---------------------------------------------------------------------------

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionDetail}>{detail}</Text>
      </View>
      {children}
    </View>
  );
}

function OptionGrid({
  options,
  selected,
  onSelect,
}: {
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
  onSelect,
}: {
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
    gap: Space.xl,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md - 2,
    paddingVertical: Space.sm,
  },
  agentMark: {
    width: Control.chromeCompact,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: { flex: 1, gap: Space.xs - 1 },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  introBody: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
  },
  section: { gap: Space.md - 2 },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  sectionDetail: {
    marginTop: Space.xs - 2,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  multilineShort: { minHeight: Control.hit * 2, alignItems: 'flex-start' },
  instructionsInput: { minHeight: 156, alignItems: 'flex-start' },
  multilineInput: { textAlignVertical: 'top', paddingTop: Space.sm + Space.xs },
  fieldLabel: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.captionElevated.size,
  },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  option: {
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionActive: { borderColor: colors.textPrimary, backgroundColor: colors.textPrimary },
  optionText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  optionTextActive: { color: colors.textInverse, fontFamily: Typography.family.semibold },
  choiceList: {},
  choiceRow: { minHeight: Control.hit + Space.lg, flexDirection: 'row', alignItems: 'center', gap: Space.md },
  choiceCopy: { flex: 1, gap: Space.xs - 2 },
  choiceTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  choiceDetail: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  radio: {
    width: Control.icon,
    height: Control.icon,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.textPrimary },
  radioDot: { width: Space.sm + Space.xs, height: Space.sm + Space.xs, borderRadius: Radius.md, backgroundColor: colors.textPrimary },
  invocationPreview: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  invocationText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: Type.captionElevated.size,
  },
  caution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingTop: Space.xs - 2,
  },
  cautionText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.captionElevated.lineHeight - 1,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.xs },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  riskGroup: { gap: Space.sm },
  riskGroupHeader: { gap: Space.xs - 2 },
  riskGroupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  riskGroupTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  riskGroupHint: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.captionElevated.lineHeight - 1,
  },
  permissionList: {},
  permissionRow: { paddingVertical: Space.sm, gap: Space.xs },
  permissionCopy: { minHeight: Control.hit, justifyContent: 'center' },
  permissionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  permissionTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  approvalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs, paddingLeft: Space.sm + Space.xs + Space.sm },
  approvalChip: {
    minHeight: Control.hit - Space.md,
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs - 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  approvalChipActive: { borderColor: colors.textPrimary, backgroundColor: colors.textPrimary },
  approvalChipText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  approvalChipTextActive: { color: colors.textInverse, fontFamily: Typography.family.semibold },
  criticalWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingTop: Space.xs,
  },
  criticalWarningText: {
    flex: 1,
    color: colors.danger,
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    lineHeight: Type.captionElevated.lineHeight - 1,
  },
  readiness: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + Space.xs,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  readinessIcon: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessCopy: { flex: 1, gap: Space.xs - 2 },
  readinessTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  readinessDetail: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.captionElevated.lineHeight - 1,
  },
  actions: { flexDirection: 'row', gap: Space.sm },
  action: { flex: 1 },
  });
}
