/**
 * GroupMemberRow — a member directory row for group surfaces.
 *
 * Avatar + name/handle + optional role badge + disclosure chevron, on a
 * flat canvas with an inset hairline. Pressing the row opens the member
 * actions sheet — every row is a single pressable target so the entire
 * height is a 44pt+ hit area.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily, Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type GroupMemberRole = 'owner' | 'admin' | 'member';

export interface GroupMemberRowProps {
  name: string;
  handle: string;
  avatarUrl?: string | null;
  role?: GroupMemberRole;
  /** Appends a "You" marker after the name for the current user. */
  isYou?: boolean;
  isLast?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

const ROLE_BADGE: Record<Exclude<GroupMemberRole, 'member'>, string> = {
  owner: 'Owner',
  admin: 'Admin',
};

export function GroupMemberRow({
  name,
  handle,
  avatarUrl,
  role,
  isYou = false,
  isLast = false,
  disabled = false,
  onPress,
}: GroupMemberRowProps) {
  const { colors } = useAppTheme();
  const badgeLabel = role && role !== 'member' ? ROLE_BADGE[role] : null;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={styles.row}
      activeOpacity={0.72}
      scaleValue={0.99}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${isYou ? `${name}, you` : name}${badgeLabel ? `, ${badgeLabel}` : ''}`}
    >
      <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
        {avatarUrl ? (
          <CachedImage uri={avatarUrl} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={[styles.avatarInitials, { color: colors.textPrimary }]}>
            {name.slice(0, 2).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {isYou ? (
            <Text style={[styles.youLabel, { color: colors.textMuted }]}>(You)</Text>
          ) : null}
          {badgeLabel ? (
            <View
              style={[styles.roleBadge, { borderColor: colors.brand }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={[styles.roleBadgeText, { color: colors.brand }]}>{badgeLabel}</Text>
            </View>
          ) : null}
        </View>
        {handle ? (
          <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
            {handle}
          </Text>
        ) : null}
      </View>

      <AppIcon
        name="chevron-forward"
        size="sm"
        color="textMuted"
        accessible={false}
        style={styles.chevron}
      />

      {!isLast ? (
        <View
          style={[styles.divider, { backgroundColor: colors.borderSubtle }]}
          pointerEvents="none"
        />
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 56,
    gap: Space.smMd,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold,
  },
  copy: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  name: {
    flexShrink: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  youLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
  roleBadge: {
    borderWidth: Stroke.standard,
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  roleBadgeText: {
    fontSize: 10,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  handle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    marginTop: 1,
  },
  chevron: {
    marginLeft: Space.xs,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: Space.md + 40 + Space.smMd,
    right: 0,
    height: Stroke.hairline,
  },
});
