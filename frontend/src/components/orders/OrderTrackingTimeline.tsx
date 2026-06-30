import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

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
  return (
    <View>
      {warningText ? (
        <View style={styles.warningRow}>
          <Ionicons name="alert-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.warningText}>{warningText}</Text>
        </View>
      ) : null}
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const iconName =
          entry.state === 'failure'
            ? 'close-circle'
            : entry.state === 'completed'
              ? 'checkmark-circle'
              : entry.state === 'active'
                ? 'time-outline'
                : 'ellipse-outline';
        const iconColor =
          entry.state === 'failure'
            ? Colors.danger
            : entry.state === 'completed'
              ? Colors.brand
              : entry.state === 'active'
                ? Colors.brand
                : Colors.border;

        return (
          <View key={entry.id} style={styles.entryRow}>
            <View style={styles.leftCol}>
              <Ionicons name={iconName as any} size={20} color={iconColor} />
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

const styles = StyleSheet.create({
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Space.sm,
  },
  warningText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  entryRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  leftCol: {
    alignItems: 'center',
    width: 24,
  },
  connector: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
    minHeight: 32,
    borderRadius: 1,
  },
  connectorCompleted: {
    backgroundColor: Colors.brand,
  },
  contentCol: {
    flex: 1,
    paddingBottom: Space.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  label: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  labelPending: {
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.brand,
  },
  date: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginLeft: Space.sm,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  subtitlePending: {
    color: Colors.textMuted,
  },
});
