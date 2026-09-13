import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { BotBuilderValidationResult } from './botBuilderTypes';
import type { BotBuilderStyles } from './botBuilderStyles';

// ── Step 5: Publish (shown when all required fields are filled) ──

export function PublishStep({
  canPublish,
  canSaveDraft,
  validating,
  validationResult,
  onValidate,
  isSaving,
  publishTitle,
  onSaveDraft,
  onPublish,
  colors,
  styles }: {
  canPublish: boolean;
  canSaveDraft: boolean;
  validating: boolean;
  validationResult: BotBuilderValidationResult | null;
  onValidate: () => void;
  isSaving: boolean;
  publishTitle: string;
  onSaveDraft: () => void;
  onPublish: () => void;
  colors: ThemeColors;
  styles: BotBuilderStyles;
}) {
  return (
    <View style={styles.publishSection}>
      <View style={[styles.publishHeader, { borderBottomColor: colors.border }]}>
        <AppIcon
          name={canPublish ? 'checkmark-circle' : 'ellipse-outline'}
          size={IconSize.md}
          color={canPublish ? 'success' : 'textMuted'}
          opticalCenter
          accessible={false}
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
            onPress={onValidate}
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
          onPress={onSaveDraft}
          disabled={!canSaveDraft}
          loading={isSaving}
          style={styles.action}
        />
        <AppButton
          title={publishTitle}
          variant="primary"
          size="md"
          onPress={onPublish}
          disabled={!canPublish || (validationResult !== null && !validationResult.valid)}
          loading={isSaving}
          style={styles.action}
        />
      </View>
    </View>
  );
}
