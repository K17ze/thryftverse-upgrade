import React from 'react';
import type { ThemeColors } from '../../theme/ThemeContext';
import { AppInput } from '../ui/AppInput';
import { CollapsibleStep } from './CollapsibleStep';
import type { BotBuilderStyles } from './botBuilderStyles';

// ── Step 2: Identity (collapsible, shown after Step 1 has content) ──

export function IdentityStep({
  name,
  onNameChange,
  nameError,
  description,
  onDescriptionChange,
  commandHint,
  onCommandHintChange,
  complete,
  open,
  onToggle,
  colors,
  styles }: {
  name: string;
  onNameChange: (value: string) => void;
  nameError: string | undefined;
  description: string;
  onDescriptionChange: (value: string) => void;
  commandHint: string;
  onCommandHintChange: (value: string) => void;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  colors: ThemeColors;
  styles: BotBuilderStyles;
}) {
  return (
    <CollapsibleStep
      stepNumber={2}
      title="Identity"
      detail="What people will see in chat."
      complete={complete}
      open={open}
      onToggle={onToggle}
      colors={colors}
      styles={styles}
    >
      <AppInput
        label="Name"
        value={name}
        onChangeText={onNameChange}
        placeholder="e.g. Archive stylist"
        maxLength={40}
        errorText={nameError}
        accessibilityLabel="Agent name"
      />
      <AppInput
        label="Short description"
        value={description}
        onChangeText={onDescriptionChange}
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
        onChangeText={onCommandHintChange}
        placeholder="/ask"
        maxLength={20}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Agent command hint"
      />
    </CollapsibleStep>
  );
}
