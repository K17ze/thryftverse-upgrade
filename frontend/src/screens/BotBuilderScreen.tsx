import React, { useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Radius, Space, Type, Typography } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import type { ChatAgentConfig } from '../data/mockData';

type Props = StackScreenProps<RootStackParamList, 'BotBuilder'>;
type BotCategory = 'assistant' | 'moderation' | 'commerce' | 'safety' | 'automation' | 'styling';

const DEFAULT_CONFIG: ChatAgentConfig = {
  instructions: '',
  model: 'gpt-5.6-terra',
  triggerMode: 'mention',
  responseLength: 'balanced',
  tone: 'focused',
  reasoningEffort: 'medium',
  historyLimit: 16,
  starterPrompts: [],
};

const CATEGORIES: Array<{ value: BotCategory; label: string }> = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'styling', label: 'Styling' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'safety', label: 'Safety' },
  { value: 'automation', label: 'Workflow' },
];

const TRIGGERS: Array<{
  value: ChatAgentConfig['triggerMode'];
  label: string;
  detail: string;
}> = [
  { value: 'mention', label: 'Mention', detail: 'Replies when someone types @agent' },
  { value: 'command', label: 'Command', detail: 'Replies to its command prefix' },
  { value: 'always', label: 'Every message', detail: 'Participates throughout the chat' },
];

const MODELS: Array<{
  value: ChatAgentConfig['model'];
  label: string;
  detail: string;
}> = [
  { value: 'gpt-5.6-terra', label: 'Balanced', detail: 'Best default for everyday chat' },
  { value: 'gpt-5.6-sol', label: 'Advanced', detail: 'Deeper reasoning for complex work' },
  { value: 'gpt-5.6-luna', label: 'Fast', detail: 'Lower latency for simple tasks' },
];

const PERMISSIONS = [
  {
    key: 'read_messages',
    label: 'Conversation context',
    detail: 'Read the recent messages allowed by the context limit.',
  },
  {
    key: 'reply_in_chat',
    label: 'Reply in chat',
    detail: 'Send responses under the agent identity.',
  },
] as const;

export default function BotBuilderScreen({ navigation, route }: Props) {
  const { botId } = route.params ?? {};
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const existingBot = useStore((state) =>
    state.customBots.find((bot) => bot.id === botId && bot.type === 'custom')
  );
  const createCustomBot = useStore((state) => state.createCustomBot);
  const updateCustomBot = useStore((state) => state.updateCustomBot);

  const initialConfig = existingBot?.agentConfig ?? DEFAULT_CONFIG;
  const [name, setName] = useState(existingBot?.name ?? '');
  const [description, setDescription] = useState(existingBot?.description ?? '');
  const [commandHint, setCommandHint] = useState(existingBot?.commandHint ?? '/ask');
  const [category, setCategory] = useState<BotCategory>(
    (existingBot?.category as BotCategory | undefined) ?? 'assistant'
  );
  const [instructions, setInstructions] = useState(initialConfig.instructions);
  const [model, setModel] = useState<ChatAgentConfig['model']>(initialConfig.model);
  const [triggerMode, setTriggerMode] = useState<ChatAgentConfig['triggerMode']>(
    initialConfig.triggerMode
  );
  const [tone, setTone] = useState<ChatAgentConfig['tone']>(initialConfig.tone);
  const [responseLength, setResponseLength] = useState<ChatAgentConfig['responseLength']>(
    initialConfig.responseLength
  );
  const [historyLimit, setHistoryLimit] = useState(initialConfig.historyLimit);
  const [starterOne, setStarterOne] = useState(initialConfig.starterPrompts[0] ?? '');
  const [starterTwo, setStarterTwo] = useState(initialConfig.starterPrompts[1] ?? '');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    read_messages: existingBot ? existingBot.permissions.includes('read_messages') : true,
    reply_in_chat: existingBot ? existingBot.permissions.includes('reply_in_chat') : true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const slug = useMemo(
    () => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    [name]
  );
  const selectedPermissions = PERMISSIONS
    .filter((permission) => permissions[permission.key])
    .map((permission) => permission.key);
  const nameError = name.length > 0 && name.trim().length < 2 ? 'Use at least 2 characters.' : undefined;
  const instructionError =
    instructions.length > 0 && instructions.trim().length < 20
      ? 'Add enough direction for consistent answers (20 characters minimum).'
      : undefined;
  const canSaveDraft = name.trim().length >= 2 && description.trim().length >= 2 && !isSaving;
  const canPublish =
    canSaveDraft &&
    instructions.trim().length >= 20 &&
    permissions.reply_in_chat;

  const buildAgentConfig = (): ChatAgentConfig => ({
    instructions: instructions.trim(),
    model,
    triggerMode,
    responseLength,
    tone,
    reasoningEffort: model === 'gpt-5.6-luna' ? 'low' : model === 'gpt-5.6-sol' ? 'high' : 'medium',
    historyLimit: permissions.read_messages ? historyLimit : 0,
    starterPrompts: [starterOne, starterTwo].map((item) => item.trim()).filter(Boolean),
  });

  const handleSave = async (isDraft: boolean) => {
    if (isDraft ? !canSaveDraft : !canPublish) return;
    setIsSaving(true);
    const botData = {
      slug: slug || existingBot?.slug || 'agent',
      name: name.trim(),
      description: description.trim(),
      commandHint: commandHint.trim() || '/ask',
      category,
      status: 'available' as const,
      runtimeMode: 'ai',
      permissions: selectedPermissions,
      isDraft,
      agentConfig: buildAgentConfig(),
    };

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title={existingBot ? 'Edit agent' : 'Create agent'}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.intro}>
          <View style={styles.agentMark}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.textPrimary} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>A specialist for your conversations</Text>
            <Text style={styles.introBody}>
              Define how it thinks, when it joins, and exactly what it can read.
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
            onSelect={(value) => setCategory(value as BotCategory)}
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
            onSelect={(value) => setTriggerMode(value as ChatAgentConfig['triggerMode'])}
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
              <Ionicons name="at" size={17} color={Colors.textSecondary} />
              <Text style={styles.invocationText}>People will type @{slug} followed by a request.</Text>
            </View>
          ) : null}
          {triggerMode === 'always' ? (
            <View style={styles.caution}>
              <Ionicons name="information-circle-outline" size={17} color={Colors.textSecondary} />
              <Text style={styles.cautionText}>
                Every-message agents can add noise and use more model capacity. Use this only when constant participation is intentional.
              </Text>
            </View>
          ) : null}
        </Section>

        <Section title="Intelligence" detail="Choose the quality, voice, and answer density.">
          <ChoiceList options={MODELS} selected={model} onSelect={(value) => setModel(value as ChatAgentConfig['model'])} />
          <Text style={styles.fieldLabel}>Voice</Text>
          <OptionGrid
            options={[
              { value: 'focused', label: 'Focused' },
              { value: 'warm', label: 'Warm' },
              { value: 'expert', label: 'Expert' },
            ]}
            selected={tone}
            onSelect={(value) => setTone(value as ChatAgentConfig['tone'])}
          />
          <Text style={styles.fieldLabel}>Response length</Text>
          <OptionGrid
            options={[
              { value: 'concise', label: 'Concise' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'detailed', label: 'Detailed' },
            ]}
            selected={responseLength}
            onSelect={(value) => setResponseLength(value as ChatAgentConfig['responseLength'])}
          />
        </Section>

        <Section title="Context & access" detail="Permissions are captured when the agent connects to a chat.">
          <View style={styles.permissionList}>
            {PERMISSIONS.map((permission, index) => {
              const enabled = permissions[permission.key];
              return (
                <View key={permission.key}>
                  <AnimatedPressable
                    onPress={() =>
                      setPermissions((current) => ({
                        ...current,
                        [permission.key]: !current[permission.key],
                      }))
                    }
                    style={styles.permissionRow}
                    scaleValue={0.985}
                    hapticFeedback="selection"
                    accessibilityRole="switch"
                    accessibilityLabel={permission.label}
                    accessibilityState={{ checked: enabled }}
                  >
                    <View style={styles.permissionCopy}>
                      <Text style={styles.permissionTitle}>{permission.label}</Text>
                      <Text style={styles.permissionDetail}>{permission.detail}</Text>
                    </View>
                    <Ionicons
                      name={enabled ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={enabled ? Colors.textPrimary : Colors.textMuted}
                    />
                  </AnimatedPressable>
                  {index < PERMISSIONS.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              );
            })}
          </View>
          {permissions.read_messages ? (
            <>
              <Text style={styles.fieldLabel}>Recent messages available</Text>
              <OptionGrid
                options={[
                  { value: '8', label: '8' },
                  { value: '16', label: '16' },
                  { value: '32', label: '32' },
                ]}
                selected={String(historyLimit)}
                onSelect={(value) => setHistoryLimit(Number(value))}
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
              color={Colors.textPrimary}
            />
          </View>
          <View style={styles.readinessCopy}>
            <Text style={styles.readinessTitle}>
              {canPublish ? 'Ready to publish' : 'Finish the required details'}
            </Text>
            <Text style={styles.readinessDetail}>
              {canPublish
                ? 'After publishing, connect this agent from a group chat.'
                : 'Name, description, instructions, and reply access are required.'}
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
    </SafeAreaView>
  );
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.xl,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: Space.sm,
  },
  agentMark: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: { flex: 1, gap: 3 },
  introTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  introBody: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
  },
  section: { gap: 14 },
  sectionTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  sectionDetail: {
    marginTop: 2,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  multilineShort: { minHeight: 88, alignItems: 'flex-start' },
  instructionsInput: { minHeight: 156, alignItems: 'flex-start' },
  multilineInput: { textAlignVertical: 'top', paddingTop: 12 },
  fieldLabel: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.captionElevated.size,
  },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  optionActive: { borderColor: Colors.textPrimary, backgroundColor: Colors.textPrimary },
  optionText: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  optionTextActive: { color: Colors.textInverse, fontFamily: Typography.family.semibold },
  choiceList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  choiceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Space.md },
  choiceCopy: { flex: 1, gap: 2 },
  choiceTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  choiceDetail: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.textPrimary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.textPrimary },
  invocationPreview: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  invocationText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: Type.captionElevated.size,
  },
  caution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingTop: 2,
  },
  cautionText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: 17,
  },
  permissionList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  permissionRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: Space.md },
  permissionCopy: { flex: 1, gap: 3 },
  permissionTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  permissionDetail: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: 17,
  },
  readiness: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  readinessIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessCopy: { flex: 1, gap: 2 },
  readinessTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  readinessDetail: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: 17,
  },
  actions: { flexDirection: 'row', gap: Space.sm },
  action: { flex: 1 },
});
