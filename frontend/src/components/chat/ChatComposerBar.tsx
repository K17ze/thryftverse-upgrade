import React, { useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  VoiceMessageRecorder,
  VoiceRecordingIndicator,
} from './VoiceMessageRecorder';

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
  onAttachmentPress: () => void;
  onCameraPress: () => void;
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
  onVoicePress?: () => void;
  isVoiceRecording?: boolean;
  onVoiceCancel?: () => void;
  onVoiceSend?: (uri: string, durationMs: number) => void;
}

const MAX_INPUT_HEIGHT = 120;
const MAX_CHARS = 2000;
const CHAR_WARN_THRESHOLD = 1500;
const CHAR_DANGER_THRESHOLD = 1800;

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
  onVoicePress,
  isVoiceRecording = false,
  onVoiceCancel,
  onVoiceSend,
}: ChatComposerBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const inputRef = useRef<TextInput>(null);
  const hasText = value.trim().length > 0;
  const canSend = (hasText || attachments.length > 0) && !isSending && !disabled;
  const showQuickReplies = quickReplies.length > 0 && !hasText && attachments.length === 0 && !isVoiceRecording;
  const showMicButton = !hasText && attachments.length === 0 && !isVoiceRecording && !!onVoiceSend;
  const charCount = value.length;
  const showCharCount = charCount > CHAR_WARN_THRESHOLD;
  const charCountColor = charCount >= MAX_CHARS ? colors.danger : charCount >= CHAR_DANGER_THRESHOLD ? colors.warning : colors.textMuted;

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
              accessibilityLabel="Dismiss safety warning"
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
          <Ionicons name="shield-outline" size={12} color={colors.textMuted} />
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
              accessibilityLabel="Dismiss caution warning"
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
              <Ionicons name={att.type === 'video' ? 'videocam-outline' : 'image-outline'} size={16} color={colors.textSecondary} />
              <Text style={styles.attachmentChipText} numberOfLines={1}>
                {att.type === 'video' ? 'Video' : 'Photo'}
              </Text>
              {onRemoveAttachment ? (
                <Pressable
                  onPress={() => onRemoveAttachment(i)}
                  hitSlop={8}
                  accessibilityLabel="Remove attachment"
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
              accessibilityLabel={`Quick reply: ${qr.label}`}
            >
              <Text style={styles.quickReplyText} numberOfLines={1}>{qr.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Subtle separator when safety banners are present */}
      {(dangerWarning || cautionWarning || safetyWarning) ? (
        <View style={styles.bannerDivider} />
      ) : null}

      <View style={styles.inputRow}>
        <AnimatedPressable
          onPress={onAttachmentPress}
          style={styles.actionBtn}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
          accessibilityLabel="Add attachment"
          accessibilityRole="button"
          disabled={disabled || isSending || isVoiceRecording}
        >
          <Ionicons name="add-circle-outline" size={26} color={colors.textSecondary} />
        </AnimatedPressable>

        {isVoiceRecording ? (
          <VoiceRecordingIndicator />
        ) : (
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_CHARS}
              editable={!disabled && !isSending}
              autoCapitalize="sentences"
              autoCorrect
              textAlignVertical="center"
              accessibilityLabel="Message input"
              accessibilityRole="text"
              onSubmitEditing={canSend ? onSend : undefined}
            />
            {showCharCount ? (
              <Text style={[styles.charCount, { color: charCountColor }]}>
                {charCount}/{MAX_CHARS}
              </Text>
            ) : null}
          </View>
        )}

        {isVoiceRecording ? (
          <AnimatedPressable
            onPress={onVoiceCancel}
            style={styles.actionBtn}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
            accessibilityLabel="Cancel voice recording"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={colors.danger} />
          </AnimatedPressable>
        ) : hasText || attachments.length > 0 ? (
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
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={canSend ? colors.textInverse : colors.textMuted} />
            )}
          </AnimatedPressable>
        ) : showMicButton ? (
          <VoiceMessageRecorder
            onSend={(uri, durationMs) => onVoiceSend?.(uri, durationMs)}
            onCancel={onVoiceCancel}
            onRecordingChange={(recording) => {
              if (recording) onVoicePress?.();
            }}
            disabled={disabled || isSending}
          />
        ) : (
          <AnimatedPressable
            onPress={onCameraPress}
            style={styles.actionBtn}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
            accessibilityLabel="Open camera"
            accessibilityRole="button"
            disabled={disabled || isSending}
          >
            <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    backgroundColor: `${colors.danger}08`,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `${colors.danger}20`,
  },
  safetyBannerText: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textMuted,
    lineHeight: Type.meta.lineHeight + 1,
  },
  dangerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: `${colors.danger}12`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.danger}30`,
  },
  dangerBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    flex: 1,
    paddingRight: Space.sm,
  },
  dangerBannerText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.danger,
    lineHeight: 16,
  },
  cautionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: `${colors.warning}10`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.warning}30`,
  },
  cautionBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    flex: 1,
    paddingRight: Space.sm,
  },
  cautionBannerText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.warning,
    lineHeight: 16,
  },
  attachmentStrip: {
    maxHeight: 52,
  },
  attachmentStripContent: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  attachmentChipText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textSecondary,
  },
  quickReplyStrip: {
    maxHeight: 52,
  },
  quickReplyContent: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  quickReplyChip: {
    maxWidth: 210,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickReplyChipPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  quickReplyText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.md,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    gap: Space.xs + 2,
  },
  bannerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  actionBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: Space.md - 2,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    minHeight: 44,
    maxHeight: MAX_INPUT_HEIGHT + 24,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.metadata.fontFamily,
    textAlign: 'right',
    paddingTop: 2,
    paddingBottom: 2,
  },
  input: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
    padding: 0,
    margin: 0,
    paddingTop: Platform.OS === 'ios' ? 4 : 6,
    paddingBottom: Platform.OS === 'ios' ? 4 : 6,
    maxHeight: MAX_INPUT_HEIGHT,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: colors.brand,
  },
});
