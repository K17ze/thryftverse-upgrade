/**
 * GroupMembersAddRow — the "Add members" entry row that opens the inline
 * add-members flow. Extracted verbatim from GroupMembersScreen.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { BodyEmphasis } from '../ui/Text';
import { useAppTheme } from '../../theme/ThemeContext';
import { createGroupMembersStyles } from './createGroupMembersStyles';

export interface GroupMembersAddRowProps {
  onPress: () => void;
}

export function GroupMembersAddRow({ onPress }: GroupMembersAddRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupMembersStyles(colors), [colors]);

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.7}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel="Add members"
      style={styles.addRow}
    >
      <View style={[styles.addAvatar, { backgroundColor: colors.brandSubtle }]}>
        <AppIcon name="follow" size="md" color="brand" accessible={false} />
      </View>
      <BodyEmphasis style={{ color: colors.brand }}>Add members</BodyEmphasis>
    </AnimatedPressable>
  );
}
