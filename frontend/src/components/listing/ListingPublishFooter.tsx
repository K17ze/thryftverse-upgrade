import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

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
      return 'Publishing…';
    case 'creating_listing':
      return 'Publishing…';
    case 'attaching_media':
      return 'Finishing…';
    case 'completed':
      return 'Published';
    case 'failed_recoverable':
      return "Couldn't publish — Retry";
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
  bottomInset }: ListingPublishFooterProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const stageText = getStageText(publicationStage);
  const showFeedback = stageText !== null || (errorMsg !== null && publicationStage !== 'idle');

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, Space.sm) }]}>
      {/* Publication feedback */}
      {showFeedback && (
        <View style={styles.feedbackRow}>
          {publicationStage !== 'failed_recoverable' && publicationStage !== 'idle' && publicationStage !== 'completed' && (
            <ActivityIndicator size="small" color={colors.brand} />
          )}
          {publicationStage === 'failed_recoverable' && (
            <AppIcon name="warning-outline" size={14} color="danger" opticalCenter accessible={false} />
          )}
          <Text
            style={[
              styles.feedbackText,
              publicationStage === 'failed_recoverable' && styles.feedbackTextError,
            ]}
            numberOfLines={2}
            accessibilityLiveRegion="polite"
            accessibilityLabel={errorMsg && publicationStage === 'failed_recoverable' ? errorMsg : undefined}
          >
            {stageText}
          </Text>
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
          <AppIcon name="eye-outline" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} style={{ marginRight: 6 }} />
          <Text style={styles.previewText}>Preview</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.publishBtn,
            publishDisabled && styles.publishBtnDisabled,
            !publishDisabled && styles.publishBtnReady,
            pressed && !publishDisabled && styles.publishBtnPressed,
          ]}
          onPress={onPublish}
          disabled={publishDisabled}
          accessibilityRole="button"
          accessibilityLabel="Publish listing"
          accessibilityState={{ disabled: publishDisabled }}
        >
          {isPublishing ? (
            <>
              <ActivityIndicator size="small" color={colors.textInverse} />
              <Text
                style={[styles.publishText, { marginLeft: Space.xs }]}
                accessibilityLiveRegion="polite"
              >
                {getPublishLabel(mode, true)}
              </Text>
            </>
          ) : (
            <>
              {!publishDisabled && (
                <AppIcon name="arrow-up-circle" size={18} color="textInverse" opticalCenter accessible={false} style={{ marginRight: 6 }} />
              )}
              <Text
                style={[
                  styles.publishText,
                  publishDisabled && styles.publishTextDisabled,
                ]}
              >
                {getPublishLabel(mode, false)}
              </Text>
            </>
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
    paddingTop: Space.sm },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: Space.sm },
  feedbackText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  feedbackTextError: {
    color: colors.danger,
    fontFamily: Typography.family.semibold },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center' },
  previewBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row' },
  previewBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }] },
  previewText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  publishBtn: {
    flex: 1.6,
    height: 50,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row' },
  publishBtnReady: {
    height: 52 },
  publishBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }] },
  publishBtnDisabled: {
    backgroundColor: colors.surfaceAlt },
  publishText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textInverse },
  publishTextDisabled: {
    color: colors.textMuted } });
}
