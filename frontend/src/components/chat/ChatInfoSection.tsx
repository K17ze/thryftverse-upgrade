import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Space, Type, TypeStyles } from '../../theme/designTokens';
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
  const rows = React.Children.toArray(children);

  return (
    <View style={styles.section}>
      <Meta color={danger ? Colors.danger : Colors.textMuted} style={styles.sectionLabel}>
        {title.toUpperCase()}
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  detail?: string;
  onPress?: () => void;
  danger?: boolean;
  showChevron?: boolean;
  isLast?: boolean;
}) {
  const foreground = danger ? Colors.danger : Colors.textPrimary;
  const content = (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.iconTarget} importantForAccessibility="no-hide-descendants">
        <Ionicons
          name={icon}
          size={20}
          color={danger ? Colors.danger : Colors.textSecondary}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
    paddingVertical: 10,
    gap: Space.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
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
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: TypeStyles.body.fontFamily,
  },
  detail: {
    maxWidth: '38%',
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    textAlign: 'right',
  },
});
