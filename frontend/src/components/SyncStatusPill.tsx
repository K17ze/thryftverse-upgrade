import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Radius, Space, Stroke} from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

export type SyncStatusTone = 'live' | 'syncing' | 'offline';

interface SyncStatusPillProps {
  tone: SyncStatusTone;
  label: string;
  compact?: boolean;
}

function resolveToneStyles(tone: SyncStatusTone, colors: ThemeColors) {
  switch (tone) {
    case 'live':
      return {
        icon: 'checkmark-circle' as keyof typeof Ionicons.glyphMap,
        background: colors.successSubtle,
        border: colors.borderSubtle,
        iconColor: colors.success,
        textColor: colors.success };
    case 'syncing':
      return {
        icon: 'sync-outline' as keyof typeof Ionicons.glyphMap,
        background: colors.warningSubtle,
        border: colors.borderSubtle,
        iconColor: colors.warning,
        textColor: colors.warning };
    case 'offline':
    default:
      return {
        icon: 'cloud-offline-outline' as keyof typeof Ionicons.glyphMap,
        background: colors.dangerSubtle,
        border: colors.borderSubtle,
        iconColor: colors.danger,
        textColor: colors.danger };
  }
}

export function SyncStatusPill({ tone, label, compact = false }: SyncStatusPillProps) {
  const { colors } = useAppTheme();
  const toneStyle = resolveToneStyles(tone, colors);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        {
          backgroundColor: toneStyle.background,
          borderColor: toneStyle.border },
      ]}
    >
      <Ionicons name={toneStyle.icon} size={compact ? 11 : 12} color={toneStyle.iconColor} />
      <Text style={[styles.text, compact && styles.textCompact, { color: toneStyle.textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: Stroke.standard,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 150 },
  pillCompact: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    gap: 4,
    maxWidth: 130 },
  text: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1 },
  textCompact: {
    fontSize: 10 } });