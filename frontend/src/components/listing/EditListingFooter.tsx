import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

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
  const stageText = getStageText(saveStage);
  const showFeedback = stageText !== null || (errorMsg !== null && saveStage !== 'idle');

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, Space.sm) }]}>
      {/* Save feedback */}
      {showFeedback && (
        <View style={styles.feedbackRow}>
          {saveStage !== 'failed_recoverable' && saveStage !== 'idle' && saveStage !== 'completed' && (
            <ActivityIndicator size="small" color={Colors.brand} />
          )}
          {saveStage === 'failed_recoverable' && (
            <Ionicons name="warning-outline" size={14} color={Colors.danger} />
          )}
          {saveStage === 'completed' && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
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
            <ActivityIndicator size="small" color={Colors.textInverse} />
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  feedbackTextError: {
    color: Colors.danger,
    fontFamily: Typography.family.semibold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  previewBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  saveBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: Colors.surfaceAlt,
  },
  saveText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
  },
  saveTextDisabled: {
    color: Colors.textMuted,
  },
});
