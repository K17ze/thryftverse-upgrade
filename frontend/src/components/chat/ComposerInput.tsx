import React from 'react';
import { View, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppInput } from '../ui/AppInput';

interface ComposerInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachmentPress?: () => void;
  onCameraPress?: () => void;
  placeholder?: string;
  returnKeyType?: 'send' | 'default';
  style?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  isSending?: boolean;
}

export function ComposerInput({
  value,
  onChangeText,
  onSend,
  onAttachmentPress,
  onCameraPress,
  placeholder = 'Message...',
  returnKeyType = 'send',
  style,
  inputContainerStyle,
  isSending = false,
}: ComposerInputProps) {
  const canSend = value.trim().length > 0;
  const [uiState, setUiState] = React.useState<'idle' | 'sending' | 'sent'>('idle');

  React.useEffect(() => {
    if (isSending) {
      setUiState('sending');
    } else if (uiState === 'sending') {
      setUiState('sent');
      const t = setTimeout(() => setUiState('idle'), 700);
      return () => clearTimeout(t);
    }
  }, [isSending]);

  const sendScale = useSharedValue(1);
  React.useEffect(() => {
    if (isSending) {
      sendScale.value = withTiming(0.99, { duration: 120 });
    } else {
      sendScale.value = withSpring(1, { damping: 18, stiffness: 420 });
    }
  }, [isSending]);

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const renderSendIcon = () => {
    if (uiState === 'sending') {
      return <ActivityIndicator size="small" color={Colors.textInverse} />;
    }
    if (uiState === 'sent') {
      return <Ionicons name="checkmark" size={18} color={Colors.textInverse} />;
    }
    return <Ionicons name="arrow-up" size={20} color={canSend ? Colors.background : Colors.textMuted} />;
  };

  return (
    <View style={[styles.container, style]}>
      <Reanimated.View style={[styles.pill, inputContainerStyle, pillAnimStyle]}>
        {onAttachmentPress && (
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={onAttachmentPress}
            accessibilityRole="button"
            accessibilityLabel="Open attachments"
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
          >
            <Ionicons name="add-circle-outline" size={24} color={Colors.textSecondary} />
          </AnimatedPressable>
        )}

        {onCameraPress && (
          <AnimatedPressable
            style={styles.iconBtn}
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
          multiline
          numberOfLines={1}
          maxLength={2000}
          textAlignVertical="center"
          blurOnSubmit={false}
        />

        <AnimatedPressable
          style={[styles.sendBtn, !canSend && uiState === 'idle' && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          {renderSendIcon()}
        </AnimatedPressable>
      </Reanimated.View>
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
    paddingLeft: Space.sm,
    paddingRight: Space.xs,
    minHeight: 48,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.full,
  },
  iconBtn: {
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
