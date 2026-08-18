import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Type, Radius } from '../../theme/designTokens';

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
  /** Listing quality score (0-100) for compact readiness indicator. */
  qualityScore?: number;
  /** Quality tier label (e.g. "Excellent", "Good", "Basic"). */
  qualityTierLabel?: string;
  /** Quality color — communicates tier through color, not chrome. */
  qualityColor?: string;
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

// Per audit 04 publication states: expose only meaningful states.
//   Uploading photos… → Publishing… → Almost done… → recoverable failure.
function getStageText(stage: PublicationStage): string | null {
  switch (stage) {
    case 'uploading_media':
      return 'Uploading photos…';
    case 'creating_listing':
      return 'Publishing…';
    case 'attaching_media':
      return 'Almost done…';
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
  qualityScore,
  qualityTierLabel,
  qualityColor,
}: ListingPublishFooterProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const stageText = getStageText(publicationStage);
  const showFeedback = stageText !== null || (errorMsg !== null && publicationStage !== 'idle');
  // Quality indicator only shows when no active publication feedback.
  // Per audit 04 P1: "Sticky publish footer shows readiness + primary CTA,
  // not a second dashboard." The quality score is a compact inline indicator,
  // not a duplicate dashboard.
  const showQuality = qualityScore != null && qualityTierLabel != null && qualityColor != null && !showFeedback;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, Space.sm) }]}>
      {/* Publication feedback — replaces quality indicator when active */}
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

      {/* Compact quality readiness indicator — flat inline, no panel chrome.
          Per audit 04 P1 + AGENTS.md §4 surface budget. Color communicates
          tier, not a card or badge cluster. */}
      {showQuality && (
        <View style={styles.qualityRow}>
          <View style={[styles.qualityDot, { backgroundColor: qualityColor }]} />
          <Text style={styles.qualityLabel}>Listing quality</Text>
          <Text style={[styles.qualityScore, { color: qualityColor }]}>{qualityScore}%</Text>
          <Text style={styles.qualityTier}>{qualityTierLabel}</Text>
        </View>
      )}

      {/* Action buttons — per AGENTS.md §13: pressed feedback (scale + opacity) */}
      <View style={styles.actionRow}>
        <Pressable
          style={({ pressed }) => [styles.previewBtn, pressed && styles.previewBtnPressed]}
          onPress={onPreview}
          accessibilityRole="button"
          accessibilityLabel="Preview listing"
        >
          <Text style={styles.previewText}>Preview</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.publishBtn,
            publishDisabled && styles.publishBtnDisabled,
            pressed && !publishDisabled && styles.publishBtnPressed,
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
  /* Compact quality indicator — flat, no surface, no border.
     Per AGENTS.md §4: flat canvas, no card containers. */
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingBottom: Space.sm,
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  qualityLabel: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  qualityScore: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  qualityTier: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  previewBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  previewText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  publishBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
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
