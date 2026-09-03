import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';

import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
export interface FlagshipDangerZoneProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  style?: ViewStyle;
  destructive?: boolean;
}

export function FlagshipDangerZone({
  title,
  description,
  actionLabel,
  onAction,
  style,
  destructive = true }: FlagshipDangerZoneProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.dangerSubtle,
          borderColor: colors.dangerBorder },
        style,
      ]}
    >
      <Text style={[styles.title, { color: colors.danger }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      <AppButton
        title={actionLabel}
        variant={destructive ? 'danger' : 'secondary'}
        onPress={onAction}
        size="sm"
        hapticFeedback="heavy"
        titleStyle={destructive ? undefined : { color: colors.danger }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.lg },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    marginBottom: Space.xs },
  description: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight,
    marginBottom: Space.md } });