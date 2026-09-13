import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import type { ChatAgentConfig, ChatBot } from '../../domain';
import {
  CAPABILITY_RISK_LABELS,
  buildInitialCapabilityGrants,
  enabledCapabilitiesToBackendPermissions,
  type AgentCapability,
  type AgentCategory,
  type AgentDefinition,
  type CapabilityGrantConfig,
  type ResponseLength,
  type Tone,
  type TriggerMode } from '../../platform/agents/agentDefinition';
import { fetchBotByIdFromApi, validateBotFromApi } from '../../services/botsApi';
import { useConnectivity } from '../useConnectivity';
import {
  ACTIVE_CAPABILITIES,
  RISK_GROUPS,
  type BotBuilderValidationResult,
  type PlannedRiskGroup } from '../../components/botbuilder/botBuilderTypes';

// ---------------------------------------------------------------------------
// useBotBuilderForm — entire BotBuilder form state machine.
// Owns field state, edit-mode hydration, progressive-disclosure gating,
// capability grants, preflight validation, and save/publish. Extracted from
// BotBuilderScreen verbatim — no behaviour change.
// ---------------------------------------------------------------------------

export function useBotBuilderForm({
  botId,
  goBack }: {
  botId: string | undefined;
  goBack: () => void;
}) {
  const { show } = useToast();
  const { isOffline } = useConnectivity();
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
  const [modelId, setModelId] = useState<ChatAgentConfig['model']>(
    legacyConfig?.model ?? 'gpt-5.6-terra'
  );

  // Progressive disclosure — step collapse states.
  // Step 1 (Purpose) is always visible. Steps 2–4 are collapsible.
  // When editing an existing bot, all steps start expanded.
  const [step2Open, setStep2Open] = useState(Boolean(existingBot));
  const [step3Open, setStep3Open] = useState(Boolean(existingBot));
  const [step4Open, setStep4Open] = useState(Boolean(existingBot));

  // Preflight validation (Phase 1 /bots/validate endpoint).
  const [validationResult, setValidationResult] = useState<BotBuilderValidationResult | null>(null);
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

  const [isSaving, setIsSaving] = useState(false);

  // --- Edit hydration ---
  // `existingBot` comes from the store, which may still be loading when the
  // screen mounts. Hydrate the form once: from the store when it arrives, or
  // directly from GET /bots/:id when the store has no copy.
  const hydratedRef = useRef(false);
  const [hydrating, setHydrating] = useState(Boolean(botId) && !existingBot);
  const [hydrateError, setHydrateError] = useState(false);
  const [hydrateAttempt, setHydrateAttempt] = useState(0);
  useEffect(() => {
    if (!botId || hydratedRef.current) return;
    let cancelled = false;
    const hydrate = (bot: ChatBot) => {
      if (cancelled || hydratedRef.current) return;
      hydratedRef.current = true;
      const config = bot.agentConfig;
      setName(bot.name);
      setDescription(bot.description);
      setCommandHint(bot.commandHint);
      setCategory(bot.category as AgentCategory);
      setCategoryTouched(true);
      setInstructions(config?.instructions ?? '');
      setTriggerMode(config?.triggerMode ?? 'mention');
      setTone(config?.tone ?? 'focused');
      setResponseLength(config?.responseLength ?? 'balanced');
      setStarterOne(config?.starterPrompts[0] ?? '');
      setStarterTwo(config?.starterPrompts[1] ?? '');
      setReasoningEffort(config?.reasoningEffort ?? 'medium');
      setModelId(config?.model ?? 'gpt-5.6-terra');
      const grants = buildInitialCapabilityGrants(bot.category as AgentCategory);
      const enabled = new Set(bot.permissions);
      setCapabilityGrants(grants.map((g) => ({ ...g, enabled: enabled.has(g.capability) })));
      const historyLimit = config?.historyLimit ?? 16;
      setConversationContext(historyLimit > 0);
      setMaxTurns(historyLimit > 0 ? historyLimit : 16);
      setStep2Open(true);
      setStep3Open(true);
      setStep4Open(true);
      setHydrating(false);
    };
    if (existingBot) {
      hydrate(existingBot);
      return;
    }
    fetchBotByIdFromApi(botId)
      .then(hydrate)
      .catch(() => {
        if (!cancelled) {
          setHydrateError(true);
          setHydrating(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, existingBot, hydrateAttempt]);

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

  const plannedGrantsByRisk = useMemo<PlannedRiskGroup[]>(() => {
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
      providerId: 'openai',
      modelId },
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
      // The model catalogue is fixed by the server runtime contract —
      // `modelId` is already constrained to the supported enum.
      model: def.providerConnection.modelId as ChatAgentConfig['model'],
      triggerMode: def.triggerMode,
      responseLength: def.responseLength,
      tone: def.tone,
      reasoningEffort,
      historyLimit: def.memoryPolicy.conversationContext ? def.memoryPolicy.maxTurns : 0,
      starterPrompts: def.starterPrompts };
    return {
      // Backend requires slug ≥ 2 chars when provided.
      slug: slug.length >= 2 ? slug : existingBot?.slug ?? 'agent',
      name: def.name,
      description: def.description,
      commandHint: def.commandHint ?? '/ask',
      category: def.category,
      status: 'available' as const,
      runtimeMode: 'ai',
      permissions: enabledCapabilitiesToBackendPermissions(
        def.capabilityGrants.filter((g) => g.enabled && ACTIVE_CAPABILITIES.has(g.capability))
      ),
      isDraft: def.isDraft,
      agentConfig };
  };

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
      goBack();
    } catch (error) {
      show(
        isOffline
          ? "You're offline. Reconnect to save this agent."
          : error instanceof Error ? error.message : 'Could not save this agent.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const retryHydration = () => {
    setHydrateError(false);
    setHydrating(true);
    setHydrateAttempt((a) => a + 1);
  };

  // Edit-mode hydration: the form can't render truthfully until the bot's
  // stored config arrives.
  const hydrationBlocked = Boolean(botId) && (hydrating || (hydrateError && !hydratedRef.current));

  return {
    // gate + connectivity
    isOffline,
    existingBot,
    hydrationBlocked,
    hydrateError,
    retryHydration,
    // step 1 — purpose
    instructions,
    setInstructions,
    instructionError,
    category,
    handleCategoryChange,
    // step 2 — identity
    name,
    setName,
    nameError,
    description,
    setDescription,
    commandHint,
    setCommandHint,
    // step 3 — behaviour
    triggerMode,
    setTriggerMode,
    slug,
    tone,
    setTone,
    responseLength,
    setResponseLength,
    reasoningEffort,
    setReasoningEffort,
    starterOne,
    setStarterOne,
    starterTwo,
    setStarterTwo,
    // step 4 — model & permissions
    modelId,
    setModelId,
    conversationContext,
    setConversationContext,
    maxTurns,
    setMaxTurns,
    activeGrants,
    plannedGrantsByRisk,
    setGrantEnabled,
    // step 5 — publish
    canSaveDraft,
    canPublish,
    validating,
    validationResult,
    runValidation,
    isSaving,
    handleSave,
    // progressive disclosure
    step1Complete,
    step2Complete,
    step3Complete,
    step4Complete,
    step2Available,
    step3Available,
    step4Available,
    step5Available,
    step2Open,
    setStep2Open,
    step3Open,
    setStep3Open,
    step4Open,
    setStep4Open };
}

export type BotBuilderForm = ReturnType<typeof useBotBuilderForm>;
