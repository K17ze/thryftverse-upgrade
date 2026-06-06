import React, { forwardRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  ViewStyle,
  StyleProp,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type , Typography  } from '../../theme/designTokens';
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
  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
      <TextInput
        ref={ref}
        {...inputProps}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={placeholder}
        accessibilityRole="search"
      />
      {value.length > 0 ? (
        <AnimatedPressable
          onPress={handleClear}
          hapticFeedback="light"
          accessibilityLabel="Clear search"
          accessibilityRole="button"
        >
          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
        </AnimatedPressable>
      ) : rightNode ? (
        rightNode
      ) : null}
    </View>
  );
})

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: Space.sm + Space.xs,
    paddingVertical: Space.sm,
    gap: Space.xs + Space.xs,
  },
  input: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    paddingVertical: 0,
  },
});
