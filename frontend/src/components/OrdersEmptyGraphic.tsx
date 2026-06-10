import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ActiveTheme } from '../constants/colors';
import { Typography, Space, Radius } from '../theme/designTokens';

interface Props {
  title?: string;
  subtitle?: string;
}

export function OrdersEmptyGraphic({
  title = 'No orders yet',
  subtitle = 'When you buy or sell, your orders will appear here',
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconRing}>
        <Ionicons
          name="receipt-outline"
          size={28}
          color={ActiveTheme === 'light' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.25)'}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      ActiveTheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor:
      ActiveTheme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 15,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 240,
  },
});
