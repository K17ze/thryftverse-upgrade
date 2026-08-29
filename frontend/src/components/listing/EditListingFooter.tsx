import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type, Stroke} from '../../theme/designTokens';

type SaveStage =
  | 'idle'
  | 'uploading_media'
  | 'updating_listing'
  | 'completed'
  | 'failed_recoverable';

interface EditListingFooterProps {
  isSaving: boolean;
  saveDisabled: boolean;
  saveStage: SaveStage;
  errorMsg: string | null;
  onPreview: () => void;
  onSave: () => void;
  bottomInset: number;
}

function getStageText(stage: SaveStage): string | null {
  switch (stage) {
    case 'uploading_media':
      return 'Uploading new media…';
    case 'updating_listing':
      return 'Updating listing…';
    case 'completed':
      return 'Changes saved.';
    case 'failed_recoverable':
      return 'Some media failed. Retry before saving.';
    default:
      return null;
  }
}

export function EditListingFooter({
  isSaving,
  saveDisabled,
  saveStage,
  errorMsg,
  onPreview,
  onSave,
  bottomInset,
}: EditListingFooterProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const stageText = getStageText(saveStage);
  const showFeedback = stageText !== null || (errorMsg !== null && saveStage !== 'idle');

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, Space.sm) }]}>
      {/* Save feedback */}
      {showFeedback && (
        <View style={styles.feedbackRow}>
          {saveStage !== 'failed_recoverable' && saveStage !== 'idle' && saveStage !== 'completed' && (
            <ActivityIndicator size="small" color={colors.brand} />
          )}
          {saveStage === 'failed_recoverable' && (
            <Ionicons name="warning-outline" size={14} color={colors.danger} />
          )}
          {saveStage === 'completed' && (
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          )}
          <Text
            style={[
              styles.feedbackText,
              saveStage === 'failed_recoverable' && styles.feedbackTextError,
            ]}
            numberOfLines={2}
          >
            {errorMsg && saveStage === 'failed_recoverable' ? errorMsg : stageText}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={styles.previewBtn}
          onPress={onPreview}
          accessibilityRole="button"
          accessibilityLabel="Preview listing"
        >
          <Text style={styles.previewText}>Preview</Text>
        </Pressable>
        <Pressable
          style={[
            styles.saveBtn,
            saveDisabled && styles.saveBtnDisabled,
          ]}
          onPress={onSave}
          disabled={saveDisabled}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
          accessibilityState={{ disabled: saveDisabled }}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text
              style={[
                styles.saveText,
                saveDisabled && styles.saveTextDisabled,
              ]}
            >
              Save changes
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: Space.sm,
  },
  feedbackText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  feedbackTextError: {
    color: colors.danger,
    fontFamily: Typography.family.semibold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  previewBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  saveBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: Radius.xxl,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  saveText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
  },
  saveTextDisabled: {
    color: colors.textMuted,
  },
  });
}
