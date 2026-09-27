import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Radius, Space } from '../../../theme/designTokens';
import type { Syndicate, SyndicateExecution } from '../../../services/marketApi';

const KIND_ICON: Record<SyndicateExecution['kind'], keyof typeof Ionicons.glyphMap> = {
  contribution: 'cash-outline',
  purchase: 'cart-outline',
  refund: 'refresh-outline',
  note: 'information-circle-outline',
};

/** The pool's order history — contributions, executions and milestones,
 * newest first. One line per event, actors in plain text. */
export function ExecutionList({
  syndicate,
  formatGbp,
}: {
  syndicate: Syndicate;
  formatGbp: (valueGbp: number) => string;
}) {
  const { colors } = useAppTheme();
  const entries = [...syndicate.executions].sort((a, b) => b.at.localeCompare(a.at));

  if (entries.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textSecondary }]}>
        Nothing on the book yet.
      </Text>
    );
  }

  return (
    <View>
      {entries.map((e, index) => (
        <View
          key={e.id}
          style={[styles.row, index > 0 && { borderTopColor: colors.borderSubtle }]}
        >
          <View style={[styles.kindBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name={KIND_ICON[e.kind] ?? 'information-circle-outline'} size={14} color={colors.textMuted} />
          </View>
          <View style={styles.body}>
            {e.kind === 'contribution' ? (
              <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={2}>
                <Text style={[styles.actor, { color: colors.textPrimary }]}>@{e.actorUsername}</Text>
                {' committed '}
                <Text style={[styles.actor, { color: colors.textPrimary }]}>
                  {e.amountGbp != null ? formatGbp(e.amountGbp) : ''}
                </Text>
              </Text>
            ) : e.kind === 'purchase' ? (
              <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={2}>
                <Text style={[styles.actor, { color: colors.textPrimary }]}>
                  Pool buy executed{e.units != null ? ` — ${e.units} units` : ''}
                </Text>
                {e.amountGbp != null ? ` for ${formatGbp(e.amountGbp)}` : ''}
              </Text>
            ) : e.kind === 'refund' ? (
              <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={2}>
                <Text style={[styles.actor, { color: colors.textPrimary }]}>
                  Refund{e.actorUsername ? ` to @${e.actorUsername}` : ''}
                </Text>
                {e.amountGbp != null ? ` ${formatGbp(e.amountGbp)}` : ''}
              </Text>
            ) : (
              <Text style={[styles.line, { color: colors.textPrimary }]} numberOfLines={2}>
                {e.note}
              </Text>
            )}
            <Text style={[styles.time, { color: colors.textMuted }]}>{formatTimeAgo(e.at)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function formatTimeAgo(iso: string): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: Space.md,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  kindBadge: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.xs,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs / 2,
  },
  line: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  actor: {
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  time: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});
