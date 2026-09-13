/**
 * GroupMemberSelectRow — a selectable member row for the create-group
 * member picker. Used by the recents/suggested sections and the search
 * results list. Extracted verbatim from CreateGroupChatScreen.
 */

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import type { SelectableUser } from '../../utils/chatGroupHelpers';
import { createGroupChatStyles } from './createGroupChatStyles';

export interface GroupMemberSelectRowProps {
  user: SelectableUser;
  selected: boolean;
  onToggle: (user: SelectableUser) => void;
}

export function GroupMemberSelectRow({ user, selected, onToggle }: GroupMemberSelectRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupChatStyles(colors), [colors]);
  const displayName = user.displayName ?? user.username;
  return (
    <AnimatedPressable
      onPress={() => onToggle(user)}
      style={styles.memberRow}
      accessibilityRole="button"
      accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${user.displayName ?? '@' + user.username}`}
      accessibilityHint="Toggles this member for the new group"
      accessibilityState={{ selected }}
    >
      {user.avatar ? (
        <CachedImage uri={user.avatar} style={styles.memberAvatar} contentFit="cover" />
      ) : (
        <View style={styles.memberAvatarPlaceholder}>
          <Text style={styles.memberAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}

      <View style={styles.memberTextWrap}>
        <Text style={styles.memberDisplayName} numberOfLines={1}>{displayName}</Text>
        <Text style={styles.memberUsername} numberOfLines={1}>@{user.username}</Text>
      </View>

      <View style={[styles.checkCircle, selected && styles.checkCircleActive]}>
        {selected ? (
          <AppIcon name="check" size="sm" color="textInverse" accessible={false} />
        ) : (
          <AppIcon name="ellipse-outline" size={22} color="textMuted" accessible={false} />
        )}
      </View>
    </AnimatedPressable>
  );
}
