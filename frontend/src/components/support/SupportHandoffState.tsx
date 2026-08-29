import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ConversationOwnershipState } from '../../contracts/support';

export interface SupportHandoffStateProps {
  ownershipState: ConversationOwnershipState;
  /** Optional queue team name, surfaced only when the backend provides it. */
  queueTeam?: string | null;
}

/**
 * SupportHandoffState — compact, inline indicator for human handoff states.
 *
 * Renders only for `human_queued` and `human_active`. No fake ETA is shown
 * unless the backend supplies real queue data. No modal, no decorative
 * chrome — a single flat row with a hairline top border.
 *
 * - `human_queued`: "A support specialist is reviewing this" (+ team if known)
 * - `human_active`: "A support specialist is here"
 */
export function SupportHandoffState({
  ownershipState,
  queueTeam }: SupportHandoffStateProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (ownershipState !== 'human_queued' && ownershipState !== 'human_active') {
    return null;
  }

  const isActive = ownershipState === 'human_active';
  const iconName: keyof typeof Ionicons.glyphMap = isActive
    ? 'person-circle'
    : 'person-circle-outline';
  const accent = isActive ? colors.brand : colors.textSecondary;

  const message = isActive
    ? 'A support specialist is here'
    : 'A support specialist is reviewing this';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Ionicons name={iconName} size={Control.iconCompact} color={accent} />
        <Text style={[styles.message, { color: colors.textPrimary }]} numberOfLines={2}>
          {message}
          {queueTeam ? ` · ${queueTeam}` : ''}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minHeight: Control.hit },
    message: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight } });
}
