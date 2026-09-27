import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Radius, Space } from '../../../theme/designTokens';
import { CachedImage } from '../../CachedImage';
import type { MarketCoOwnAsset, Syndicate } from '../../../services/marketApi';
import { sharePctOfPool } from './syndicateDomain';

/** Pool members — avatar, name, commitment and share of the pooled buy.
 * Organizer first, then by contribution size. */
export function MemberList({
  syndicate,
  asset,
  viewerId,
  formatGbp,
}: {
  syndicate: Syndicate;
  asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>;
  viewerId: string | null;
  formatGbp: (valueGbp: number) => string;
}) {
  const { colors } = useAppTheme();
  const sorted = [...syndicate.members].sort(
    (a, b) =>
      (a.role === 'organizer' ? 0 : 1) - (b.role === 'organizer' ? 0 : 1) ||
      b.contributionGbp - a.contributionGbp,
  );

  if (sorted.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textSecondary }]}>
        No members yet — the first contribution opens the pool.
      </Text>
    );
  }

  return (
    <View>
      {sorted.map((m, index) => {
        const isYou = viewerId != null && m.userId === viewerId;
        return (
          <View
            key={m.id}
            style={[styles.row, index > 0 && { borderTopColor: colors.borderSubtle }]}
          >
            {m.avatar ? (
              <CachedImage uri={m.avatar} style={styles.avatar} contentFit="cover" downscaleWidth={72} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
                  {(m.displayName ?? m.username).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.identity}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {isYou ? 'You' : (m.displayName ?? `@${m.username}`)}
                {m.role === 'organizer' ? <Text style={[styles.role, { color: colors.textMuted }]}> · Organizer</Text> : null}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                @{m.username} · joined {formatJoined(m.joinedAt)}
              </Text>
            </View>
            <View style={styles.commitment}>
              <Text style={[styles.amount, { color: colors.textPrimary }]}>{formatGbp(m.contributionGbp)}</Text>
              <Text style={[styles.share, { color: colors.textMuted }]}>
                {sharePctOfPool(m.contributionGbp, syndicate, asset).toFixed(1)}% of pool
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs / 2,
  },
  name: {
    flexShrink: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  role: {
    fontFamily: TypographyV2.body.fontFamily,
  },
  meta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  commitment: {
    alignItems: 'flex-end',
    gap: Space.xs / 2,
  },
  amount: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  share: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});
