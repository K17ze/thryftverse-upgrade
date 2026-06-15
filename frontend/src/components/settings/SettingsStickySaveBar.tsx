import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space } from '../../theme/designTokens';
import { AppButton } from '../ui/AppButton';

interface SettingsStickySaveBarProps {
  label: string;
  loadingLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function SettingsStickySaveBar({
  label,
  loadingLabel = 'Saving...',
  onPress,
  disabled = false,
  loading = false,
}: SettingsStickySaveBarProps) {
  return (
    <View style={styles.bar}>
      <AppButton
        title={loading ? loadingLabel : label}
        onPress={onPress}
        disabled={disabled || loading}
        loading={loading}
        variant="primary"
        size="lg"
        style={{ width: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md + 8,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
