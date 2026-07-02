import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { EvidenceGroup } from '../../platform/commerce/categoryEvidence';

export interface CategoryEvidenceProps {
  groups: EvidenceGroup[];
}

export function CategoryEvidence({ groups }: CategoryEvidenceProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  if (groups.length === 0) return null;

  return (
    <View style={styles.container}>
      {groups.map((group, groupIndex) => {
        const isTechnical = group.items.every((i) => i.importance === 'technical');
        const isExpanded = expandedGroup === group.title;
        const hasMultipleItems = group.items.length > 1;

        if (!isTechnical) {
          return (
            <View key={group.title} style={groupIndex > 0 ? styles.groupGap : undefined}>
              {group.summary && !hasMultipleItems && (
                <Text style={styles.primarySummary}>{group.summary}</Text>
              )}
              {group.summary && hasMultipleItems && (
                <Text style={styles.primarySummary}>{group.summary}</Text>
              )}
              {hasMultipleItems && (
                <View style={styles.factsList}>
                  {group.items.map((item) => (
                    <View key={item.key} style={styles.factRow}>
                      <Text style={styles.factLabel}>{item.label}</Text>
                      <Text style={styles.factValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        }

        return (
          <View key={group.title} style={styles.groupGap}>
            <Pressable
              style={styles.expandableHeader}
              onPress={() => setExpandedGroup(isExpanded ? null : group.title)}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? `Collapse ${group.title}` : `Expand ${group.title}`}
            >
              <Text style={styles.expandableTitle}>{group.title}</Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={Colors.textMuted}
              />
            </Pressable>
            {isExpanded && (
              <View style={styles.factsList}>
                {group.items.map((item) => (
                  <View key={item.key} style={styles.factRow}>
                    <Text style={styles.factLabel}>{item.label}</Text>
                    <Text style={styles.factValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  groupGap: {
    marginTop: Space.md,
  },
  primarySummary: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: Space.xs,
  },
  factsList: {
    gap: 6,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  factLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    flexShrink: 0,
  },
  factValue: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: Space.sm,
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
  },
  expandableTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
});
