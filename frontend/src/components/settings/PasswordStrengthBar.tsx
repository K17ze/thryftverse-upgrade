import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { Caption } from '../ui/Text';

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

interface PasswordStrengthBarProps {
  password: string;
}

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

function strengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return Colors.danger;
    case 'fair':
      return '#F59E0B';
    case 'good':
      return '#3B82F6';
    case 'strong':
      return Colors.success;
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

export function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  const strength = computeStrength(password);
  const color = strengthColor(strength);
  const segments = ['weak', 'fair', 'good', 'strong'] as PasswordStrength[];
  const activeIndex = segments.indexOf(strength);

  return (
    <View style={styles.container}>
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
      <Caption color={color} style={styles.label}>
        {strengthLabel(strength)}
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.xs,
  },
  bars: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.border,
  },
  label: {
    marginTop: Space.xs,
    textAlign: 'right',
  },
});
