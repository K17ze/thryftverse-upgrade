/** One dossier destination with a stable label and a short factual preview.
 * Full metadata remains in the accessible label and existing dossier sheet.
 * Navigation uses a neutral document icon; verification is never implied.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { MarketCoOwnAsset } from '../../../services/marketApi';

export interface CoOwnDossierRibbonProps {
  asset: MarketCoOwnAsset;
  onOpenDossier: () => void;
}

/** Build the compact metadata fragments from the asset contract.
 *  Each fragment is a short string; fragments are omitted when the
 *  underlying data is absent (truthful absence, not placeholder copy). */
function buildFragments(asset: MarketCoOwnAsset): string[] {
  const fragments: string[] = [];
  if (asset.conditionGrade) fragments.push(`Condition ${asset.conditionGrade}`);
  if (asset.custodianName || asset.custodianLocation) {
    const custody = [asset.custodianName, asset.custodianLocation]
      .filter(Boolean)
      .join(' · ');
    fragments.push(custody);
  }
  if (asset.custodyInsured) fragments.push('Insured');
  if (asset.authenticityStatus === 'verified') fragments.push('Authenticated');
  if (asset.tradingFeeRate != null) {
    const pct = (asset.tradingFeeRate * 100).toFixed(2).replace(/\.00$/, '');
    fragments.push(`${pct}% fee`);
  }
  return fragments;
}

export function CoOwnDossierRibbon({ asset, onOpenDossier }: CoOwnDossierRibbonProps) {
  const { colors } = useAppTheme();
  const fragments = buildFragments(asset);
  const preview = [
    asset.conditionGrade ? `Condition ${asset.conditionGrade}` : null,
    asset.tradingFeeRate != null ? `${(asset.tradingFeeRate * 100).toFixed(2).replace(/\.00$/, '')}% trading fee` : null,
  ].filter(Boolean).join(' · ');

  // When no dossier metadata exists, render a minimal "View dossier" row
  // so the affordance is still present (the sheet may carry provenance
  // text, rights, or risk disclosures even without structured fields).
  const hasFragments = fragments.length > 0;

  return (
    <Pressable
      onPress={onOpenDossier}
      style={({ pressed }) => [
        styles.ribbon,
        { borderTopColor: colors.borderSubtle, borderBottomColor: colors.borderSubtle },
        pressed && { opacity: 0.65 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        hasFragments
          ? `Asset dossier: ${fragments.join(', ')}. Tap to view full dossier.`
          : 'View asset dossier'
      }
      accessibilityHint="Opens the asset dossier with provenance, condition, custody, appraisal, fees, documents, and risk disclosure."
    >
      <Ionicons
        name="document-text-outline"
        size={20}
        color={colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>Asset dossier</Text>
        <Text style={[styles.fragments, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
          {preview || 'Condition, custody, fees & documents'}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, minWidth: 0, gap: Space.xxs },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  fragments: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
