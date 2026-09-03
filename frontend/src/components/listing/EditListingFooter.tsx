import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { t } from '../../i18n';

type SaveStage =
  | 'idle'
  | 'uploading_media'
  | 'updating_listing'
  | 'completed'
  | 'failed_recoverable';

/**
 * Coarse save-state used to drive the save-button label and affordance.
 * Layered on top of the existing manual-save `SaveStage` so the original
 * flow is untouched.
 *
 * - 'saved'   — form is clean and the last save succeeded (green check).
 * - 'saving'  — an autosave or manual save is in flight (spinner).
 * - 'offline' — device is offline and there are unsaved changes (amber).
 * - 'dirty'   — form has changes; normal "Save" label.
 */
type SaveState = 'saved' | 'saving' | 'offline' | 'dirty';

interface EditListingFooterProps {
  isSaving: boolean;
  saveDisabled: boolean;
  saveStage: SaveStage;
  errorMsg: string | null;
  onPreview: () => void;
  onSave: () => void;
  bottomInset: number;
  /** Coarse save state driving the button label. Defaults to 'dirty'. */
  saveState?: SaveState;
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
  saveState = 'dirty' }: EditListingFooterProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const stageText = getStageText(saveStage);
  const showFeedback = stageText !== null || (errorMsg !== null && saveStage !== 'idle');

  // State-aware save button label + affordance. The manual save flow
  // (`isSaving` / `saveStage`) still drives the spinner during an active
  // upload/patch; this layer only changes the resting label.
  const saving = isSaving || saveState === 'saving';
  const saveLabel = saving
    ? t('listing.edit.savingButton')
    : saveState === 'saved'
      ? t('listing.edit.saved')
      : saveState === 'offline'
        ? t('listing.edit.offlineChanges')
        : t('listing.edit.saveButton');
  const saveAffordance: 'default' | 'success' | 'warning' =
    saveState === 'saved' ? 'success' : saveState === 'offline' ? 'warning' : 'default';

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, Space.sm) }]}>
      {/* Save feedback */}
      {showFeedback && (
        <View style={styles.feedbackRow}>
          {saveStage !== 'failed_recoverable' && saveStage !== 'idle' && saveStage !== 'completed' && (
            <ActivityIndicator size="small" color={colors.brand} />
          )}
          {saveStage === 'failed_recoverable' && (
            <AppIcon name="warning-outline" size={14} color="danger" opticalCenter accessible={false} />
          )}
          {saveStage === 'completed' && (
            <AppIcon name="checkmark-circle" size={14} color="success" opticalCenter accessible={false} />
          )}
          <Text
            style={[
              styles.feedbackText,
              saveStage === 'failed_recoverable' && styles.feedbackTextError,
            ]}
            numberOfLines={2}
            accessibilityLiveRegion="polite"
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
            saveAffordance === 'success' && styles.saveBtnSuccess,
            saveAffordance === 'warning' && styles.saveBtnWarning,
            saveDisabled && styles.saveBtnDisabled,
          ]}
          onPress={onSave}
          disabled={saveDisabled}
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          accessibilityState={{ disabled: saveDisabled }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <>
              {saveAffordance === 'success' && (
                <AppIcon name="checkmark-circle" size={14} color="textInverse" opticalCenter accessible={false} />
              )}
              {saveAffordance === 'warning' && (
                <AppIcon name="cloud-offline-outline" size={14} color="textInverse" opticalCenter accessible={false} />
              )}
              <Text
                style={[
                  styles.saveText,
                  saveDisabled && styles.saveTextDisabled,
                ]}
              >
                {saveLabel}
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
    gap: Space.sm },
  previewBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center' },
  previewText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  saveBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: Radius.xxl,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6 },
  saveBtnSuccess: {
    backgroundColor: colors.success },
  saveBtnWarning: {
    backgroundColor: colors.warning },
  saveBtnDisabled: {
    backgroundColor: colors.surfaceAlt },
  saveText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textInverse },
  saveTextDisabled: {
    color: colors.textMuted } });
}
