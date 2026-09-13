/**
 * CoOwnDossierRibbon — compact horizontal chip bar that replaces the
 * inline provenance grid, condition/custody rows, and fee section on
 * the Overview tab.
 *
 * Pillar 2 of the Co-Own detail upgrade (September 2026):
 *   - Masterworks "Digital Asset Passport" pattern — a compact metadata
 *     ribbon on the main screen; full disclosures one tap away in a
 *     bottom sheet.
 *   - Eliminates ~400px of card clutter from the Overview tab.
 *   - Flat on canvas, hairline-separated, no card fill, no shadow.
 *
 * Each chip is a quiet metadata fragment (condition grade, custodian,
 * insured status, fee rate). The whole ribbon is a single 44pt-tall
 * Pressable that opens the CoOwnAssetDossierSheet. Individual chips are
 * not separately tappable — the ribbon is one disclosure affordance,
 * not a row of independent buttons (anti-AI: no label-everything disease).
 *
 * Anti-AI compliance:
 *   - One icon family (Ionicons outline, 14pt metadata glyphs).
 *   - One stroke grammar (hairline top + bottom separators).
 *   - No pills around individual chips — text fragments separated by
 *     middots, the way Masterworks and Robinhood render compact metadata.
 *   - The chevron is the single visible "this opens something" signal.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, PressScale } from '../../../theme/designTokens';
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

  // When no dossier metadata exists, render a minimal "View dossier" row
  // so the affordance is still present (the sheet may carry provenance
  // text, rights, or risk disclosures even without structured fields).
  const hasFragments = fragments.length > 0;

  return (
    <Pressable
      onPress={onOpenDossier}
      hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
      style={({ pressed }) => [
        styles.ribbon,
        { borderTopColor: colors.borderSubtle, borderBottomColor: colors.borderSubtle },
        pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] },
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
        name="shield-checkmark-outline"
        size={14}
        color={colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        style={[styles.fragments, { color: colors.textSecondary }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {hasFragments ? fragments.join('  ·  ') : 'View dossier'}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={14}
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
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fragments: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
