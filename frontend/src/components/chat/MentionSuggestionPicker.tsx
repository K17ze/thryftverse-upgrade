/**
 * MentionSuggestionPicker — shows a list of group members that match
 * the @mention being typed. Appears above the composer bar.
 *
 * Includes an "@all" option at the top (admin-gated on the backend).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface MentionCandidate {
  id: string;
  displayName: string;
  username?: string;
  avatarUri?: string;
  role?: string;
}

interface MentionSuggestionPickerProps {
  visible: boolean;
  query: string;
  candidates: MentionCandidate[];
  /** Whether the current user can use @all (admin/owner only). */
  canMentionAll: boolean;
  memberCount: number;
  onSelect: (candidate: MentionCandidate | { id: 'all'; displayName: string }) => void;
}

export function MentionSuggestionPicker({
  visible,
  query,
  candidates,
  canMentionAll,
  memberCount,
  onSelect,
}: MentionSuggestionPickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const filtered = useMemo(() => {
    if (!query) return candidates;
    const q = query.toLowerCase();
    return candidates.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const showAll = canMentionAll && (!query || 'all'.startsWith(query.toLowerCase()));

  if (!visible) return null;

  const items: Array<{ key: string; isAll: boolean; candidate?: MentionCandidate }> = [];
  if (showAll) {
    items.push({ key: 'all', isAll: true });
  }
  for (const c of filtered) {
    items.push({ key: c.id, isAll: false, candidate: c });
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.isAll) {
            return (
              <Pressable
                style={styles.row}
                onPress={() => onSelect({ id: 'all', displayName: 'all' })}
                accessibilityRole="button"
                accessibilityLabel={`Mention everyone (${memberCount} members)`}
              >
                <View style={[styles.avatar, styles.allAvatar]}>
                  <Ionicons name="people" size={16} color={colors.textInverse} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.name}>Everyone</Text>
                  <Text style={styles.subtitle}>Notify all {memberCount} members</Text>
                </View>
              </Pressable>
            );
          }
          const c = item.candidate!;
          return (
            <Pressable
              style={styles.row}
              onPress={() => onSelect(c)}
              accessibilityRole="button"
              accessibilityLabel={`Mention ${c.displayName}`}
            >
              <View style={[styles.avatar, { backgroundColor: colors.brandSubtle }]}>
                <Text style={styles.avatarText}>
                  {c.displayName.substring(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.textWrap}>
                <Text style={styles.name}>{c.displayName}</Text>
                {c.username ? (
                  <Text style={styles.subtitle}>@{c.username}</Text>
                ) : null}
              </View>
              {c.role ? (
                <View style={[styles.roleBadge, { backgroundColor: colors.brandSubtle }]}>
                  <Text style={styles.roleText}>{c.role}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      maxHeight: 220,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    allAvatar: {
      backgroundColor: colors.brand,
    },
    avatarText: {
      fontSize: 12,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary,
    },
    textWrap: {
      flex: 1,
    },
    name: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginTop: 1,
    },
    roleBadge: {
      paddingHorizontal: Space.sm,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    roleText: {
      fontSize: 11,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textTransform: 'capitalize',
    },
  });
}
