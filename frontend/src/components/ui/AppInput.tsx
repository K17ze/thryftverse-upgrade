import React, { forwardRef, useId, useState } from 'react';
import {
  KeyboardTypeOptions,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';

export type AppInputAppearance = 'filled' | 'outline' | 'underline';
export type AppInputVariant = 'default' | 'section';

interface AppInputCustomProps {
  label?: string;
  helperText?: string;
  errorText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputContainerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  helperStyle?: StyleProp<TextStyle>;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  keyboardType?: KeyboardTypeOptions;
  /**
   * Visual appearance of the input boundary.
   * - filled: subtle background fill (default). Settings/utility.
   * - outline: 1px border, transparent background. Auth/standalone.
   * - underline: bottom border only. Dense authoring.
   */
  appearance?: AppInputAppearance;
  /**
   * Visual variant of the input.
   * - default: original AppInput behaviour (bordered filled, compact label).
   * - section: formerly PremiumTextField — borderless filled surface, focus-
   *   reactive label, larger tap target, section-level bottom margin.
   */
  variant?: AppInputVariant;
  /** Ionicons glyph name rendered on the left (section variant). */
  leftIcon?: keyof typeof Ionicons.glyphMap;
  /** Trailing React node (alias for `suffix`, section variant). */
  rightAction?: React.ReactNode;
  /** Override the input row min-height (section variant). */
  minHeight?: number;
}

type AppInputProps = Omit<TextInputProps, 'style'> & AppInputCustomProps & (
  | { label: string; placeholder?: string }
  | { label?: string; placeholder: string }
);

export const AppInput = forwardRef<TextInput, AppInputProps>(function AppInput(
  {
    label,
    helperText,
    errorText,
    containerStyle,
    inputContainerStyle,
    inputStyle,
    labelStyle,
    helperStyle,
    prefix,
    suffix,
    rightAction,
    leftIcon,
    minHeight,
    value,
    placeholder,
    placeholderTextColor,
    keyboardType,
    onChangeText,
    editable = true,
    multiline = false,
    onFocus,
    onBlur,
    appearance = 'filled',
    variant = 'default',
    accessibilityLabel: passedAccessibilityLabel,
    accessibilityLabelledBy: passedAccessibilityLabelledBy,
    ...rest
  },
  ref
) {
  const { colors } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(errorText);
  const labelId = useId();
  const trailingNode = suffix ?? rightAction;

  // ── Section variant (formerly PremiumTextField) ────────────────────
  if (variant === 'section') {
    const sectionBorderColor = hasError
      ? colors.danger
      : isFocused
        ? colors.brand
        : colors.border;

    const sectionAppearanceStyle = (() => {
      switch (appearance) {
        case 'outline':
          return {
            backgroundColor: 'transparent',
            borderWidth: Stroke.standard,
            borderRadius: Radius.lg };
        case 'underline':
          return {
            backgroundColor: 'transparent',
            borderWidth: 0,
            borderBottomWidth: isFocused ? Stroke.emphasis : Stroke.standard,
            borderRadius: Radius.none,
            paddingHorizontal: 0 };
        case 'filled':
        default:
          return {
            backgroundColor: colors.surfaceAlt,
            borderWidth: isFocused ? Stroke.standard : 0,
            borderRadius: Radius.lg };
      }
    })();

    const resolvedMinHeight = minHeight ?? (multiline ? 120 : 52);
    const leftIconColor = hasError ? colors.danger : isFocused ? colors.brand : colors.textMuted;

    return (
      <View style={[sectionStyles.container, containerStyle]}>
        {label ? (
          <Text
            style={[
              sectionStyles.label,
              { color: hasError ? colors.danger : isFocused ? colors.brand : colors.textSecondary },
              labelStyle,
            ]}
          >
            {label}
          </Text>
        ) : null}

        <View
          style={[
            sectionStyles.inputRow,
            sectionAppearanceStyle,
            { borderColor: sectionBorderColor, minHeight: resolvedMinHeight },
            !editable && sectionStyles.inputRowDisabled,
            inputContainerStyle,
          ]}
        >
          {leftIcon ? (
            <Ionicons name={leftIcon} size={18} color={leftIconColor} style={sectionStyles.leftIcon} />
          ) : null}

          {typeof prefix === 'string' ? <Text style={sectionStyles.prefixText}>{prefix}</Text> : null}
          {prefix && typeof prefix !== 'string' ? <View style={sectionStyles.prefixNode}>{prefix}</View> : null}

          <TextInput
            ref={ref}
            {...rest}
            value={value}
            editable={editable}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor ?? colors.textMuted}
            multiline={multiline}
            onFocus={(e) => { setIsFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setIsFocused(false); onBlur?.(e); }}
            style={[
              sectionStyles.input,
              multiline && sectionStyles.inputMultiline,
              { color: colors.textPrimary },
              inputStyle,
            ]}
          />

          {trailingNode ? <View style={sectionStyles.trailingNode}>{trailingNode}</View> : null}
        </View>

        {hasError ? (
          <Text style={[sectionStyles.errorText, { color: colors.danger }, helperStyle]}>{errorText}</Text>
        ) : helperText ? (
          <Text style={[sectionStyles.helperText, { color: colors.textMuted }, helperStyle]}>{helperText}</Text>
        ) : null}
      </View>
    );
  }

  // ── Default variant (original AppInput) ────────────────────────────
  const appearanceStyle = (() => {
    switch (appearance) {
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderWidth: Stroke.standard,
          borderRadius: Radius.lg };
      case 'underline':
        return {
          backgroundColor: 'transparent',
          borderWidth: 0,
          borderBottomWidth: Stroke.standard,
          borderRadius: Radius.none,
          paddingHorizontal: 0 };
      case 'filled':
      default:
        return {
          backgroundColor: colors.input,
          borderWidth: Stroke.standard,
          borderRadius: Radius.lg };
    }
  })();

  const appearanceBorderColor = hasError
    ? colors.danger
    : isFocused
      ? colors.brand
      : colors.border;

  return (
    <View style={containerStyle}>
      {label ? <Text nativeID={labelId} style={[styles.label, { color: colors.textSecondary }, labelStyle]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          appearanceStyle,
          { borderColor: appearanceBorderColor },
          !editable && styles.inputWrapDisabled,
          inputContainerStyle,
        ]}
      >
        {typeof prefix === 'string' ? <Text style={styles.prefixText}>{prefix}</Text> : null}
        {prefix && typeof prefix !== 'string' ? <View style={styles.prefixNode}>{prefix}</View> : null}
        <TextInput
          ref={ref}
          {...rest}
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor ?? colors.textMuted}
          multiline={multiline}
          style={[styles.input, { color: colors.textPrimary }, inputStyle]}
          accessibilityLabel={passedAccessibilityLabel ?? label ?? placeholder}
          accessibilityLabelledBy={label ? (passedAccessibilityLabelledBy ?? labelId) : passedAccessibilityLabelledBy}
          onFocus={(e) => { setIsFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setIsFocused(false); onBlur?.(e); }}
        />
        {trailingNode}
      </View>
      {errorText ? <Text style={[styles.errorText, { color: colors.danger }, helperStyle]}>{errorText}</Text> : null}
      {!errorText && helperText ? <Text style={[styles.helperText, { color: colors.textMuted }, helperStyle]}>{helperText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    marginBottom: 6,
    fontSize: TypographyV2.meta.size,
    lineHeight: 18,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0 },
  inputWrap: {
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 },
  inputWrapDisabled: {
    opacity: 0.6 },
  prefixText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  prefixNode: {
    alignItems: 'center',
    justifyContent: 'center' },
  input: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    paddingVertical: 10 },
  helperText: {
    marginTop: 7,
    fontSize: TypographyV2.meta.size,
    lineHeight: 16,
    fontFamily: TypographyV2.meta.fontFamily },
  errorText: {
    marginTop: 7,
    fontSize: TypographyV2.meta.size,
    lineHeight: 16,
    fontFamily: TypographyV2.meta.fontFamily } });

const sectionStyles = StyleSheet.create({
  container: {
    marginBottom: Space.md },
  label: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.sm,
    letterSpacing: 0.2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.sm },
  inputRowDisabled: {
    opacity: 0.55 },
  leftIcon: {
    marginRight: 2 },
  prefixText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  prefixNode: {
    alignItems: 'center',
    justifyContent: 'center' },
  input: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    paddingVertical: 14,
    textAlignVertical: 'center' },
  inputMultiline: {
    textAlignVertical: 'top',
    paddingTop: 14,
    paddingBottom: 14 },
  trailingNode: {
    marginLeft: 2 },
  helperText: {
    marginTop: Space.sm,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: 17 },
  errorText: {
    marginTop: Space.sm,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: 17 } });
