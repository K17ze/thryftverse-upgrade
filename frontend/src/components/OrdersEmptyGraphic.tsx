import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Space, Radius, Type, Stroke} from '../theme/designTokens';

interface Props {
  title?: string;
  subtitle?: string;
}

export function OrdersEmptyGraphic({
  title = 'No orders yet',
  subtitle = 'When you buy or sell, your orders will appear here',
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconRing}>
        <Ionicons
          name="receipt-outline"
          size={28}
          color={colors.textMuted}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    iconRing: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyStrong.size,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 240,
    },
  });
}