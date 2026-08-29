/**
 * SustainabilityTags — multi-select chip selector for sustainability attributes.
 *
 * Sustainability tags shown where relevant to listing. This selector lets
 * a seller tag a listing with eco-attributes (Pre-loved, Vintage,
 * Sustainable brand, Upcycled, Plastic-free packaging) and surfaces a
 * short "Sustainability impact" summary when tags are active.
 *
 * Design (AGENTS.md §4):
 *   - Chip layout with icon + label; selected = filled brand, unselected = outlined.
 *   - One radius family (Radius.full for chips).
 *   - Stroke grammar: hairline outline unselected, filled selected.
 *   - Each chip is a switch (accessibilityRole="switch") per §13.
 *
 * TRUTHFUL UI (AGENTS.md §11):
 *   Tags reflect seller-asserted attributes — they are not verified by a
 *   backend. The impact summary is illustrative and labelled honestly.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import {
  Space,
  Radius,
  Stroke,
  TypeStyles,
  Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface SustainabilityTagsProps {
  /** Currently selected sustainability tag ids. */
  selectedTags: string[];
  /** Called with the updated tag list when a tag is toggled. */
  onTagsChange: (tags: string[]) => void;
}

/** A selectable sustainability tag definition. */
interface SustainabilityTagDef {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Short impact description shown in the summary. */
  impact: string;
}

const TAG_DEFINITIONS: SustainabilityTagDef[] = [
  {
    id: 'pre-loved',
    label: 'Pre-loved',
    icon: 'repeat-outline',
    impact: 'Extends the lifecycle of an existing item.' },
  {
    id: 'vintage',
    label: 'Vintage',
    icon: 'time-outline',
    impact: '20+ years old — circular fashion at its best.' },
  {
    id: 'sustainable-brand',
    label: 'Sustainable brand',
    icon: 'leaf-outline',
    impact: 'Brand with documented sustainability practices.' },
  {
    id: 'upcycled',
    label: 'Upcycled',
    icon: 'construct-outline',
    impact: 'Modified from its original form into something new.' },
  {
    id: 'plastic-free-packaging',
    label: 'Plastic-free packaging',
    icon: 'cube-outline',
    impact: 'You ship in eco-friendly, plastic-free packaging.' },
];

export function SustainabilityTags({
  selectedTags,
  onTagsChange }: SustainabilityTagsProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const toggleTag = useCallback(
    (id: string) => {
      haptic.light();
      const next = selectedTags.includes(id)
        ? selectedTags.filter((t) => t !== id)
        : [...selectedTags, id];
      onTagsChange(next);
      const def = TAG_DEFINITIONS.find((t) => t.id === id);
      if (def) {
        AccessibilityInfo.announceForAccessibility(
          next.includes(id)
            ? `${def.label} selected`
            : `${def.label} removed`,
        );
      }
    },
    [haptic, onTagsChange, selectedTags],
  );

  const selectedDefs = useMemo(
    () =>
      TAG_DEFINITIONS.filter((t) => selectedTags.includes(t.id)),
    [selectedTags],
  );

  return (
    <View
      style={styles.wrap}
      accessibilityLabel="Sustainability tags"
      accessibilityHint="Select eco-attributes for your listing"
    >
      <View style={styles.headerRow}>
        <Ionicons
          name="leaf"
          size={Control.iconCompact}
          color={colors.success}
          style={styles.headerIcon}
        />
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Sustainability
        </Text>
      </View>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        Tag your listing with eco-attributes buyers care about.
      </Text>

      {/* Chip grid */}
      <View style={styles.chipWrap}>
        {TAG_DEFINITIONS.map((def) => {
          const selected = selectedTags.includes(def.id);
          return (
            <Pressable
              key={def.id}
              onPress={() => toggleTag(def.id)}
              style={({ pressed }) => [
                styles.chip,
                selected
                  ? { backgroundColor: colors.brand, borderColor: colors.brand }
                  : { backgroundColor: 'transparent', borderColor: colors.border },
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="switch"
              accessibilityLabel={`${def.label} tag`}
              accessibilityHint={`Mark this listing as ${def.label.toLowerCase()}`}
              accessibilityState={{ checked: selected }}
            >
              <Ionicons
                name={def.icon}
                size={14}
                color={selected ? colors.textInverse : colors.textSecondary}
                style={styles.chipIcon}
              />
              <Text
                style={[
                  styles.chipLabel,
                  { color: selected ? colors.textInverse : colors.textPrimary },
                ]}
                numberOfLines={1}
              >
                {def.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Sustainability impact summary */}
      {selectedDefs.length > 0 && (
        <View
          style={[styles.summary, { backgroundColor: colors.successSubtle }]}
          accessibilityLabel={`Sustainability impact. ${selectedDefs.length} ${
            selectedDefs.length === 1 ? 'tag' : 'tags'
          } selected.`}
          accessibilityRole="text"
        >
          <View style={styles.summaryHeader}>
            <Ionicons
              name="earth-outline"
              size={Control.iconCompact}
              color={colors.success}
            />
            <Text style={[styles.summaryTitle, { color: colors.success }]}>
              Sustainability impact
            </Text>
          </View>
          {selectedDefs.map((def) => (
            <View key={`impact-${def.id}`} style={styles.summaryRow}>
              <Ionicons
                name="checkmark-circle"
                size={13}
                color={colors.success}
                style={styles.summaryCheck}
              />
              <Text style={[styles.summaryText, { color: colors.textPrimary }]}>
                <Text style={styles.summaryLabel}>{def.label}</Text>
                {' — '}
                {def.impact}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      marginBottom: Space.md },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs / 2 },
    headerIcon: {
      marginRight: Space.xs / 2 },
    sectionTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600' },
    sectionHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginBottom: Space.sm,
      lineHeight: TypographyV2.meta.lineHeight },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      minHeight: Control.hit },
    chipIcon: {
      marginRight: Space.xs / 4 },
    chipLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600' },
    summary: {
      marginTop: Space.md,
      padding: Space.sm + 2,
      borderRadius: Radius.md },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs },
    summaryTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600' },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      paddingVertical: Space.xs / 2 },
    summaryCheck: {
      marginTop: Space.xs / 4,
      marginRight: Space.xs / 4 },
    summaryText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight },
    summaryLabel: {
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600' } });
}
