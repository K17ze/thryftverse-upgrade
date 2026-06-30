import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space } from '../../theme/designTokens';

type MediaStatus = 'idle' | 'uploading' | 'failed' | 'confirmed';

interface ProfileMediaEditorProps {
  label: string;
  status: MediaStatus;
  error?: string | null;
  onChange: () => void;
  onRetry: () => void;
  onRevert: () => void;
}

export function ProfileMediaEditor({
  label,
  status,
  error,
  onChange,
  onRetry,
  onRevert,
}: ProfileMediaEditorProps) {
  if (status === 'uploading') {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={Colors.brand} />
        <Text style={styles.statusText}>Uploading {label.toLowerCase()}…</Text>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={styles.failedContainer}>
        <View style={styles.failedRow}>
          <Ionicons name="warning-outline" size={14} color={Colors.danger} />
          <Text style={styles.errorText} numberOfLines={2}>
            {error || `${label} upload failed`}
          </Text>
        </View>
        <View style={styles.actionRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={`Retry ${label.toLowerCase()} upload`}
          >
            <Text style={styles.actionText}>Retry</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={onRevert}
            accessibilityRole="button"
            accessibilityLabel={`Revert ${label.toLowerCase()} to previous`}
          >
            <Text style={styles.actionText}>Revert</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.changeBtn}
        onPress={onChange}
        accessibilityRole="button"
        accessibilityLabel={`Change ${label.toLowerCase()}`}
      >
        <Ionicons name="image-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.changeText}>Change {label.toLowerCase()}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  changeText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  failedContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,77,77,0.04)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,77,77,0.12)',
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.danger,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
  },
  actionBtn: {
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
});
