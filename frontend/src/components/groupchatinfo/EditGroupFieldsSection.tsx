/**
 * EditGroupFieldsSection — the name and description fields for the
 * edit-group screen. Uses the shared FlagshipFormSection label grammar
 * (semibold label, flat canvas) instead of a bespoke section header.
 * Presentation only; change handlers live in the orchestrator so every
 * keystroke can invalidate a pending save. Extracted verbatim from
 * EditGroupScreen.
 */

import React, { useMemo } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { FlagshipFormSection } from '../flagship';
import { Caption } from '../ui/Text';
import { Control, Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface EditGroupFieldsSectionProps {
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

export function EditGroupFieldsSection({
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: EditGroupFieldsSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <FlagshipFormSection title="Name" variant="flat" style={styles.section}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={onNameChange}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
          accessibilityLabel="Group name"
        />
        <Caption color={colors.textMuted} style={styles.charCount}>
          {name.length}/80
        </Caption>
      </FlagshipFormSection>

      <FlagshipFormSection title="Description" variant="flat" style={styles.section}>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={onDescriptionChange}
          placeholder="What is this group about?"
          placeholderTextColor={colors.textMuted}
          maxLength={280}
          multiline
          accessibilityLabel="Group description"
        />
        <Caption color={colors.textMuted} style={styles.charCount}>
          {description.length}/280
        </Caption>
      </FlagshipFormSection>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // The parent column's gap owns inter-section spacing — the section's
    // default marginBottom is neutralised so cadence stays Space.lg.
    section: {
      marginBottom: 0,
    },
    input: {
      minHeight: Control.hit,
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
    },
    textarea: {
      minHeight: 104,
      textAlignVertical: 'top',
    },
    charCount: {
      alignSelf: 'flex-end',
      marginTop: Space.xs,
      marginRight: 2,
    },
  });
}
