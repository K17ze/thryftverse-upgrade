import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { createVerificationScreenStyles } from './verificationScreenStyles';

export interface KycIdentityStepProps {
  fullName: string;
  onFullNameChange: (v: string) => void;
  dob: string;
  onDobChange: (v: string) => void;
  addressLine: string;
  onAddressLineChange: (v: string) => void;
  city: string;
  onCityChange: (v: string) => void;
  postcode: string;
  onPostcodeChange: (v: string) => void;
  onContinue: () => void;
}

/** KYC step 1 — legal name, date of birth, and address fields. */
export function KycIdentityStep({
  fullName,
  onFullNameChange,
  dob,
  onDobChange,
  addressLine,
  onAddressLineChange,
  city,
  onCityChange,
  postcode,
  onPostcodeChange,
  onContinue }: KycIdentityStepProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVerificationScreenStyles(colors), [colors]);
  return (
    <>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Full legal name</Text>
      <TextInput
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
        value={fullName}
        onChangeText={onFullNameChange}
        placeholder="As shown on your ID"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        returnKeyType="next"
        blurOnSubmit={false}
      />
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Date of birth</Text>
      <TextInput
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
        value={dob}
        onChangeText={onDobChange}
        placeholder="DD/MM/YYYY"
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        returnKeyType="next"
        blurOnSubmit={false}
      />
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Address line</Text>
      <TextInput
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
        value={addressLine}
        onChangeText={onAddressLineChange}
        placeholder="Street address"
        placeholderTextColor={colors.textMuted}
        returnKeyType="next"
        blurOnSubmit={false}
      />
      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>City</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            value={city}
            onChangeText={onCityChange}
            placeholder="City"
            placeholderTextColor={colors.textMuted}
            returnKeyType="next"
            blurOnSubmit={false}
          />
        </View>
        <View style={styles.fieldHalf}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Postcode</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            value={postcode}
            onChangeText={onPostcodeChange}
            placeholder="Postcode"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            returnKeyType="done"
          />
        </View>
      </View>
      <AnimatedPressable
        style={styles.flowPrimaryBtn}
        onPress={onContinue}
        hapticFeedback="medium"
        accessibilityRole="button"
        accessibilityLabel="Continue to document upload"
      >
        <Text style={styles.flowPrimaryBtnText}>Continue to document</Text>
      </AnimatedPressable>
    </>
  );
}
