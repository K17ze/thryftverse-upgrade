import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const stageText = getStageText(publicationStage);
  const showFeedback = stageText !== null || (errorMsg !== null && publicationStage !== 'idle');

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, Space.sm) }]}>
      {/* Publication feedback */}
      {showFeedback && (
        <View style={styles.feedbackRow}>
          {publicationStage !== 'failed_recoverable' && publicationStage !== 'idle' && (
            <ActivityIndicator size="small" color={colors.brand} />
          )}
          {publicationStage === 'failed_recoverable' && (
            <Ionicons name="warning-outline" size={14} color={colors.danger} />
          )}
          <Text
            style={[
              styles.feedbackText,
              publicationStage === 'failed_recoverable' && styles.feedbackTextError,
            ]}
            numberOfLines={2}
            accessibilityLiveRegion="polite"
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
            <ActivityIndicator size="small" color={colors.textInverse} />
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
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  publishBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: Radius.xxl,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  publishText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
  },
  publishTextDisabled: {
    color: colors.textMuted,
  },
  });
}
