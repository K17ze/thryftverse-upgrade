/**
 * GroupMembersRoleBadge — compact role chip rendered beside a member name.
 * Extracted verbatim from GroupMembersScreen's `roleBadge` render helper.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Caption } from '../ui/Text';
import { createGroupMembersStyles } from './createGroupMembersStyles';
import type { GroupMemberRole } from './groupMembersViewModels';

export function GroupMembersRoleBadge({ role }: { role: GroupMemberRole }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupMembersStyles(colors), [colors]);
  const roleColors = {
    owner: { bg: colors.brandSubtle, text: colors.brand },
    admin: { bg: colors.surfaceAlt, text: colors.textPrimary },
    member: { bg: colors.surfaceAlt, text: colors.textMuted } };
  const labels = { owner: 'Owner', admin: 'Admin', member: 'Member' };
  return (
    <View style={[styles.roleBadge, { backgroundColor: roleColors[role].bg }]}>
      <Caption style={[styles.roleBadgeText, { color: roleColors[role].text }]}>{labels[role]}</Caption>
    </View>
  );
}
