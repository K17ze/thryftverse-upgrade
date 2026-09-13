import React, { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useBotBuilderForm } from '../hooks/botbuilder';
import { createBotBuilderStyles } from '../components/botbuilder/botBuilderStyles';
import { HydrationGate } from '../components/botbuilder/HydrationGate';
import { PurposeStep } from '../components/botbuilder/PurposeStep';
import { IdentityStep } from '../components/botbuilder/IdentityStep';
import { BehaviorStep } from '../components/botbuilder/BehaviorStep';
import { ModelPermissionsStep } from '../components/botbuilder/ModelPermissionsStep';
import { PublishStep } from '../components/botbuilder/PublishStep';

type Props = NativeStackScreenProps<RootStackParamList, 'BotBuilder'>;

export default function BotBuilderScreen({ navigation, route }: Props) {
  const { botId } = route.params ?? {};
  const { colors } = useAppTheme();
  const styles = useMemo(() => createBotBuilderStyles(colors), [colors]);
  const form = useBotBuilderForm({ botId, goBack: () => navigation.goBack() });

  // Edit-mode hydration: the form can't render truthfully until the bot's
  // stored config arrives.
  if (form.hydrationBlocked) {
    return (
      <HydrationGate
        hydrateError={form.hydrateError}
        isOffline={form.isOffline}
        onRetry={form.retryHydration}
        onBack={() => navigation.goBack()}
        styles={styles}
      />
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={form.existingBot || botId ? 'Edit agent' : 'Create agent'}
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
        <PurposeStep
          instructions={form.instructions}
          onInstructionsChange={form.setInstructions}
          instructionError={form.instructionError}
          category={form.category}
          onCategoryChange={form.handleCategoryChange}
          complete={form.step1Complete}
          colors={colors}
          styles={styles}
        />

        {/* ── Step 2: Identity (collapsible, shown after Step 1 has content) ── */}
        {form.step2Available ? (
          <IdentityStep
            name={form.name}
            onNameChange={form.setName}
            nameError={form.nameError}
            description={form.description}
            onDescriptionChange={form.setDescription}
            commandHint={form.commandHint}
            onCommandHintChange={form.setCommandHint}
            complete={form.step2Complete}
            open={form.step2Open}
            onToggle={() => form.setStep2Open((v) => !v)}
            colors={colors}
            styles={styles}
          />
        ) : null}

        {/* ── Step 3: Behaviour (collapsible, shown after Step 2) ── */}
        {form.step3Available ? (
          <BehaviorStep
            triggerMode={form.triggerMode}
            onTriggerModeChange={form.setTriggerMode}
            slug={form.slug}
            tone={form.tone}
            onToneChange={form.setTone}
            responseLength={form.responseLength}
            onResponseLengthChange={form.setResponseLength}
            reasoningEffort={form.reasoningEffort}
            onReasoningEffortChange={form.setReasoningEffort}
            starterOne={form.starterOne}
            onStarterOneChange={form.setStarterOne}
            starterTwo={form.starterTwo}
            onStarterTwoChange={form.setStarterTwo}
            complete={form.step3Complete}
            open={form.step3Open}
            onToggle={() => form.setStep3Open((v) => !v)}
            colors={colors}
            styles={styles}
          />
        ) : null}

        {/* ── Step 4: Model & permissions (collapsible, advanced) ── */}
        {form.step4Available ? (
          <ModelPermissionsStep
            modelId={form.modelId}
            onModelIdChange={form.setModelId}
            conversationContext={form.conversationContext}
            onToggleConversationContext={() => form.setConversationContext((v) => !v)}
            maxTurns={form.maxTurns}
            onMaxTurnsChange={form.setMaxTurns}
            activeGrants={form.activeGrants}
            plannedGrantsByRisk={form.plannedGrantsByRisk}
            onGrantToggle={form.setGrantEnabled}
            complete={form.step4Complete}
            open={form.step4Open}
            onToggle={() => form.setStep4Open((v) => !v)}
            colors={colors}
            styles={styles}
          />
        ) : null}

        {/* ── Step 5: Publish (shown when all required fields are filled) ── */}
        {form.step5Available ? (
          <PublishStep
            canPublish={form.canPublish}
            canSaveDraft={form.canSaveDraft}
            validating={form.validating}
            validationResult={form.validationResult}
            onValidate={() => void form.runValidation()}
            isSaving={form.isSaving}
            publishTitle={form.existingBot?.isDraft === false ? 'Save & publish' : 'Publish agent'}
            onSaveDraft={() => void form.handleSave(true)}
            onPublish={() => void form.handleSave(false)}
            colors={colors}
            styles={styles}
          />
        ) : null}
      </ScrollView>
    </FlagshipScreen>
  );
}
