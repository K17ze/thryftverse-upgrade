import React from 'react';
import { Text, View } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { ChatAgentConfig } from '../../domain';
import type {
  ResponseLength,
  Tone,
  TriggerMode } from '../../platform/agents/agentDefinition';
import { AppInput } from '../ui/AppInput';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { CollapsibleStep } from './CollapsibleStep';
import { OptionGrid } from './OptionGrid';
import { ChoiceList } from './ChoiceList';
import { REASONING_EFFORTS, TRIGGERS } from './botBuilderTypes';
import type { BotBuilderStyles } from './botBuilderStyles';

// ── Step 3: Behaviour (collapsible, shown after Step 2) ──

export function BehaviorStep({
  triggerMode,
  onTriggerModeChange,
  slug,
  tone,
  onToneChange,
  responseLength,
  onResponseLengthChange,
  reasoningEffort,
  onReasoningEffortChange,
  starterOne,
  onStarterOneChange,
  starterTwo,
  onStarterTwoChange,
  complete,
  open,
  onToggle,
  colors,
  styles }: {
  triggerMode: TriggerMode;
  onTriggerModeChange: (value: TriggerMode) => void;
  slug: string;
  tone: Tone;
  onToneChange: (value: Tone) => void;
  responseLength: ResponseLength;
  onResponseLengthChange: (value: ResponseLength) => void;
  reasoningEffort: ChatAgentConfig['reasoningEffort'];
  onReasoningEffortChange: (value: ChatAgentConfig['reasoningEffort']) => void;
  starterOne: string;
  onStarterOneChange: (value: string) => void;
  starterTwo: string;
  onStarterTwoChange: (value: string) => void;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  colors: ThemeColors;
  styles: BotBuilderStyles;
}) {
  return (
    <CollapsibleStep
      stepNumber={3}
      title="Behaviour"
      detail="How and when it joins, and its voice."
      complete={complete}
      open={open}
      onToggle={onToggle}
      colors={colors}
      styles={styles}
    >
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Trigger mode</Text>
      <ChoiceList
        options={TRIGGERS}
        selected={triggerMode}
        onSelect={(value) => onTriggerModeChange(value as TriggerMode)}
      />
      {triggerMode === 'mention' && slug ? (
        <View style={styles.invocationPreview}>
          <AppIcon name="at" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
          <Text style={styles.invocationText}>People will type @{slug} followed by a request.</Text>
        </View>
      ) : null}
      {triggerMode === 'always' ? (
        <View style={styles.caution}>
          <AppIcon name="info" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
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
        onSelect={(value) => onToneChange(value as Tone)}
      />

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Response length</Text>
      <OptionGrid
        options={[
          { value: 'concise', label: 'Concise' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'detailed', label: 'Detailed' },
        ]}
        selected={responseLength}
        onSelect={(value) => onResponseLengthChange(value as ResponseLength)}
      />

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Reasoning effort</Text>
      <OptionGrid
        options={REASONING_EFFORTS}
        selected={reasoningEffort}
        onSelect={(value) => onReasoningEffortChange(value as ChatAgentConfig['reasoningEffort'])}
      />

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Conversation starters</Text>
      <AppInput
        value={starterOne}
        onChangeText={onStarterOneChange}
        placeholder="Find the strongest option in this chat"
        maxLength={160}
        accessibilityLabel="First conversation starter"
      />
      <AppInput
        value={starterTwo}
        onChangeText={onStarterTwoChange}
        placeholder="Summarise the decisions so far"
        maxLength={160}
        accessibilityLabel="Second conversation starter"
      />
    </CollapsibleStep>
  );
}
