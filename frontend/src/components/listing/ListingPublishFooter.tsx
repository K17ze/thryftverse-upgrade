import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

type PublicationStage =
  | 'idle'
  | 'uploading_media'
  | 'creating_listing'
  | 'attaching_media'
  | 'completed'
  | 'failed_recoverable';

interface ListingPublishFooterProps {
  mode: 'sell_now' | 'co_own' | 'auction';
  isPublishing: boolean;
  publishDisabled: boolean;
  publicationStage: PublicationStage;
  errorMsg: string | null;
  onPreview: () => void;
  onPublish: () => void;
  bottomInset: number;
}

function getPublishLabel(mode: string, isPublishing: boolean): string {
  if (isPublishing) {
    if (mode === 'sell_now') return 'Publishing…';
    if (mode === 'co_own') return 'Sending…';
    return 'Starting…';
  }
  if (mode === 'co_own') return 'Continue to Co-Own';
  if (mode === 'auction') return 'Start auction';
  return 'Publish';
}

function getStageText(stage: PublicationStage): string | null {
  switch (stage) {
    case 'uploading_media':
      return 'Uploading media…';
    case 'creating_listing':
      return 'Creating listing…';
    case 'attaching_media':
      return 'Adding media…';
    case 'completed':
      return 'Listing created. Resuming media attachment.';
    case 'failed_recoverable':
      return 'Some media failed. Retry Publish.';
    default:
      return null;
  }
}

export function ListingPublishFooter({
  mode,
  isPublishing,
  publishDisabled,
  publicationStage,
  errorMsg,
  onPreview,
  onPublish,
  bottomInset,
}: ListingPublishFooterProps) {
  const stageText = getStageText(publicationStage);
  const showFeedback = stageText !== null || (errorMsg !== null && publicationStage !== 'idle');

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, Space.sm) }]}>
      {/* Publication feedback */}
      {showFeedback && (
        <View style={styles.feedbackRow}>
          {publicationStage !== 'failed_recoverable' && publicationStage !== 'idle' && (
            <ActivityIndicator size="small" color={Colors.brand} />
          )}
          {publicationStage === 'failed_recoverable' && (
            <Ionicons name="warning-outline" size={14} color={Colors.danger} />
          )}
          <Text
            style={[
              styles.feedbackText,
              publicationStage === 'failed_recoverable' && styles.feedbackTextError,
            ]}
            numberOfLines={2}
          >
            {errorMsg && publicationStage === 'failed_recoverable' ? errorMsg : stageText}
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
            styles.publishBtn,
            publishDisabled && styles.publishBtnDisabled,
          ]}
          onPress={onPublish}
          disabled={publishDisabled}
          accessibilityRole="button"
          accessibilityLabel="Publish listing"
          accessibilityState={{ disabled: publishDisabled }}
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : (
            <Text
              style={[
                styles.publishText,
                publishDisabled && styles.publishTextDisabled,
              ]}
            >
              {getPublishLabel(mode, false)}
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
  publishBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnDisabled: {
    backgroundColor: Colors.surfaceAlt,
  },
  publishText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
  },
  publishTextDisabled: {
    color: Colors.textMuted,
  },
});
