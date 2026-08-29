import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface TimelineEntry {
  id: string;
  label: string;
  subtitle: string;
  date?: string;
  state: 'completed' | 'active' | 'pending' | 'failure';
}

interface Props {
  entries: TimelineEntry[];
  warningText?: string;
}

export function OrderTrackingTimeline({ entries, warningText }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      {warningText ? (
        <View style={styles.warningRow}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} />
          <Text style={styles.warningText}>{warningText}</Text>
        </View>
      ) : null}
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const iconName: React.ComponentProps<typeof Ionicons>['name'] =
          entry.state === 'failure'
            ? 'close-circle'
            : entry.state === 'completed'
              ? 'checkmark-circle'
              : entry.state === 'active'
                ? 'time-outline'
                : 'ellipse-outline';
        const iconColor =
          entry.state === 'failure'
            ? colors.danger
            : entry.state === 'completed'
              ? colors.brand
              : entry.state === 'active'
                ? colors.brand
                : colors.border;

        return (
          <View key={entry.id} style={styles.entryRow}>
            <View style={styles.leftCol}>
              <Ionicons name={iconName} size={20} color={iconColor} />
              {!isLast ? (
                <View
                  style={[
                    styles.connector,
                    entry.state === 'completed' && styles.connectorCompleted,
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.contentCol}>
              <View style={styles.topRow}>
                <Text
                  style={[
                    styles.label,
                    entry.state === 'pending' && styles.labelPending,
                    entry.state === 'active' && styles.labelActive,
                  ]}
                  accessibilityLabel={`${entry.label}${entry.date ? `, ${entry.date}` : ''}`}
                >
                  {entry.label}
                </Text>
                {entry.date ? (
                  <Text style={styles.date}>{entry.date}</Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.subtitle,
                  entry.state === 'pending' && styles.subtitlePending,
                ]}
              >
                {entry.subtitle}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.sm },
  warningText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  entryRow: {
    flexDirection: 'row',
    gap: Space.md },
  leftCol: {
    alignItems: 'center',
    width: Space.xl },
  connector: {
    width: Stroke.emphasis,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: Space.xs,
    minHeight: Space.xl + Space.sm,
    borderRadius: Radius.sm },
  connectorCompleted: {
    backgroundColor: colors.brand },
  contentCol: {
    flex: 1,
    paddingBottom: Space.md },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2 },
  label: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    flexShrink: 1 },
  labelPending: {
    color: colors.textMuted },
  labelActive: {
    color: colors.brand },
  date: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginLeft: Space.sm },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: 18 },
  subtitlePending: {
    color: colors.textMuted } });
