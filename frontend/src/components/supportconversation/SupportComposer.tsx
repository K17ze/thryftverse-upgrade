import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppInput } from '../ui/AppInput';

export interface SupportComposerProps {
  input: string;
  onChangeInput: (text: string) => void;
  composerEnabled: boolean;
  canSend: boolean;
  isSending: boolean;
  onSend: () => void;
}

export function SupportComposer({
  input,
  onChangeInput,
  composerEnabled,
  canSend,
  isSending,
  onSend }: SupportComposerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.composer, { paddingBottom: Math.max(0, insets.bottom - Space.md) }]}>
      <AppInput
        value={input}
        onChangeText={onChangeInput}
        placeholder="Message..."
        editable={composerEnabled}
        multiline
        maxLength={2000}
        appearance="filled"
        containerStyle={styles.composerInputContainer}
        inputContainerStyle={styles.composerInputWrap}
        inputStyle={styles.composerInputText}
      />
      <AnimatedPressable
        onPress={onSend}
        style={[
          styles.sendBtn,
          canSend ? { backgroundColor: colors.brand } : { backgroundColor: colors.surfaceAlt },
        ]}
        hapticFeedback="medium"
        accessibilityRole="button"
        accessibilityLabel="Send message"
        disabled={!canSend}
      >
        {isSending ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Ionicons
            name="arrow-up"
            size={18}
            color={canSend ? colors.background : colors.textMuted}
          />
        )}
      </AnimatedPressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: Space.sm,
      paddingTop: Space.sm },
    composerInputContainer: {
      flex: 1 },
    composerInputWrap: {
      minHeight: 40,
      maxHeight: 120,
      borderRadius: Radius.chat,
      paddingVertical: Space.xs,
      alignItems: 'flex-end' },
    composerInputText: {
      paddingVertical: Space.xs,
      maxHeight: 100 },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs } });
}
