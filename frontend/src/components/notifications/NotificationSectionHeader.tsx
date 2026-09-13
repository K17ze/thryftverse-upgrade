import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface NotificationSectionHeaderProps {
  sectionTitle: string;
  unreadCount: number;
  isAttention: boolean;
  itemCount: number;
}

/**
 * Section header row for the flattened notifications list — one instance per
 * group ("Needs attention" / "Today" / "Yesterday" / "Earlier"). The
 * attention variant leads with a danger glyph and a response hint; every
 * section carries a quiet unread-count badge when non-zero.
 */
function NotificationSectionHeaderBase({
  sectionTitle,
  unreadCount,
  isAttention,
  itemCount,
}: NotificationSectionHeaderProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.sectionHeaderRow, isAttention && styles.sectionHeaderRowAttention]}>
      {isAttention ? (
        <View style={styles.sectionAttentionLeading}>
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text style={[styles.sectionTitle, styles.sectionTitleAttention]}>{sectionTitle}</Text>
        </View>
      ) : (
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
      )}
      {isAttention && itemCount > 0 ? (
        <Text style={styles.sectionAttentionHint}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'} need{itemCount === 1 ? 's' : ''} your response
        </Text>
      ) : null}
      {unreadCount > 0 ? (
        <View style={[styles.sectionCountBadge, isAttention && styles.sectionCountBadgeAttention]}>
          <Text style={[styles.sectionCountText, isAttention && styles.sectionCountTextAttention]}>{unreadCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const NotificationSectionHeader = React.memo(NotificationSectionHeaderBase);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    marginTop: Space.sm + 4,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm },
  sectionHeaderRowAttention: {
    marginLeft: 0 },
  sectionAttentionLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  sectionAttentionHint: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginLeft: Space.xs },
  sectionTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.meta.letterSpacing },
  sectionTitleAttention: {
    color: colors.danger,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  sectionCountBadge: {
    minWidth: Space.md + 4,
    height: Space.md + 4,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center' },
  sectionCountBadgeAttention: {
    backgroundColor: colors.danger,
    borderColor: 'transparent' },
  sectionCountText: {
    fontSize: TypographyV2.meta.size - 2,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'] },
  sectionCountTextAttention: {
    color: colors.textInverse },
  });
}
