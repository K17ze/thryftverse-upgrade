import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Type,
  FontFamily,
  Control,
} from '../../theme/designTokens';
import type { ExtractionRunDTO, ExtractionOutcome } from '../../services/catalogImportApi';

interface Props {
  run: ExtractionRunDTO | null;
  loading: boolean;
  triggering: boolean;
  isRunning: boolean;
  onTrigger: () => void;
}

/**
 * ExtractionStatusBanner — the honest state surface for extraction.
 *
 * Shows one of:
 * - Idle: "Extract fields from photo" action (not auto-triggered).
 * - Running: compact progress indicator with "Extracting…".
 * - Unavailable: "Extraction unavailable" — manual review remains usable.
 * - Source missing: "No photo to extract from".
 * - Partial/empty: "No candidates found" — manual review remains usable.
 * - Populated: nothing (candidates are shown inline in the field list).
 *
 * Anti-AI policy (per AGENTS.md):
 * - No "AI-powered" language. "Extract fields from photo" is the action.
 * - No gradient hero, no magic wand icon, no decorative chrome.
 * - One line of text, one action. Flat canvas, hairline separator.
 * - Honest outcomes: unavailable/empty states never claim success.
 */
export function ExtractionStatusBanner({
  run,
  loading,
  triggering,
  isRunning,
  onTrigger,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Loading: no banner ──
  if (loading) return null;

  // ── Running: compact progress ──
  if (isRunning || triggering) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={styles.statusText}>Extracting fields from photo…</Text>
      </View>
    );
  }

  // ── No run yet: show the trigger action ──
  if (!run) {
    return (
      <View style={styles.row}>
        <AnimatedPressable
          style={styles.triggerHit}
          onPress={onTrigger}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Extract fields from photo"
        >
          <Ionicons name="scan-outline" size={Control.iconCompact} color={colors.brand} />
          <Text style={styles.triggerText}>Extract fields from photo</Text>
        </AnimatedPressable>
      </View>
    );
  }

  // ── Terminal states ──
  const outcome = run.outcome;

  if (outcome === 'unavailable_no_model') {
    return (
      <View style={styles.row}>
        <Ionicons name="cube-outline" size={Control.iconCompact} color={colors.textMuted} />
        <Text style={styles.statusText}>Extraction unavailable — fill fields manually</Text>
      </View>
    );
  }

  if (outcome === 'source_missing') {
    return (
      <View style={styles.row}>
        <Ionicons name="image-outline" size={Control.iconCompact} color={colors.textMuted} />
        <Text style={styles.statusText}>No photo to extract from</Text>
      </View>
    );
  }

  if (outcome === 'failed') {
    return (
      <View style={styles.row}>
        <Ionicons name="alert-circle" size={Control.iconCompact} color={colors.warning} />
        <Text style={styles.statusText}>Extraction failed — fill fields manually</Text>
      </View>
    );
  }

  if (outcome === 'outcome_unknown') {
    return (
      <View style={styles.row}>
        <Ionicons name="help-circle-outline" size={Control.iconCompact} color={colors.warning} />
        <Text style={styles.statusText}>Extraction result unclear — check and fill manually</Text>
      </View>
    );
  }

  if (outcome === 'cancelled') {
    return (
      <View style={styles.row}>
        <Ionicons name="close-circle-outline" size={Control.iconCompact} color={colors.textMuted} />
        <Text style={styles.statusText}>Extraction cancelled — fill fields manually</Text>
      </View>
    );
  }

  if (outcome === 'ineligible') {
    return (
      <View style={styles.row}>
        <Ionicons name="ban-outline" size={Control.iconCompact} color={colors.textMuted} />
        <Text style={styles.statusText}>This item can’t be extracted — fill manually</Text>
      </View>
    );
  }

  // ── Partial or succeeded with no candidates ──
  if (run.isEmpty && (outcome === 'partial' || outcome === 'succeeded')) {
    return (
      <View style={styles.row}>
        <Ionicons name="search-outline" size={Control.iconCompact} color={colors.textMuted} />
        <Text style={styles.statusText}>No fields detected — fill manually</Text>
      </View>
    );
  }

  // ── Populated: candidates are shown inline, no banner needed ──
  return null;
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
    },
    statusText: {
      flex: 1,
      fontFamily: FontFamily.regular,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      color: colors.textSecondary,
    },
    triggerHit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      minHeight: Control.hit,
      flex: 1,
    },
    triggerText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      color: colors.brand,
    },
  });
