import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Space } from '../../../theme/designTokens';
import { CachedImage } from '../../CachedImage';
import { getCategoryFocalPoint } from '../../../utils/media';
import type { MarketCoOwnAsset, Syndicate } from '../../../services/marketApi';
import { memberByUserId, pooledGbp, poolProgressPct, sharePctOfPool, targetTotalGbp } from './syndicateDomain';
import { PoolMeter } from './PoolMeter';
import { SyndicateStatusTag } from './SyndicateStatusTag';

/** One pool in a list — media thumb, name + state, the funding meter,
 * and the pooled/member facts. The whole row presses through to the
 * pool detail. */
export function SyndicateRow({
  syndicate,
  asset,
  viewerId,
  formatGbp,
  onPress,
}: {
  syndicate: Syndicate;
  asset: MarketCoOwnAsset;
  viewerId: string | null;
  formatGbp: (valueGbp: number) => string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const member = viewerId ? memberByUserId(syndicate, viewerId) : undefined;
  const target = targetTotalGbp(syndicate, asset);
  const pct = poolProgressPct(syndicate, asset);
  const sharePct = member ? sharePctOfPool(member.contributionGbp, syndicate, asset) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${syndicate.name} pool`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
    >
      <CachedImage
        uri={asset.imageUrl ?? ''}
        style={styles.thumb}
        contentFit="cover"
        focalPoint={getCategoryFocalPoint(asset.title)}
        downscaleWidth={96}
        emptyIcon="cube-outline"
      />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {syndicate.name}
          </Text>
          <SyndicateStatusTag
            syndicate={syndicate}
            assetUnitPriceGbp={asset.unitPriceGbp}
            viewerIsMember={member != null}
          />
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {asset.title} · {syndicate.unitsTarget} units at {formatGbp(asset.unitPriceGbp)}
        </Text>
        <View style={styles.meterWrap}>
          <PoolMeter pct={pct} />
        </View>
        <Text style={[styles.facts, { color: colors.textMuted }]} numberOfLines={1}>
          {formatGbp(pooledGbp(syndicate))} of {formatGbp(target)} · {syndicate.members.length}/
          {syndicate.memberCap} members
          {sharePct != null ? ` · Your share ${sharePct.toFixed(1)}%` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2,
    minHeight: 44,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs / 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  name: {
    flexShrink: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  meterWrap: {
    marginTop: Space.xs / 2 + 1,
  },
  facts: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});
