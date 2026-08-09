import React, { forwardRef, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  ViewStyle,
  StyleProp,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type , Typography, Control, Stroke  } from '../../theme/designTokens';
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
    rightNode,
  },
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
    minHeight: Control.hit,
  },
  containerFocused: {
    borderWidth: Stroke.standard,
    borderColor: colors.textSecondary,
  },
  input: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    paddingVertical: 0,
  },
});
