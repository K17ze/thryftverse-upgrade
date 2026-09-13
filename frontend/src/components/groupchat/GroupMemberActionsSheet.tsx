/**
 * GroupMemberActionsSheet — member inspection sheet for the group details
 * screen. Presentation only: the screen owns the role mutations and passes
 * resolved labels so copy stays where the group's authority rules live.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { IoniconsGlyphName, SemanticIconName } from '../../theme/iconTokens';

export interface GroupMemberActionsTarget {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
  role?: 'owner' | 'admin' | 'member';
}

interface SheetActionProps {
  icon: SemanticIconName | IoniconsGlyphName;
  label: string;
  color?: string;
  onPress: () => void;
  accessibilityLabel: string;
}

function SheetAction({ icon, label, color, onPress, accessibilityLabel }: SheetActionProps) {
  const { colors } = useAppTheme();
  const resolved = color ?? colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      style={styles.actionRow}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <AppIcon name={icon} size="md" color={resolved} accessible={false} />
      <Text style={[styles.actionText, { color: resolved }]}>{label}</Text>
    </Pressable>
  );
}

export interface GroupMemberActionsSheetProps {
  member: GroupMemberActionsTarget | null;
  onDismiss: () => void;
  /** True when the current user can manage members (owner/admin). */
  canManageMembers: boolean;
  /** True when the sheet target is the current user. */
  isSelf: boolean;
  /** Label for the role action — e.g. 'Make group admin' / 'Dismiss as admin'. */
  adminActionLabel: string;
  /** Label for the destructive removal action — e.g. 'Remove from group'. */
  removeLabel: string;
  messageLabel: string;
  onViewProfile: (userId: string) => void;
  onMessage: (member: GroupMemberActionsTarget) => void;
  onToggleAdmin: (member: GroupMemberActionsTarget) => void;
  onRemove: (member: GroupMemberActionsTarget) => void;
}

export function GroupMemberActionsSheet({
  member,
  onDismiss,
  canManageMembers,
  isSelf,
  adminActionLabel,
  removeLabel,
  messageLabel,
  onViewProfile,
  onMessage,
  onToggleAdmin,
  onRemove,
}: GroupMemberActionsSheetProps) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet visible={member !== null} onDismiss={onDismiss} variant="system">
      {member && (
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
              {member.avatar ? (
                <CachedImage uri={member.avatar} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={[styles.avatarInitials, { color: colors.textPrimary }]}>
                  {(member.displayName ?? member.username).slice(0, 2).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {member.displayName ?? member.username}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>@{member.username}</Text>
            </View>
          </View>

          <View>
            <SheetAction
              icon="profile"
              label="View profile"
              onPress={() => onViewProfile(member.id)}
              accessibilityLabel="View profile"
            />
            <SheetAction
              icon="chat"
              label={messageLabel}
              onPress={() => onMessage(member)}
              accessibilityLabel={messageLabel}
            />
            {canManageMembers && !isSelf ? (
              <>
                <SheetAction
                  icon="shield"
                  label={adminActionLabel}
                  color={colors.brand}
                  onPress={() => onToggleAdmin(member)}
                  accessibilityLabel={adminActionLabel}
                />
                <SheetAction
                  icon="person-remove-outline"
                  label={removeLabel}
                  color={colors.danger}
                  onPress={() => onRemove(member)}
                  accessibilityLabel={removeLabel}
                />
              </>
            ) : null}
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 48,
    paddingVertical: Space.xs,
  },
  actionText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
});
