import React, { forwardRef, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  ViewStyle,
  StyleProp,
  TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control, Stroke  } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';

interface AppSearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'placeholderTextColor' | 'style'>;
  rightNode?: React.ReactNode;
}

export const AppSearchBar = forwardRef<TextInput, AppSearchBarProps>(function AppSearchBar(
  {
    placeholder = 'Search...',
    value,
    onChangeText,
    onClear,
    containerStyle,
    inputProps,
    rightNode },
  ref
) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View style={[styles.container, isFocused && styles.containerFocused, containerStyle]}>
      <Ionicons name="search-outline" size={18} color={isFocused ? colors.textSecondary : colors.textMuted} />
      <TextInput
        ref={ref}
        {...inputProps}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => { setIsFocused(true); inputProps?.onFocus?.(e); }}
        onBlur={(e) => { setIsFocused(false); inputProps?.onBlur?.(e); }}
        accessibilityLabel={placeholder}
        accessibilityRole="search"
      />
      {value.length > 0 ? (
        <AnimatedPressable
          onPress={handleClear}
          hapticFeedback="light"
          scaleValue={0.96}
          activeOpacity={0.65}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Clear search"
          accessibilityRole="button"
        >
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </AnimatedPressable>
      ) : rightNode ? (
        rightNode
      ) : null}
    </View>
  );
})

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
    minHeight: Control.hit },
  containerFocused: {
    borderWidth: Stroke.standard,
    borderColor: colors.textSecondary },
  input: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing,
    paddingVertical: 0 } });
