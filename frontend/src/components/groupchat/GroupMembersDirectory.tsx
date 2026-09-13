/**
 * GroupMembersDirectory — the members section of the group details screen.
 *
 * Owns its local UI state (search open/query/focus) and composes the
 * add/invite actions, the active invite-link band, the member rows, the
 * "see all" overflow row and the member-activity entry point. Flat canvas:
 * structure comes from inset hairlines and the section header, not cards.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { Caption } from '../ui/Text';
import { useAppTheme } from '../../theme/ThemeContext';
import { Control, FontFamily, Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { GroupInfoRow } from './GroupInfoRow';
import { GroupMemberRow, type GroupMemberRole } from './GroupMemberRow';

export interface GroupDirectoryMember {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
}

export interface GroupInviteSummary {
  url: string;
  /** Truthful meta line — e.g. "Expires 12 May · 3 uses". */
  metaLabel: string;
}

export interface GroupMembersDirectoryProps {
  memberCount: number;
  members: GroupDirectoryMember[];
  memberRoles?: Record<string, GroupMemberRole>;
  currentUserId?: string;
  canAddMembers: boolean;
  /** Active (unexpired, unrevoked) invite link, if any. */
  inviteSummary: GroupInviteSummary | null;
  inviteBusy?: boolean;
  onAddMembers: () => void;
  /** Copies the active link or generates a new one when none exists. */
  onInvitePrimary: () => void;
  onCopyInvite: () => void;
  onShareInvite: () => void;
  onRevokeInvite: () => void;
  onMemberPress: (member: GroupDirectoryMember & { role?: GroupMemberRole }) => void;
  onSeeAll: () => void;
  onViewActivity: () => void;
}

const COLLAPSED_MEMBER_LIMIT = 5;

export function GroupMembersDirectory({
  memberCount,
  members,
  memberRoles,
  currentUserId,
  canAddMembers,
  inviteSummary,
  inviteBusy = false,
  onAddMembers,
  onInvitePrimary,
  onCopyInvite,
  onShareInvite,
  onRevokeInvite,
  onMemberPress,
  onSeeAll,
  onViewActivity,
}: GroupMembersDirectoryProps) {
  const { colors } = useAppTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q),
    );
  }, [members, searchQuery]);

  const displayedMembers = isSearchOpen
    ? filteredMembers
    : filteredMembers.slice(0, COLLAPSED_MEMBER_LIMIT);

  const showSeeAll = memberCount > COLLAPSED_MEMBER_LIMIT && !isSearchOpen;
  const tailRowCount = (showSeeAll ? 1 : 0) + 1; // see-all + activity rows
  const lastMemberIndex = displayedMembers.length - 1;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, { color: colors.textMuted }]}>
          {memberCount} member{memberCount === 1 ? '' : 's'}
        </Text>
        <AnimatedPressable
          onPress={() => {
            setIsSearchOpen((prev) => {
              if (prev) setSearchQuery('');
              return !prev;
            });
          }}
          style={styles.searchToggle}
          hitSlop={8}
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={isSearchOpen ? 'Close member search' : 'Search members'}
        >
          <AppIcon
            name={isSearchOpen ? 'close' : 'search'}
            size="sm"
            color="brand"
            accessible={false}
          />
        </AnimatedPressable>
      </View>

      {isSearchOpen ? (
        <View
          style={[
            styles.searchField,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: isSearchFocused ? colors.brand : colors.border,
            },
          ]}
        >
          <AppIcon name="search" size="xs" color="textMuted" accessible={false} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search member name or @handle..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            autoFocus
            autoCapitalize="none"
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            accessibilityLabel="Search members"
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear member search"
            >
              <AppIcon name="close-circle-outline" size="xs" color="textMuted" accessible={false} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {canAddMembers && !isSearchOpen ? (
        <>
          <GroupInfoRow
            icon="person-add-outline"
            iconColor={colors.brand}
            label="Add members"
            labelColor={colors.brand}
            onPress={onAddMembers}
          />
          <GroupInfoRow
            icon="link"
            iconColor={colors.brand}
            label="Invite to group via link"
            labelColor={colors.brand}
            busy={inviteBusy}
            onPress={onInvitePrimary}
          />
        </>
      ) : null}

      {inviteSummary && !isSearchOpen ? (
        <View
          style={[
            styles.inviteBand,
            {
              backgroundColor: colors.surfaceAlt,
              borderTopColor: colors.borderSubtle,
              borderBottomColor: colors.borderSubtle,
            },
          ]}
        >
          <View style={styles.inviteTextCol}>
            <Text style={[styles.inviteLink, { color: colors.textPrimary }]} numberOfLines={1}>
              {inviteSummary.url}
            </Text>
            <Caption color={colors.textMuted}>{inviteSummary.metaLabel}</Caption>
          </View>
          <View style={styles.inviteActions}>
            <AnimatedPressable
              onPress={onCopyInvite}
              style={styles.inviteBtn}
              hitSlop={4}
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Copy invite link"
            >
              <AppIcon name="copy-outline" size="sm" color="brand" accessible={false} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={onShareInvite}
              style={styles.inviteBtn}
              hitSlop={4}
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Share invite link"
            >
              <AppIcon name="share" size="sm" color="brand" accessible={false} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={onRevokeInvite}
              style={styles.inviteBtn}
              hitSlop={4}
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Revoke invite link"
            >
              <AppIcon name="trash" size="sm" color="danger" accessible={false} />
            </AnimatedPressable>
          </View>
        </View>
      ) : null}

      {displayedMembers.length === 0 ? (
        <View style={styles.emptyRow}>
          <Caption color={colors.textMuted}>No members match your search</Caption>
        </View>
      ) : (
        displayedMembers.map((member, index) => {
          const role = memberRoles?.[member.id];
          const isYou = member.id === currentUserId;
          // The member list is followed by see-all / activity rows, so the
          // last visible member keeps its divider unless nothing follows.
          const isLast = index === lastMemberIndex && tailRowCount === 0;
          return (
            <GroupMemberRow
              key={member.id}
              name={isYou ? 'You' : member.displayName ?? member.username}
              handle={`@${member.username}`}
              avatarUrl={member.avatar}
              role={role}
              isLast={isLast}
              onPress={() => onMemberPress({ ...member, role })}
            />
          );
        })
      )}

      {showSeeAll ? (
        <GroupInfoRow
          icon="more"
          label={`See all (${memberCount} members)`}
          onPress={onSeeAll}
        />
      ) : null}

      <GroupInfoRow
        icon="list-outline"
        label="View member changes"
        onPress={onViewActivity}
        isLast
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
  },
  headerLabel: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  searchToggle: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Space.sm,
    marginTop: -Space.xs,
    marginBottom: -Space.xs,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    paddingHorizontal: Space.sm,
    height: 36,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: Space.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    paddingVertical: 0,
  },
  inviteBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    borderTopWidth: Stroke.hairline,
    borderBottomWidth: Stroke.hairline,
  },
  inviteTextCol: {
    flex: 1,
    marginRight: Space.sm,
    gap: 2,
    paddingVertical: Space.sm,
  },
  inviteLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
  inviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRow: {
    paddingVertical: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
