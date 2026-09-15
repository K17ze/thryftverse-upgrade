/**
 * EditGroupStates — the gate states for the edit-group screen: missing or
 * non-group conversation, the permission check in flight, and the
 * restricted state for members when group-info editing is admin-limited.
 * Presentation only; extracted verbatim from EditGroupScreen.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { FlagshipHeader, FlagshipScreen } from '../flagship';
import { Caption } from '../ui/Text';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';

export function EditGroupNotFound({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Edit group" onBack={onBack} />}
      scrollEnabled={false}
    >
      <View style={styles.center}>
        <Caption color={colors.textMuted}>Group not found</Caption>
      </View>
    </FlagshipScreen>
  );
}

export function EditGroupChecking({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Edit group" onBack={onBack} />}
      scrollEnabled={false}
    >
      <View style={styles.center} accessibilityLabel="Checking group permissions">
        <ActivityIndicator color={colors.textPrimary} />
      </View>
    </FlagshipScreen>
  );
}

export function EditGroupRestricted({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Group identity" onBack={onBack} />}
      scrollEnabled={false}
    >
      <View style={styles.center}>
        <AppIcon name="lock" size="lg" color="textMuted" accessible={false} />
        <Caption color={colors.textMuted} style={styles.permissionCopy}>
          An owner or admin has limited group-info editing to admins.
        </Caption>
      </View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  permissionCopy: {
    textAlign: 'center',
    maxWidth: 280,
  },
});
