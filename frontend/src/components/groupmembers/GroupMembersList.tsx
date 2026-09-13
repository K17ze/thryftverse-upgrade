/**
 * GroupMembersList — the member directory: hairline-divided member rows or
 * the empty-search state. Extracted verbatim from GroupMembersScreen.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { Caption } from '../ui/Text';
import { useAppTheme } from '../../theme/ThemeContext';
import { createGroupMembersStyles } from './createGroupMembersStyles';
import { GroupMembersRow } from './GroupMembersRow';
import type { GroupMemberView } from './groupMembersViewModels';

export interface GroupMembersListProps {
  members: GroupMemberView[];
  canManage: boolean;
  removingId: string | null;
  isLeaving: boolean;
  onMemberPress: (member: GroupMemberView) => void;
  onMemberLongPress: (member: GroupMemberView) => void;
  onLeaveGroup: () => void;
  onRemoveMember: (memberId: string, memberName: string) => void;
}

export function GroupMembersList({
  members,
  canManage,
  removingId,
  isLeaving,
  onMemberPress,
  onMemberLongPress,
  onLeaveGroup,
  onRemoveMember,
}: GroupMembersListProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupMembersStyles(colors), [colors]);

  if (members.length === 0) {
    return (
      <View style={styles.emptyWrapV2}>
        <AppIcon name="people" size="hero" color="textMuted" accessible={false} />
        <Caption color={colors.textMuted} style={styles.emptyTextV2}>No members match your search.</Caption>
      </View>
    );
  }

  return (
    <View style={styles.memberList}>
      {members.map((member, index) => {
        const canRemove = canManage && !member.isMe && member.role !== 'owner';
        const isRemovingThis = removingId === member.id;
        return (
          <View key={member.id}>
            <GroupMembersRow
              member={member}
              canRemove={canRemove}
              isRemoving={isRemovingThis}
              isLeaving={isLeaving}
              onPress={() => onMemberPress(member)}
              onLongPress={() => onMemberLongPress(member)}
              onLeaveGroup={onLeaveGroup}
              onRemove={() => onRemoveMember(member.id, member.name)}
            />
            {index < members.length - 1 && (
              <View style={styles.memberDivider} />
            )}
          </View>
        );
      })}
    </View>
  );
}
