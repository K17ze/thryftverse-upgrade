import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

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
  const iconSize = size === 'sm' ? 12 : 14;

  const renderIcon = () => {
    switch (status) {
      case 'sending':
        return (
          <View style={styles.sendingContainer}>
            <Ionicons
              name="time-outline"
              size={iconSize}
              color={Colors.textMuted}
            />
          </View>
        );

      case 'sent':
        return (
          <Ionicons
            name="checkmark-outline"
            size={iconSize}
            color={Colors.textMuted}
          />
        );

      case 'delivered':
        return (
          <Ionicons
            name="checkmark-done-outline"
            size={iconSize}
            color={Colors.textMuted}
          />
        );

      case 'read':
        return (
          <Ionicons
            name="checkmark-done"
            size={iconSize}
            color={Colors.brand}
          />
        );

      case 'failed':
        return (
          <Ionicons
            name="alert-circle-outline"
            size={iconSize}
            color={Colors.danger}
          />
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {timestamp && (
        <Text style={styles.timestamp}>{timestamp}</Text>
      )}
      <View style={styles.iconContainer}>{renderIcon()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '400',
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
