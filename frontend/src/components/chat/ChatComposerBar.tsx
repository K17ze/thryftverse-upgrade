import React, { useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface ChatComposerBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachmentPress: () => void;
  onCameraPress: () => void;
  placeholder?: string;
  isSending?: boolean;
  disabled?: boolean;
}

const MAX_INPUT_HEIGHT = 120;

export function ChatComposerBar({
  value,
  onChangeText,
  onSend,
  onAttachmentPress,
  onCameraPress,
  placeholder = 'Message...',
  isSending = false,
  disabled = false,
}: ChatComposerBarProps) {
  const inputRef = useRef<TextInput>(null);
  const hasText = value.trim().length > 0;
  const canSend = hasText && !isSending && !disabled;

  return (
    <View style={styles.root}>
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

      {hasText ? (
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
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.sm,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    gap: Space.xs + 2,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
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