import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, FontFamily, Stroke, Control } from '../../theme/designTokens';
import { AppButton } from '../ui/AppButton';
import type { SupportActionProposal, ActionProposalState } from '../../contracts/support';

export interface SupportActionReviewProps {
  proposal: SupportActionProposal;
  onConfirm: () => void;
  onReject: () => void;
  /** True while a confirm/reject request is in flight. */
  isPending?: boolean;
}

function formatExpiry(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const now = Date.now();
  const diff = parsed.getTime() - now;
  if (diff <= 0) return 'Expired';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `Expires in ${hours}h`;
}

function formatArguments(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return 'No parameters';
  return entries
    .map(([key, value]) => {
      const valueStr =
        typeof value === 'string' ? value : JSON.stringify(value);
      const truncated =
        valueStr.length > 80 ? `${valueStr.slice(0, 77)}…` : valueStr;
      return `${key}: ${truncated}`;
    })
    .join('\n');
}

interface StateCopy {
  label: string;
  tone: 'neutral' | 'brand' | 'success' | 'danger' | 'warning';
  icon: keyof typeof Ionicons.glyphMap;
}

function stateCopy(state: ActionProposalState): StateCopy {
  switch (state) {
    case 'proposed':
      return { label: 'Proposed action', tone: 'brand', icon: 'flash-outline' };
    case 'confirmed':
      return { label: 'Confirmed', tone: 'neutral', icon: 'checkmark-circle-outline' };
    case 'rejected':
      return { label: 'Rejected', tone: 'neutral', icon: 'close-circle-outline' };
    case 'executing':
      return { label: 'Running', tone: 'warning', icon: 'sync-outline' };
    case 'succeeded':
      return { label: 'Completed', tone: 'success', icon: 'checkmark-circle' };
    case 'failed':
      return { label: 'Failed', tone: 'danger', icon: 'alert-circle' };
    case 'unknown_outcome':
      return {
        label: "We couldn't confirm the result",
        tone: 'warning',
        icon: 'help-circle-outline',
      };
  }
}

function toneColor(tone: StateCopy['tone'], colors: ThemeColors): string {
  switch (tone) {
    case 'brand':
      return colors.brand;
    case 'success':
      return colors.success;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warning;
    case 'neutral':
    default:
      return colors.textSecondary;
  }
}

/**
 * SupportActionReview — inline review surface for an action proposal.
 *
 * Shows the tool name, a plain-language consequence summary, the exact
 * arguments, and the expiry. Confirm and Reject buttons are only enabled
 * while the proposal is in the `proposed` state. No green success is shown
 * before the backend confirms — `succeeded` only renders after the server
 * reports it. `unknown_outcome` gets a distinct "We couldn't confirm the
 * result" treatment instead of a success or failure claim.
 *
 * Flat canvas with a hairline top border — no card-on-card, no decorative
 * chrome.
 */
export function SupportActionReview({
  proposal,
  onConfirm,
  onReject,
  isPending = false,
}: SupportActionReviewProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const copy = stateCopy(proposal.state);
  const accent = toneColor(copy.tone, colors);
  const isProposed = proposal.state === 'proposed';
  const isTerminal =
    proposal.state === 'succeeded' ||
    proposal.state === 'failed' ||
    proposal.state === 'rejected' ||
    proposal.state === 'unknown_outcome';
  const isExecuting = proposal.state === 'executing';

  return (
    <View style={styles.container}>
      {/* ── Header line: state + expiry ── */}
      <View style={styles.headerRow}>
        <View style={styles.stateRow}>
          {isExecuting ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Ionicons name={copy.icon} size={Control.iconCompact} color={accent} />
          )}
          <Text style={[styles.stateLabel, { color: accent }]}>{copy.label}</Text>
        </View>
        {isProposed && (
          <Text style={styles.expiry}>{formatExpiry(proposal.expiresAt)}</Text>
        )}
      </View>

      {/* ── Tool name ── */}
      <Text style={styles.toolName} numberOfLines={1}>
        {proposal.toolName}
      </Text>

      {/* ── Consequence summary ── */}
      <Text style={styles.consequence}>{proposal.consequenceSummary}</Text>

      {/* ── Exact arguments ── */}
      <View style={styles.argsBox}>
        <Text style={styles.argsLabel}>Parameters</Text>
        <Text style={styles.argsBody}>{formatArguments(proposal.canonicalArguments)}</Text>
      </View>

      {/* ── Unknown outcome note ── */}
      {proposal.state === 'unknown_outcome' && (
        <Text style={styles.unknownNote}>
          The action may or may not have completed. If you don't see the expected
          change, contact support.
        </Text>
      )}

      {/* ── Actions ── */}
      {isProposed && (
        <View style={styles.actions}>
          <AppButton
            title="Reject"
            variant="secondary"
            size="sm"
            onPress={onReject}
            disabled={isPending}
            loading={isPending}
            hapticFeedback="light"
            accessibilityLabel="Reject proposed action"
            style={styles.actionBtn}
          />
          <AppButton
            title="Confirm"
            variant="primary"
            size="sm"
            onPress={onConfirm}
            disabled={isPending}
            loading={isPending}
            hapticFeedback="medium"
            accessibilityLabel="Confirm proposed action"
            style={styles.actionBtn}
          />
        </View>
      )}

      {/* ── Terminal inline confirmation (no buttons) ── */}
      {isTerminal && !isProposed && (
        <View style={styles.terminalRow}>
          <Ionicons
            name={copy.icon}
            size={Control.iconCompact}
            color={accent}
          />
          <Text style={[styles.terminalText, { color: accent }]}>{copy.label}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: Space.sm,
      marginTop: Space.xs,
      gap: Space.xs,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    stateLabel: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: Type.metaElevated.letterSpacing,
      textTransform: 'uppercase',
    },
    expiry: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textMuted,
      letterSpacing: Type.meta.letterSpacing,
    },
    toolName: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    consequence: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      lineHeight: Type.body.lineHeight + 2,
      letterSpacing: Type.body.letterSpacing,
    },
    argsBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.sm,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      gap: Space.xs / 2,
    },
    argsLabel: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: Type.metaElevated.letterSpacing,
      textTransform: 'uppercase',
    },
    argsBody: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      lineHeight: Type.caption.lineHeight + 2,
      letterSpacing: Type.caption.letterSpacing,
    },
    unknownNote: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.warning,
      lineHeight: Type.caption.lineHeight + 2,
      letterSpacing: Type.caption.letterSpacing,
    },
    actions: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    actionBtn: {
      flex: 1,
    },
    terminalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      minHeight: Control.hit,
    },
    terminalText: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
