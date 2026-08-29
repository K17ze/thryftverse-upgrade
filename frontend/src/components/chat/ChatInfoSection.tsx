import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { Space, TypeStyles, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { Meta } from '../ui/Text';

function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function ChatInfoSection({
  title,
  children,
  danger }: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const { colors } = useAppTheme();
  const rows = React.Children.toArray(children);
  const sectionTitle = toSentenceCase(title);

  return (
    <View style={styles.section}>
      <Meta color={danger ? colors.danger : colors.textMuted} style={styles.sectionLabel}>
        {sectionTitle}
      </Meta>
      <View>
        {rows.map((child, index) =>
          React.isValidElement(child)
            ? React.cloneElement(child, { isLast: index === rows.length - 1 } as never)
            : child
        )}
      </View>
    </View>
  );
}

export function ChatInfoRow({
  icon,
  label,
  subtitle,
  detail,
  onPress,
  danger,
  showChevron,
  isLast,
  trailing }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  detail?: string;
  onPress?: () => void;
  danger?: boolean;
  showChevron?: boolean;
  isLast?: boolean;
  trailing?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const foreground = danger ? colors.danger : colors.textPrimary;
  const content = (
    <View style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.iconTarget} importantForAccessibility="no-hide-descendants">
        <Ionicons
          name={icon}
          size={20}
          color={danger ? colors.danger : colors.textSecondary}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {trailing ? (
        trailing
      ) : showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.68}
      scaleValue={0.985}
      hapticFeedback={danger ? 'medium' : 'light'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={subtitle}
    >
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Space.xs },
  sectionLabel: {
    marginLeft: Space.xs,
    fontSize: TypographyV2.meta.size,
    letterSpacing: TypographyV2.meta.letterSpacing },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    gap: Space.sm },
  iconTarget: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center' },
  copy: {
    flex: 1,
    gap: 2 },
  label: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypeStyles.body.fontFamily },
  detail: {
    maxWidth: '38%',
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    textAlign: 'right' } });
