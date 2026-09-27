import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Space } from '../../../theme/designTokens';
import type { Syndicate } from '../../../services/marketApi';
import { isMemberCapReached, syndicatePhase } from './syndicateDomain';

/** Pool state tag — status dot + word, no badge chrome. 'Member cap
 * reached' only surfaces to non-members — members of a capped pool can
 * still top up. */
export function SyndicateStatusTag({
  syndicate,
  assetUnitPriceGbp,
  viewerIsMember = false,
}: {
  syndicate: Syndicate;
  assetUnitPriceGbp: number;
  viewerIsMember?: boolean;
}) {
  const { colors } = useAppTheme();
  const phase = syndicatePhase(syndicate, { unitPriceGbp: assetUnitPriceGbp });
  let label: string;
  let dotColor: string;
  if (phase === 'executed') {
    label = 'Executed';
    dotColor = colors.textMuted;
  } else if (phase === 'dissolved') {
    label = 'Dissolved';
    dotColor = colors.textMuted;
  } else if (phase === 'funded') {
    label = 'Fully funded';
    dotColor = colors.antiqueGold;
  } else if (!viewerIsMember && isMemberCapReached(syndicate)) {
    label = 'Member cap reached';
    dotColor = colors.antiqueGold;
  } else {
    label = 'Open';
    dotColor = colors.coownUp;
  }
  return (
    <View style={styles.tag}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
