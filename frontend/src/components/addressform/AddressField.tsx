import React, { useMemo } from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { createAddressFormStyles } from './addressFormStyles';
import { FieldErrorRow } from './FieldErrorRow';

export interface AddressFieldProps {
  label: string;
  inputRef?: React.RefObject<TextInput | null>;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  error?: string;
  placeholder: string;
  accessibilityLabel: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  textContentType?: TextInputProps['textContentType'];
  autoComplete?: TextInputProps['autoComplete'];
  returnKeyType?: TextInputProps['returnKeyType'];
  /** Optional inline content rendered under the input — used for the
   *  postcode suggestion row. */
  children?: React.ReactNode;
}

/** Labelled text-input section with an optional inline error row. */
export function AddressField({
  label,
  inputRef,
  value,
  onChangeText,
  onBlur,
  onSubmitEditing,
  error,
  placeholder,
  accessibilityLabel,
  autoCapitalize,
  textContentType,
  autoComplete,
  returnKeyType,
  children,
}: AddressFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        autoCapitalize={autoCapitalize}
        textContentType={textContentType}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
      />
      {error ? <FieldErrorRow message={error} /> : null}
      {children}
    </View>
  );
}
