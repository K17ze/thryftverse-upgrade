/**
 * GroupMembersRow — a single member row: avatar + name + role badge +
 * chevron, with a trailing Leave / Remove action. Extracted verbatim from
 * GroupMembersScreen's member list rendering.
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { CachedImage } from '../CachedImage';
import { BodyEmphasis, Caption } from '../ui/Text';
import { useAppTheme } from '../../theme/ThemeContext';
import { createGroupMembersStyles } from './createGroupMembersStyles';
import { GroupMembersRoleBadge } from './GroupMembersRoleBadge';
import type { GroupMemberView } from './groupMembersViewModels';

export interface GroupMembersRowProps {
  member: GroupMemberView;
  canRemove: boolean;
  isRemoving: boolean;
  isLeaving: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onLeaveGroup: () => void;
  onRemove: () => void;
}

export function GroupMembersRow({
  member,
  canRemove,
  isRemoving,
  isLeaving,
  onPress,
  onLongPress,
  onLeaveGroup,
  onRemove,
}: GroupMembersRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupMembersStyles(colors), [colors]);

  return (
    <View style={styles.memberRowV2}>
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        activeOpacity={0.85}
        scaleValue={0.98}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={`View ${member.name} profile`}
        accessibilityHint="Long-press for admin actions"
        style={styles.memberRowContent}
      >
        <View style={[styles.memberAvatarV2, { backgroundColor: colors.surfaceAlt }]}>
          {member.avatar ? (
            <CachedImage uri={member.avatar} style={styles.memberAvatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.memberAvatarTextV2}>
              {member.name.slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.memberTextV2}>
          <View style={styles.nameRowV2}>
            <BodyEmphasis>{member.name}</BodyEmphasis>
            <GroupMembersRoleBadge role={member.role} />
          </View>
          {member.role === 'owner' && (
            <Caption color={colors.textMuted}>{member.isMe ? 'You · Group creator' : 'Group creator'}</Caption>
          )}
        </View>
        <AppIcon name="forward" size="md" color="textMuted" accessible={false} />
      </AnimatedPressable>

      {member.isMe ? (
        <AnimatedPressable
          onPress={onLeaveGroup}
          disabled={isLeaving}
          hitSlop={8}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="Leave group"
        >
          {isLeaving ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Text style={styles.leaveText}>Leave</Text>
          )}
        </AnimatedPressable>
      ) : canRemove ? (
        <AnimatedPressable
          onPress={onRemove}
          disabled={isRemoving}
          hitSlop={8}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${member.name}`}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Text style={styles.removeText}>Remove</Text>
          )}
        </AnimatedPressable>
      ) : null}
    </View>
  );
}
