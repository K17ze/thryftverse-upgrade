import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

interface PasswordStrengthBarProps {
  password: string;
  /** Show the per-requirement checklist below the bar */
  showChecklist?: boolean;
}

interface Requirement {
  label: string;
  test: (pw: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'Special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function computeStrength(password: string): PasswordStrength {
  if (!password || password.length < 6) return 'weak';
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 1) return 'weak';
  if (score === 2) return 'fair';
  if (score === 3) return 'good';
  return 'strong';
}

function strengthColor(strength: PasswordStrength, colors: ThemeColors): string {
  switch (strength) {
    case 'weak':
      return colors.danger;
    case 'fair':
      return colors.bronze;
    case 'good':
      return colors.success;
    case 'strong':
      return colors.success;
  }
}

function strengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'Weak';
    case 'fair':
      return 'Fair';
    case 'good':
      return 'Good';
    case 'strong':
      return 'Strong';
  }
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginTop: Space.sm,
      gap: Space.xs },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    bars: {
      flexDirection: 'row',
      gap: Space.xs,
      flex: 1 },
    segment: {
      flex: 1,
      height: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.border },
    label: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0.2,
      minWidth: 50,
      textAlign: 'right' },
    checklist: {
      gap: Space.xs + 2,
      marginTop: Space.xs },
    checklistItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2 },
    checklistIcon: {
      width: 18,
      height: 18,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    checklistText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0.1 } });

export function PasswordStrengthBar({ password, showChecklist = true }: PasswordStrengthBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const strength = computeStrength(password);
  const color = strengthColor(strength, colors);
  const segments = ['weak', 'fair', 'good', 'strong'] as PasswordStrength[];
  const activeIndex = segments.indexOf(strength);

  return (
    <View style={styles.container}>
      {/* Strength bar + label */}
      <View style={styles.barRow}>
        <View style={styles.bars}>
          {segments.map((seg, idx) => (
            <View
              key={seg}
              style={[
                styles.segment,
                idx <= activeIndex && { backgroundColor: color },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.label, { color }]}>
          {strengthLabel(strength)}
        </Text>
      </View>

      {/* Requirement checklist */}
      {showChecklist && (
        <View style={styles.checklist}>
          {REQUIREMENTS.map((req) => {
            const met = req.test(password);
            return (
              <View key={req.label} style={styles.checklistItem}>
                <View
                  style={[
                    styles.checklistIcon,
                    { backgroundColor: met ? colors.successSubtle : colors.surfaceAlt },
                  ]}
                >
                  <Ionicons
                    name={met ? 'checkmark' : 'close'}
                    size={12}
                    color={met ? colors.success : colors.textMuted}
                  />
                </View>
                <Text
                  style={[
                    styles.checklistText,
                    { color: met ? colors.textPrimary : colors.textMuted },
                  ]}
                >
                  {req.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
