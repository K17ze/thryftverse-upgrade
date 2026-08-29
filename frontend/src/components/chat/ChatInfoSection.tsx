import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { Space, Type, TypeStyles, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { Meta } from '../ui/Text';

export function ChatInfoSection({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const { colors } = useAppTheme();
  const rows = React.Children.toArray(children);

  return (
    <View style={styles.section}>
      <Meta color={danger ? colors.danger : colors.textMuted} style={styles.sectionLabel}>
        {title}
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
  trailing,
}: {
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
    gap: Space.xs,
  },
  sectionLabel: {
    marginLeft: Space.xs,
    fontSize: Type.meta.size,
    letterSpacing: Type.meta.letterSpacing,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    gap: Space.sm,
  },
  iconTarget: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  subtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: TypeStyles.body.fontFamily,
  },
  detail: {
    maxWidth: '38%',
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    textAlign: 'right',
  },
});
