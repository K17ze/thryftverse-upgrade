import React from 'react';
import { Text } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { AgentCategory } from '../../platform/agents/agentDefinition';
import { AppInput } from '../ui/AppInput';
import { CollapsibleStep } from './CollapsibleStep';
import { OptionGrid } from './OptionGrid';
import { CATEGORIES } from './botBuilderTypes';
import type { BotBuilderStyles } from './botBuilderStyles';

// ── Step 1: Purpose (always visible) ──

export function PurposeStep({
  instructions,
  onInstructionsChange,
  instructionError,
  category,
  onCategoryChange,
  complete,
  colors,
  styles }: {
  instructions: string;
  onInstructionsChange: (value: string) => void;
  instructionError: string | undefined;
  category: AgentCategory;
  onCategoryChange: (value: AgentCategory) => void;
  complete: boolean;
  colors: ThemeColors;
  styles: BotBuilderStyles;
}) {
  return (
    <CollapsibleStep
      stepNumber={1}
      title="Purpose"
      detail="What should this agent do?"
      complete={complete}
      alwaysOpen
      colors={colors}
      styles={styles}
    >
      <AppInput
        value={instructions}
        onChangeText={onInstructionsChange}
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
        onSelect={(value) => onCategoryChange(value as AgentCategory)}
      />
    </CollapsibleStep>
  );
}
