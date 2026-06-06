import React from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { Typography } from '../../constants/typography';
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
  const canSend = value.trim().length > 0 && !isSending;

  return (
    <View style={styles.root}>
      <AnimatedPressable
        onPress={onAttachmentPress}
        style={styles.actionBtn}
        activeOpacity={0.7}
        scaleValue={0.88}
        hapticFeedback="light"
        accessibilityLabel="Add attachment"
        accessibilityRole="button"
        disabled={disabled}
      >
        <Ionicons name="add-circle-outline" size={26} color={Colors.textSecondary} />
      </AnimatedPressable>

      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={canSend ? onSend : undefined}
          blurOnSubmit={false}
          editable={!disabled}
          autoCapitalize="sentences"
          autoCorrect
          maxLength={2000}
          accessibilityLabel="Message input"
          accessibilityRole="text"
        />
      </View>

      <AnimatedPressable
        onPress={onCameraPress}
        style={styles.actionBtn}
        activeOpacity={0.7}
        scaleValue={0.88}
        hapticFeedback="light"
        accessibilityLabel="Open camera"
        accessibilityRole="button"
        disabled={disabled}
      >
        <Ionicons name="camera-outline" size={24} color={Colors.textSecondary} />
      </AnimatedPressable>

      <AnimatedPressable
        onPress={canSend ? onSend : undefined}
        style={[styles.sendBtn, canSend && styles.sendBtnActive]}
        activeOpacity={0.7}
        scaleValue={0.88}
        hapticFeedback="medium"
        accessibilityLabel="Send message"
        accessibilityRole="button"
        disabled={!canSend || disabled}
      >
        <Ionicons
          name="arrow-up"
          size={20}
          color={canSend ? Colors.textInverse : Colors.textMuted}
        />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: 8,
    gap: Space.xs,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
    padding: 0,
    margin: 0,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: Colors.brand,
  },
});
