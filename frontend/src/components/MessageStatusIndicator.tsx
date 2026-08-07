import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Type } from '../theme/designTokens';
import { Caption } from './ui/Text';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

interface MessageStatusIndicatorProps {
  status: MessageStatus;
  timestamp?: string;
  size?: 'sm' | 'md';
}

export function MessageStatusIndicator({
  status,
  timestamp,
  size = 'sm',
}: MessageStatusIndicatorProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const iconSize = size === 'sm' ? 12 : 14;

  const renderIcon = () => {
    switch (status) {
      case 'sending':
        return (
          <View style={styles.sendingContainer}>
            <Ionicons
              name="time-outline"
              size={iconSize}
              color={colors.textMuted}
            />
          </View>
        );

      case 'sent':
        return (
          <Ionicons
            name="checkmark-outline"
            size={iconSize}
            color={colors.textMuted}
          />
        );

      case 'delivered':
        return (
          <Ionicons
            name="checkmark-done-outline"
            size={iconSize}
            color={colors.textMuted}
          />
        );

      case 'read':
        return (
          <Ionicons
            name="checkmark-done"
            size={iconSize}
            color={colors.brand}
          />
        );

      case 'failed':
        return (
          <Ionicons
            name="alert-circle-outline"
            size={iconSize}
            color={colors.danger}
          />
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {timestamp && (
        <Caption color={colors.textMuted} style={styles.timestamp}>
          {timestamp}
        </Caption>
      )}
      <View style={styles.iconContainer}>{renderIcon()}</View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    timestamp: {
      fontSize: Type.meta.size,
    },
    iconContainer: {
      width: 14,
      height: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendingContainer: {
      opacity: 0.7,
    },
  });
}
