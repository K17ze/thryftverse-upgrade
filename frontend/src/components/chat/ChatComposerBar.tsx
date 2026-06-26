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
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

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
}

const MAX_INPUT_HEIGHT = 120;

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
}: ChatComposerBarProps) {
  const inputRef = useRef<TextInput>(null);
  const hasText = value.trim().length > 0;
  const canSend = (hasText || attachments.length > 0) && !isSending && !disabled;
  const showQuickReplies = quickReplies.length > 0 && !hasText && attachments.length === 0;

  return (
    <View style={styles.root}>
      {safetyWarning ? (
        <View style={styles.safetyBanner}>
          <Ionicons name="shield-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.safetyBannerText}>{safetyWarning}</Text>
        </View>
      ) : null}

      {attachments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachmentStrip} contentContainerStyle={styles.attachmentStripContent}>
          {attachments.map((att, i) => (
            <View key={i} style={styles.attachmentChip}>
              <Ionicons name={att.type === 'video' ? 'videocam-outline' : 'image-outline'} size={16} color={Colors.textSecondary} />
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
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
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
              style={styles.quickReplyChip}
              accessibilityRole="button"
              accessibilityLabel={`Quick reply: ${qr.label}`}
            >
              <Text style={styles.quickReplyText}>{qr.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
          disabled={disabled || isSending}
        >
          <Ionicons name="add-circle-outline" size={26} color={Colors.textSecondary} />
        </AnimatedPressable>

        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={2000}
            editable={!disabled && !isSending}
            autoCapitalize="sentences"
            autoCorrect
            textAlignVertical="center"
            accessibilityLabel="Message input"
            accessibilityRole="text"
            onSubmitEditing={canSend ? onSend : undefined}
          />
        </View>

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
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={canSend ? Colors.textInverse : Colors.textMuted} />
            )}
          </AnimatedPressable>
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
            <Ionicons name="camera-outline" size={24} color={Colors.textSecondary} />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    backgroundColor: `${Colors.danger}08`,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `${Colors.danger}20`,
  },
  safetyBannerText: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
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
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  attachmentChipText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textSecondary,
  },
  quickReplyStrip: {
    maxHeight: 40,
  },
  quickReplyContent: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  quickReplyChip: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  quickReplyText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.sm,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    gap: Space.xs + 2,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md - 2,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    minHeight: 44,
    maxHeight: MAX_INPUT_HEIGHT + 12,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: Colors.brand,
  },
});