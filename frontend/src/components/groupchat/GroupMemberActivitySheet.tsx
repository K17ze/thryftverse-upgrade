/**
 * GroupMemberActivitySheet — member activity log for a group.
 *
 * Renders the real membership ledger: the group's creation date plus each
 * member's actual `joinedAt` timestamp from the members endpoint. No
 * fabricated "joined" rows — entries only exist where the backend has a
 * real timestamp.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { AppIcon } from '../common/AppIcon';
import { Caption } from '../ui/Text';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { fetchConversationMembersFromApi } from '../../services/chatApi';

function formatActivityDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface GroupMemberActivitySheetProps {
  visible: boolean;
  onDismiss: () => void;
  conversationId: string;
  /** Group creation timestamp for the founding ledger entry. */
  createdAt?: string | null;
  /** Resolves a member id to a display handle (e.g. '@username'). */
  memberLabel: (userId: string) => string;
  memberRole?: (userId: string) => string | undefined;
  title: string;
  subtitle?: string;
}

export function GroupMemberActivitySheet({
  visible,
  onDismiss,
  conversationId,
  createdAt,
  memberLabel,
  memberRole,
  title,
  subtitle,
}: GroupMemberActivitySheetProps) {
  const { colors } = useAppTheme();
  const [members, setMembers] = useState<Array<{ userId: string; role: string; joinedAt: string }>>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setState('loading');
    fetchConversationMembersFromApi(conversationId)
      .then((items) => {
        if (!active) return;
        setMembers(items);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [visible, conversationId]);

  const ordered = useMemo(
    () =>
      [...members].sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      ),
    [members],
  );

  const createdLabel = formatActivityDate(createdAt);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} variant="system">
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}

        <View style={styles.timeline}>
          <View style={styles.item}>
            <AppIcon name="plus" variant="filled" size={18} color="brand" accessible={false} />
            <View style={styles.textCol}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>Group created</Text>
              {createdLabel ? <Caption color={colors.textMuted}>{createdLabel}</Caption> : null}
            </View>
          </View>

          {state === 'loading' ? (
            <View style={styles.stateRow} accessibilityLabel="Loading member activity">
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : state === 'error' ? (
            <Pressable
              onPress={() => {
                setState('loading');
                fetchConversationMembersFromApi(conversationId)
                  .then((items) => {
                    setMembers(items);
                    setState('ready');
                  })
                  .catch(() => setState('error'));
              }}
              style={styles.stateRow}
              accessibilityRole="button"
              accessibilityLabel="Retry loading member activity"
            >
              <Caption color={colors.textMuted}>Could not load activity. Tap to retry.</Caption>
            </Pressable>
          ) : (
            ordered.map((m) => {
              const role = memberRole?.(m.userId) ?? (m.role !== 'member' ? m.role : undefined);
              const joinedLabel = formatActivityDate(m.joinedAt);
              return (
                <View key={m.userId} style={styles.item}>
                  <AppIcon name="profile" variant="filled" size={18} color="textSecondary" accessible={false} />
                  <View style={styles.textCol}>
                    <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>
                      {memberLabel(m.userId)} joined{role ? ` (${role})` : ''}
                    </Text>
                    {joinedLabel ? <Caption color={colors.textMuted}>{joinedLabel}</Caption> : null}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    marginBottom: Space.xs,
  },
  timeline: {
    gap: Space.sm,
    paddingTop: Space.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
  stateRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
