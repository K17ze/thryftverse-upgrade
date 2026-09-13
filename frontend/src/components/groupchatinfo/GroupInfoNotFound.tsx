/**
 * GroupInfoNotFound — empty state for the group details screen when the
 * conversation is missing or is not a group.
 */

import React from 'react';
import { View } from 'react-native';
import { FlagshipHeader, FlagshipScreen } from '../flagship';
import { Caption } from '../ui/Text';
import { useAppTheme } from '../../theme/ThemeContext';
import { styles } from './groupChatInfoStyles';

export function GroupInfoNotFound({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Group details" onBack={onBack} />}
      scrollEnabled={false}
    >
      <View style={styles.center}>
        <Caption color={colors.textMuted}>Group not found</Caption>
      </View>
    </FlagshipScreen>
  );
}
