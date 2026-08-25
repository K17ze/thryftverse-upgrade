import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Type, FontFamily, Control } from '../../theme/designTokens';
import type { SupportMessageCitation } from '../../contracts/support';

export interface SupportEvidenceRowProps {
  citations: SupportMessageCitation[];
  /** Optional callback when a citation is tapped. When omitted, the row
   *  expands inline to reveal the article title + effective date. */
  onPressCitation?: (citation: SupportMessageCitation) => void;
}

function formatEffectiveDate(iso?: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * SupportEvidenceRow — compact citation/evidence list rendered beneath a
 * message bubble.
 *
 * Flat canvas with a hairline top border (no card wrapper). Each citation is
 * a single row: article title + effective date. Tapping expands the row to
 * reveal jurisdiction/audience when present; when `onPressCitation` is
 * supplied the row defers navigation to the caller instead.
 */
export function SupportEvidenceRow({
  citations,
  onPressCitation,
}: SupportEvidenceRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (citations.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {citations.map((citation, index) => {
        const key = citation.articleId ?? citation.articleVersionId ?? `citation-${index}`;
        const isExpanded = expandedId === key;
        const dateLabel = formatEffectiveDate(citation.effectiveDate);

        const handlePress = () => {
          if (onPressCitation) {
            onPressCitation(citation);
            return;
          }
          setExpandedId((prev) => (prev === key ? null : key));
        };

        return (
          <Pressable
            key={key}
            onPress={handlePress}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`Source: ${citation.articleTitle ?? 'article'}`}
            accessibilityHint={onPressCitation ? 'Open article' : 'Expand citation'}
          >
            <Ionicons
              name="document-text-outline"
              size={Control.iconCompact}
              color={colors.textSecondary}
            />
            <View style={styles.textCol}>
              <Text style={styles.title} numberOfLines={isExpanded ? undefined : 1}>
                {citation.articleTitle ?? 'Support article'}
              </Text>
              {isExpanded ? (
                <View style={styles.metaCol}>
                  {dateLabel && (
                    <Text style={styles.meta}>Effective {dateLabel}</Text>
                  )}
                  {citation.jurisdiction && (
                    <Text style={styles.meta}>{citation.jurisdiction}</Text>
                  )}
                  {citation.audience && (
                    <Text style={styles.meta}>{citation.audience}</Text>
                  )}
                </View>
              ) : (
                dateLabel && <Text style={styles.meta}>{dateLabel}</Text>
              )}
            </View>
            {!onPressCitation && (
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={Control.iconCompact}
                color={colors.textMuted}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      marginTop: Space.xs,
      paddingTop: Space.xs,
      gap: Space.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      minHeight: Control.hit,
      paddingVertical: Space.xs / 2,
    },
    textCol: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    metaCol: {
      gap: 1,
      marginTop: 2,
    },
    meta: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      letterSpacing: Type.meta.letterSpacing,
      lineHeight: Type.meta.lineHeight,
    },
  });
}
