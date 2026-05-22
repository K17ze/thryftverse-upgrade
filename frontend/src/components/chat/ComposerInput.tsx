import React from 'react';
import { View, StyleSheet, ViewStyle, KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppInput } from '../ui/AppInput';

interface ComposerInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onCameraPress?: () => void;
  placeholder?: string;
  returnKeyType?: 'send' | 'default';
  style?: ViewStyle;
  inputContainerStyle?: ViewStyle;
}

export function ComposerInput({
  value,
  onChangeText,
  onSend,
  onCameraPress,
  placeholder = 'Message...',
  returnKeyType = 'send',
  style,
  inputContainerStyle,
}: ComposerInputProps) {
  const canSend = value.trim().length > 0;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.pill, inputContainerStyle]}>
        {onCameraPress && (
          <AnimatedPressable
            style={styles.cameraBtn}
            onPress={onCameraPress}
            accessibilityRole="button"
            accessibilityLabel="Attach photo"
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
          >
            <Ionicons name="camera-outline" size={22} color={Colors.textSecondary} />
          </AnimatedPressable>
        )}

        <AppInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          returnKeyType={returnKeyType}
          onSubmitEditing={canSend ? onSend : undefined}
          inputContainerStyle={styles.inputWrap}
          inputStyle={styles.input}
          accessibilityLabel="Message input"
          accessibilityHint="Type your message here"
        />

        <AnimatedPressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-up" size={20} color={Colors.background} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm + 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingLeft: Space.sm,
    paddingRight: Space.xs,
    minHeight: 48,
  },
  cameraBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 40,
    paddingHorizontal: Space.xs,
  },
  input: {
    fontSize: Type.body.size,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Space.xs,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surfaceAlt,
  },
});
