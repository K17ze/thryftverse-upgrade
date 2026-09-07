import React, { useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Text,
  ScrollView,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { VoiceMessageRecorder } from './VoiceMessageRecorder';
import { useAppTranslation } from '../../i18n/useAppTranslation';

interface AttachmentPreview {
  uri: string;
  type?: 'image' | 'video';
}

interface QuickReply {
  label: string;
  onPress: () => void;
}

interface ChatComposerBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachmentPress?: () => void;
  onCameraPress?: () => void;
  onRemoveAttachment?: (index: number) => void;
  placeholder?: string;
  isSending?: boolean;
  disabled?: boolean;
  attachments?: AttachmentPreview[];
  quickReplies?: QuickReply[];
  safetyWarning?: string;
  /** Danger-level warning shown prominently above the input */
  dangerWarning?: string;
  /** Caution-level warning shown with amber styling */
  cautionWarning?: string;
  onDismissDangerWarning?: () => void;
  onDismissCautionWarning?: () => void;
  onVoiceRecord: (draft: {
    uri: string;
    fileName: string;
    contentType: string;
    durationMs: number;
    sizeBytes: number;
  }) => void;
  isVoiceRecording?: boolean;
  onVoiceRecordingChange?: (isRecording: boolean) => void;
  onSelectionChange?: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void;
}

const MAX_INPUT_HEIGHT = 120;
const MAX_CHARS = 2000;

export function ChatComposerBar({
  value,
  onChangeText,
  onSend,
  onAttachmentPress,
  onCameraPress,
  onRemoveAttachment,
  placeholder = 'Message...',
  isSending = false,
  disabled = false,
  attachments = [],
  quickReplies = [],
  safetyWarning,
  dangerWarning,
  cautionWarning,
  onDismissDangerWarning,
  onDismissCautionWarning,
  onVoiceRecord,
  isVoiceRecording = false,
  onVoiceRecordingChange,
  onSelectionChange }: ChatComposerBarProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const inputRef = useRef<TextInput>(null);
  const hasText = value.trim().length > 0;
  const canSend = (hasText || attachments.length > 0) && !isSending && !disabled;
  const showQuickReplies = quickReplies.length > 0 && !hasText && attachments.length === 0 && !isVoiceRecording;

  return (
    <View style={styles.root}>
      {/* Danger-level safety nudge — real-time composer detection */}
      {dangerWarning ? (
        <View style={styles.dangerBanner}>
          <View style={styles.dangerBannerContent}>
            <Ionicons name="warning" size={14} color={colors.danger} />
            <Text style={styles.dangerBannerText}>{dangerWarning}</Text>
          </View>
          {onDismissDangerWarning ? (
            <Pressable
              onPress={onDismissDangerWarning}
              hitSlop={8}
              accessibilityLabel={t('compose.dismissSafetyWarning')}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Info-level static safety reminder */}
      {safetyWarning && !dangerWarning && !cautionWarning ? (
        <View style={styles.safetyBanner}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
          <Text style={styles.safetyBannerText} numberOfLines={2}>{safetyWarning}</Text>
        </View>
      ) : null}

      {/* Caution-level warning — amber styling for high-pressure tactics */}
      {cautionWarning && !dangerWarning ? (
        <View style={styles.cautionBanner}>
          <View style={styles.cautionBannerContent}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
            <Text style={styles.cautionBannerText}>{cautionWarning}</Text>
          </View>
          {onDismissCautionWarning ? (
            <Pressable
              onPress={onDismissCautionWarning}
              hitSlop={8}
              accessibilityLabel={t('compose.dismissCautionWarning')}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {attachments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachmentStrip} contentContainerStyle={styles.attachmentStripContent}>
          {attachments.map((att, i) => (
            <View key={i} style={styles.attachmentChip}>
              <Ionicons name={att.type === 'video' ? 'videocam-outline' : 'image-outline'} size={18} color={colors.textSecondary} />
              {onRemoveAttachment ? (
                <Pressable
                  onPress={() => onRemoveAttachment(i)}
                  hitSlop={8}
                  accessibilityLabel={t('compose.removeAttachment')}
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {showQuickReplies ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickReplyStrip} contentContainerStyle={styles.quickReplyContent}>
          {quickReplies.map((qr, i) => (
            <Pressable
              key={i}
              onPress={qr.onPress}
              style={({ pressed }) => [
                styles.quickReplyChip,
                pressed && styles.quickReplyChipPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('compose.quickReply', { label: qr.label })}
            >
              <Text style={styles.quickReplyText} numberOfLines={1}>{qr.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.inputRow}>
        {onAttachmentPress ? (
          <AnimatedPressable
            onPress={onAttachmentPress}
            style={styles.actionBtn}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
            accessibilityLabel={t('compose.addAttachment')}
            accessibilityRole="button"
            disabled={disabled || isSending || isVoiceRecording}
          >
            <Ionicons name="add-outline" size={24} color={colors.textSecondary} />
          </AnimatedPressable>
        ) : null}

        {isVoiceRecording ? (
          <View style={styles.inputWrap}>
            <VoiceMessageRecorder
              onSend={onVoiceRecord}
              onRecordingStateChange={onVoiceRecordingChange}
              disabled={disabled || isSending}
            />
          </View>
        ) : (
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              onSelectionChange={onSelectionChange}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_CHARS}
              editable={!disabled && !isSending}
              autoCapitalize="sentences"
              autoCorrect
              textAlignVertical="center"
              accessibilityLabel={t('compose.inputAccessibility')}
              accessibilityRole="text"
              onSubmitEditing={canSend ? onSend : undefined}
            />
          </View>
        )}

        {hasText || attachments.length > 0 ? (
          <AnimatedPressable
            onPress={onSend}
            style={[styles.sendBtn, canSend && styles.sendBtnActive]}
            activeOpacity={0.7}
            scaleValue={0.88}
            hapticFeedback="medium"
            accessibilityLabel={isSending ? 'Sending message' : 'Send message'}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend, busy: isSending }}
            disabled={!canSend}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Ionicons name="send" size={18} color={canSend ? colors.textInverse : colors.textMuted} />
            )}
          </AnimatedPressable>
        ) : onCameraPress ? (
          <AnimatedPressable
            onPress={onCameraPress}
            style={styles.actionBtn}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
            accessibilityLabel={t('compose.openCamera')}
            accessibilityRole="button"
            disabled={disabled || isSending}
          >
            <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 1,
    backgroundColor: colors.dangerSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dangerBorder },
  safetyBannerText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted,
    lineHeight: TypographyV2.meta.lineHeight + 1 },
  dangerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.dangerSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dangerBorder },
  dangerBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    flex: 1,
    paddingRight: Space.sm },
  dangerBannerText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger,
    lineHeight: 16 },
  cautionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.warningSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warningBorder },
  cautionBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    flex: 1,
    paddingRight: Space.sm },
  cautionBannerText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.warning,
    lineHeight: 16 },
  attachmentStrip: {
    maxHeight: 48 },
  attachmentStripContent: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 1 },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  quickReplyStrip: {
    maxHeight: 48 },
  quickReplyContent: {
    flexDirection: 'row',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 1 },
  quickReplyChip: {
    maxWidth: 200,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm - 1,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  quickReplyChipPressed: {
    backgroundColor: colors.surfaceAlt },
  quickReplyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Platform.OS === 'ios' ? Space.sm : 6,
    gap: Space.xs },
  actionBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full },
  inputWrap: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: Space.md - 2,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    minHeight: 44,
    maxHeight: MAX_INPUT_HEIGHT + 24,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.xl,
    justifyContent: 'center' },
  input: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight,
    padding: 0,
    margin: 0,
    paddingTop: Platform.OS === 'ios' ? 4 : 6,
    paddingBottom: Platform.OS === 'ios' ? 4 : 6,
    maxHeight: MAX_INPUT_HEIGHT },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end' },
  sendBtnActive: {
    backgroundColor: colors.brand } });
