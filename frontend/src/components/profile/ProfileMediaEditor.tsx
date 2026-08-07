import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Type } from '../../theme/designTokens';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  // Only render for active states — idle/confirmed is handled by the preview's camera buttons.
  // This eliminates duplicate "Change cover" / "Change avatar" text rows.
  if (status === 'uploading') {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={styles.statusText}>Uploading {label.toLowerCase()}…</Text>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={styles.failedContainer}>
        <View style={styles.failedRow}>
          <Ionicons name="warning-outline" size={14} color={colors.danger} />
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

  // idle / confirmed — no duplicate text row; preview camera buttons are the primary control.
  return null;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
  },
  statusText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  failedContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: 'rgba(255,77,77,0.04)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,77,77,0.12)',
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs + 2,
  },
  errorText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.danger,
    lineHeight: Type.caption.lineHeight,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.md + 2,
  },
  actionBtn: {
    paddingVertical: Space.xs,
  },
  actionText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
  });
}
