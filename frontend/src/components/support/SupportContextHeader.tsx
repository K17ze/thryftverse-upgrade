import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { SupportContextKind } from '../../contracts/support';

// ─── Context icon mapping (one icon family, outline resting state) ──────────
const CONTEXT_ICON: Record<SupportContextKind, keyof typeof Ionicons.glyphMap> = {
  general: 'help-circle-outline',
  order: 'cube-outline',
  listing: 'pricetag-outline',
  payout: 'card-outline',
  report: 'flag-outline',
  auction: 'trophy-outline',
  coown_asset: 'diamond-outline',
  catalog_import: 'download-outline',
  media_job: 'image-outline' };

const CONTEXT_LABEL: Record<SupportContextKind, string> = {
  general: 'General enquiry',
  order: 'Order',
  listing: 'Listing',
  payout: 'Payout',
  report: 'Report',
  auction: 'Auction',
  coown_asset: 'Co-Own asset',
  catalog_import: 'Import',
  media_job: 'Media' };

export interface SupportContextHeaderProps {
  contextKind: SupportContextKind;
  contextId: string | null;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  /** Optional status label rendered as a trailing meta word. */
  status?: string;
  /** Optional key date (ISO or pre-formatted) shown as trailing meta. */
  dateLabel?: string;
  onPress?: () => void;
}

function formatContextId(id: string): string {
  return `#${id.slice(-8).toUpperCase()}`;
}

/**
 * SupportContextHeader — flat, one-line contextual object anchor at the top
 * of a support conversation.
 *
 * No card wrapper: a hairline bottom border separates it from the message
 * list. The thumbnail (when present) is the only media; everything else is
 * typography. One icon family, one radius grammar (thumbnail only).
 */
export function SupportContextHeader({
  contextKind,
  contextId,
  title,
  subtitle,
  imageUrl,
  status,
  dateLabel,
  onPress }: SupportContextHeaderProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const iconName = CONTEXT_ICON[contextKind];
  const kindLabel = CONTEXT_LABEL[contextKind];
  const trailing = [status, dateLabel].filter(Boolean).join(' · ');

  const content = (
    <View style={styles.row}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.thumb} accessibilityRole="image" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name={iconName} size={Control.iconCompact} color={colors.textSecondary} />
        </View>
      )}

      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle ?? kindLabel}
          {contextId ? ` ${formatContextId(contextId)}` : ''}
        </Text>
      </View>

      {trailing.length > 0 && (
        <Text style={styles.trailing} numberOfLines={1}>
          {trailing}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <View style={styles.container}>
        <PressableBorderless onPress={onPress} label={title} hint="Open this item">
          {content}
        </PressableBorderless>
      </View>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

// ─── Minimal pressable wrapper (transparent hit area, no visible chrome) ─────
import { Pressable } from 'react-native';

function PressableBorderless({
  onPress,
  label,
  hint,
  children }: {
  onPress: () => void;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      {children}
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit },
    thumb: {
      width: 36,
      height: 36,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt },
    thumbPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center' },
    textCol: {
      flex: 1,
      minWidth: 0 },
    title: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: 1 },
    trailing: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing,
      flexShrink: 0,
      maxWidth: 120,
      textAlign: 'right' } });
}
