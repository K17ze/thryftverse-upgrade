/**
 * LiveChatComposer — the chat input row pinned at the bottom of the live
 * stage: hairline-underlined field + send hit area.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { useAppTranslation } from '../../i18n/useAppTranslation';

interface LiveChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}

export function LiveChatComposer({ value, onChangeText, onSend }: LiveChatComposerProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('liveStreamViewer');

  return (
    <View style={[styles.composerRow, { paddingBottom: insets.bottom || Space.sm }]}>
      <TextInput
        style={[styles.composerInput, { color: colors.scrimTextPrimary, borderColor: colors.scrimTextTertiary }]}
        placeholder={t('chat.placeholder')}
        placeholderTextColor={colors.scrimTextTertiary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSend}
        returnKeyType="send"
        accessibilityLabel="Chat message input"
      />
      <AnimatedPressable
        onPress={onSend}
        disabled={!value.trim()}
        style={[styles.iconHit, !value.trim() && { opacity: 0.4 }]}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        <AppIcon name="send" size={IconSize.md} color="scrimTextPrimary" accessible={false} />
      </AnimatedPressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs },
  composerInput: {
    flex: 1,
    minHeight: Control.hit,
    paddingHorizontal: Space.sm,
    borderBottomWidth: Stroke.standard,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  iconHit: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' } });
