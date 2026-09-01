import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { EvidenceGroup } from '../../platform/commerce/categoryEvidence';

export interface CategoryEvidenceProps {
  groups: EvidenceGroup[];
}

export function CategoryEvidence({ groups }: CategoryEvidenceProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
              style={({ pressed }) => [styles.expandableHeader, pressed && styles.headerPressed]}
              onPress={() => setExpandedGroup(isExpanded ? null : group.title)}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? `Collapse ${group.title}` : `Expand ${group.title}`}
              accessibilityState={{ expanded: isExpanded }}
            >
              <Text style={styles.expandableTitle}>{group.title}</Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textMuted}
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  groupGap: {
    marginTop: Space.md },
  primarySummary: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.body.lineHeight,
    marginBottom: Space.xs },
  factsList: {
    gap: Space.xs },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Space.xs },
  factLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    flexShrink: 0 },
  factValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: Space.sm },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
    minHeight: Control.hit },
  headerPressed: {
    opacity: 0.85 },
  expandableTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary } });
