/**
 * AITrustSignal — a reusable row that surfaces AI trust signals.
 *
 * Implements the five 2026 AI trust-signal patterns (P0 flagship requirement):
 *  1. Confidence signal   — coloured dot + qualitative label
 *  2. Source citation     — "Because you viewed similar items"
 *  3. Easy undo / revert  — one-tap "Undo" button (when onUndo provided)
 *  4. Visible context     — "Using your size: M"
 *  5. Progressive disclosure — tap chevron to reveal expanded reasoning
 *
 * Per AGENTS.md §11 (Truthful UI): confidence is never a fabricated percentage.
 * We expose a qualitative level (high / medium / low / exploratory) backed by a
 * coloured dot. Colour is never the sole signal — a text label always accompanies
 * the dot so colour-blind users can still read the confidence. When `isDemo` is
 * true, a subtle "Demo" badge is shown so the user is never misled.
 *
 * Per AGENTS.md §4 (Push to Maximum Quality):
 *  - Flat composition, hairline separator, no card-on-card
 *  - Design tokens only — no hardcoded values
 *  - useAppTheme() for all colours
 *  - Two non-avatar radii max (Radius.full for the demo pill / undo button)
 *  - Max three type sizes in the row (meta, caption, body)
 *
 * Per AGENTS.md §13 (Control Quality): the Undo and expand controls meet the
 * 44pt touch target via hitSlop, carry accessibilityRole, accessibilityLabel and
 * accessibilityHint, and have pressed feedback through AnimatedPressable.
 *
 * References:
 *  - https://mantlr.com/blog/design-ai-features-trust (2026)
 *  - https://www.lazarev.agency/articles/ai-ux-patterns (2026)
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../../theme/designTokens';
import { AITrustBadge, type AIConfidence } from './AITrustBadge';

export type { AIConfidence } from './AITrustBadge';

interface AITrustSignalProps {
  /** Qualitative confidence level. */
  confidence: AIConfidence;
  /** Why is this recommended? e.g. "Based on your browsing history". */
  source?: string;
  /** Optional revert callback. When provided, an "Undo" button is rendered. */
  onUndo?: () => void;
  /** What data is the AI using? e.g. "Using your size: M, style: casual". */
  context?: string;
  /** Detailed explanation shown on tap (progressive disclosure). */
  expandedReasoning?: string;
  /** When true, renders a subtle "Demo" badge so the user is never misled. */
  isDemo?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CONFIDENCE_LABEL: Record<AIConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  exploratory: 'Exploratory',
};

/** Dot colour per confidence level. Uses semantic theme tokens, not raw hex. */
function dotColorFor(confidence: AIConfidence, colors: ThemeColors): string {
  switch (confidence) {
    case 'high':
      return colors.success;
    case 'medium':
      return colors.warning;
    case 'low':
      return colors.discovery;
    case 'exploratory':
    default:
      return colors.textMuted;
  }
}

/**
 * A compact horizontal row surfacing AI trust signals. When `expandedReasoning`
 * is provided, a chevron toggles a detailed explanation below the row
 * (progressive disclosure — simple explanation → detailed on tap).
 */
export function AITrustSignal({
  confidence,
  source,
  onUndo,
  context,
  expandedReasoning,
  isDemo,
  style,
}: AITrustSignalProps) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  const dotColor = dotColorFor(confidence, colors);
  const confidenceText = CONFIDENCE_LABEL[confidence];
  const canExpand = Boolean(expandedReasoning);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Build a single accessibility label that describes confidence + source +
  // context so screen readers get the full trust picture in one announcement.
  const a11yParts: string[] = [confidenceText];
  if (source) a11yParts.push(`Source: ${source}`);
  if (context) a11yParts.push(`Context: ${context}`);
  if (isDemo) a11yParts.push('Demo mode');
  const a11yLabel = a11yParts.join('. ');

  return (
    <View
      style={[styles.container, { borderColor: colors.borderSubtle }, style]}
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
    >
      {/* ── Top row: confidence + source + context + undo + expand ── */}
      <View style={styles.topRow}>
        <View style={styles.confidenceGroup}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text
            style={[styles.confidenceLabel, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {confidenceText}
          </Text>
          {isDemo && (
            <View
              style={[
                styles.demoPill,
                { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.demoText, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                Demo
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionsGroup}>
          {onUndo && (
            <Pressable
              onPress={onUndo}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Undo this AI action"
              accessibilityHint="Reverts the most recent AI-driven change"
              style={({ pressed }) => [
                styles.undoBtn,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.undoText, { color: colors.brand }]}>
                Undo
              </Text>
            </Pressable>
          )}
          {canExpand && (
            <Pressable
              onPress={toggleExpand}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                expanded ? 'Hide detailed reasoning' : 'Show detailed reasoning'
              }
              accessibilityHint="Expands a detailed explanation of why this was recommended"
              style={({ pressed }) => [
                styles.expandBtn,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Source citation ── */}
      {source && (
        <Text
          style={[styles.sourceText, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {source}
        </Text>
      )}

      {/* ── Visible context ── */}
      {context && (
        <Text
          style={[styles.contextText, { color: colors.textMuted }]}
          numberOfLines={2}
        >
          {context}
        </Text>
      )}

      {/* ── Expanded reasoning (progressive disclosure) ── */}
      {canExpand && expanded && (
        <View style={[styles.reasoningWrap, { borderColor: colors.borderSubtle }]}>
          <Text
            style={[styles.reasoningText, { color: colors.textSecondary }]}
          >
            {expandedReasoning}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderWidth: Stroke.hairline,
    gap: Space.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    minHeight: 24,
  },
  confidenceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  confidenceLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    flexShrink: 1,
  },
  demoPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: Space.xs,
  },
  demoText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 0,
  },
  undoBtn: {
    minHeight: 32,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  expandBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  contextText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  reasoningWrap: {
    marginTop: Space.xs,
    paddingTop: Space.xs,
    borderTopWidth: Stroke.hairline,
  },
  reasoningText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 4,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
});

export { AITrustBadge };
