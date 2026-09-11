import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius } from '../../../theme/designTokens';
import { TypographyV2, typographyV2Style } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset } from '../../../services/marketApi';
import { CommerceDetailDisclosureRow, CommerceDetailMetricRow } from '../../commerce/detail';
import type { DossierDocument } from './types';

interface Props {
  asset: MarketCoOwnAsset;
  appraisedValuePerUnitGbp: number | null;
  dossierDocuments: DossierDocument[];
  hasDocuments: boolean;
  onOpenDiligence: () => void;
  onOpenRiskDisclosure: () => void;
}

function dateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
}

/** Compact "MMM YYYY" formatter for the key-stats strip (e.g. "Jan 2024"). */
function monthYearLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : null;
}

interface TrustBadge {
  label: string;
  /** Status dot colour — commerceTrust for auth, success for insured custody. */
  dot: string;
  /** Subtle fill behind the badge. */
  fill: string;
}

interface KeyStat {
  label: string;
  value: string;
}

/**
 * A quiet group label inside the expanded disclosure. Uses the meta
 * typography role (11px medium) in the muted text colour — quiet enough
 * to structure the rows without competing with the metric values.
 */
function DetailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

/** The asset story stays visible; supporting evidence is available on demand. */
export function AssetOverviewDetails({
  asset, appraisedValuePerUnitGbp, dossierDocuments, hasDocuments, onOpenDiligence, onOpenRiskDisclosure,
}: Props) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = React.useState(false);
  const [failedDocument, setFailedDocument] = React.useState<DossierDocument | null>(null);
  React.useEffect(() => { setExpanded(false); setFailedDocument(null); }, [asset.id]);
  const openDocument = async (document: DossierDocument) => {
    setFailedDocument(null);
    try {
      if (!/^https?:\/\//i.test(document.url)) throw new Error('Unsupported document URL');
      await Linking.openURL(document.url);
    } catch {
      setFailedDocument(document);
    }
  };
  const valuationDate = dateLabel(asset.appraisalValuedAt);
  const listedMonthYear = monthYearLabel(asset.createdAt);
  const volume = asset.marketSnapshot?.volume24hGbp ?? asset.volume24hGbp;

  // ── Trust badges ──
  // Status indicators with meaningful containment: a subtle status-tinted
  // fill plus a coloured dot that encodes the trust dimension
  // (commerceTrust = authenticated, success = insured custody).
  const trustBadges: TrustBadge[] = [
    asset.authenticityStatus === 'verified'
      ? { label: 'Authenticated', dot: colors.commerceTrust, fill: colors.commerceTrustSubtle }
      : null,
    asset.custodyInsured
      ? { label: 'Insured custody', dot: colors.success, fill: colors.successSubtle }
      : null,
  ].filter((b): b is TrustBadge => b !== null);

  // ── Key stats strip ──
  // Always-visible market facts so the user sees the most important
  // numbers without expanding the disclosure. Hairline dividers, flat
  // canvas — no card chrome.
  const keyStats: KeyStat[] = [
    volume != null && Number.isFinite(volume)
      ? { label: '24h volume', value: formatCoOwnIze(volume) }
      : null,
    listedMonthYear ? { label: 'Listed', value: listedMonthYear } : null,
    asset.holders != null && Number.isFinite(asset.holders)
      ? { label: 'Holders', value: asset.holders.toLocaleString('en-GB') }
      : null,
    asset.totalTradedValueGbp != null && Number.isFinite(asset.totalTradedValueGbp)
      ? { label: 'All-time traded', value: formatCoOwnIze(asset.totalTradedValueGbp) }
      : null,
  ].filter((s): s is KeyStat => s !== null);

  return (
    <View style={styles.content}>
      {/* ── Asset story excerpt ──
          A body+semibold lead-in labels the excerpt, provenance stays at
          body, inline trust badges carry status colour, and a quiet
          diligence link closes the section. */}
      <View>
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>About this asset</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={3}>
          {asset.provenance || 'The asset story has not been published.'}
        </Text>
        {trustBadges.length > 0 ? (
          <View style={styles.trustRow}>
            {trustBadges.map((badge) => (
              <View key={badge.label} style={[styles.trustBadge, { backgroundColor: badge.fill }]}>
                <View style={[styles.trustDot, { backgroundColor: badge.dot }]} />
                <Text style={[styles.trustBadgeText, { color: colors.textSecondary }]}>{badge.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Pressable onPress={onOpenDiligence} accessibilityRole="link"
          accessibilityLabel="Read full asset story and due diligence"
          style={({ pressed }) => [styles.diligenceLink, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.diligenceLinkText, { color: colors.textSecondary }]}>
            Asset story & due diligence
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* ── Appraisal — the NAV moment ──
          A custom row where the per-unit appraisal is the dominant
          number (priceList, 20pt bold tabular-nums), with an honest
          sublabel so it can never be read as a tradable price. The
          trading fee stays a standard metric row — it is secondary. */}
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }}>
        <View style={styles.navRow}>
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>Appraisal / unit</Text>
          <View style={styles.navValueCluster}>
            <Text style={[styles.navValue, { color: colors.textPrimary }]}>
              {appraisedValuePerUnitGbp != null ? formatCoOwnIze(appraisedValuePerUnitGbp) : 'Not published'}
            </Text>
            <Text style={[styles.navSubLabel, { color: colors.textMuted }]}>
              Valuation estimate, not a tradable price
            </Text>
          </View>
        </View>
        <CommerceDetailMetricRow label="Trading fee"
          value={asset.tradingFeeRate != null
            ? `${(asset.tradingFeeRate * 100).toFixed(2).replace(/\.00$/, '')}% per execution`
            : 'Not published'} />
      </View>

      {/* ── Key stats strip ──
          Always visible. Market cap is not modelled per-asset, so the
          strip surfaces 24h volume, listed date, holders and all-time
          traded value — the facts a buyer scans before opening the
          full valuation disclosure. Hairline dividers, no chrome. */}
      {keyStats.length > 0 ? (
        <View style={styles.statStrip}>
          {keyStats.map((stat, index) => (
            <React.Fragment key={stat.label}>
              {index > 0 ? (
                <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
              ) : null}
              <View style={styles.statCell}>
                <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  {stat.label}
                </Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {stat.value}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}

      {/* ── Progressive disclosure — grouped details ──
          Collapsed by default. When expanded, rows are grouped under
          quiet labels so the user can scan by concern instead of
          reading a flat list of metric rows. The key stats strip above
          already surfaces the market facts, so the disclosure focuses
          on valuation custody, rights and documents. */}
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }}>
        <Pressable onPress={() => setExpanded(value => !value)} accessibilityRole="button"
          accessibilityLabel="Valuation, documents and asset details" accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.disclosure, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.disclosureLabel, styles.grow, { color: colors.textPrimary }]}>
            Valuation & asset details
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
        </Pressable>
        {expanded ? (
          <View style={styles.details}>
            <DetailGroup label="Valuation">
              <CommerceDetailMetricRow label="Valuer" value={asset.appraisalValuer || 'Not published'} />
              <CommerceDetailMetricRow label="Valuation date" value={valuationDate || 'Not published'} />
              {asset.conditionGrade ? <CommerceDetailMetricRow label="Condition" value={asset.conditionGrade} /> : null}
              {asset.custodianName || asset.custodianLocation ? (
                <CommerceDetailMetricRow label="Custody"
                  value={[asset.custodianName, asset.custodianLocation].filter(Boolean).join(' · ')} />
              ) : null}
            </DetailGroup>

            <DetailGroup label="Rights">
              {asset.rights?.version ? (
                <CommerceDetailMetricRow label="Rights version" value={String(asset.rights.version)} />
              ) : null}
              {asset.rights?.feeRights ? (
                <CommerceDetailMetricRow label="Operating costs" value={asset.rights.feeRights} />
              ) : null}
            </DetailGroup>

            <DetailGroup label="Documents">
              {hasDocuments && dossierDocuments.length ? dossierDocuments.map(document => (
                <Pressable key={document.url + document.label} onPress={() => void openDocument(document)}
                  accessibilityRole="link" accessibilityLabel={document.accessibilityLabel}
                  style={({ pressed }) => [styles.link, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={[styles.linkText, styles.grow, { color: colors.brand }]}>{document.label}</Text>
                  <Ionicons name="open-outline" size={18} color={colors.brand} />
                </Pressable>
              )) : (
                <Text style={[styles.caption, { color: colors.textSecondary }]}>
                  No supporting documents published.
                </Text>
              )}
              {failedDocument ? (
                <View accessibilityLiveRegion="polite">
                  <Text style={[styles.caption, { color: colors.warning }]}>
                    Could not open {failedDocument.label}.
                  </Text>
                  <Pressable onPress={() => void openDocument(failedDocument)} style={styles.link}
                    accessibilityRole="button" accessibilityLabel={`Retry opening ${failedDocument.label}`}>
                    <Text style={[styles.linkText, { color: colors.brand }]}>Try again</Text>
                  </Pressable>
                </View>
              ) : null}
            </DetailGroup>
          </View>
        ) : null}
      </View>

      <CommerceDetailDisclosureRow label="Risk disclosure" onPress={onOpenRiskDisclosure} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Space.lg },
  // ── Asset story ──
  // body + semibold lead-in gives the excerpt a clear heading without an
  // uppercase eyebrow (per TypographyV2 anti-AI rules).
  sectionLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
    marginBottom: Space.xs,
  },
  body: { fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight, fontFamily: FontFamily.regular },
  caption: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.regular },
  // ── Trust badges ──
  // Subtle status-tinted fill — containment is meaningful here (status
  // indicators), not decorative chrome. The coloured dot encodes the
  // trust dimension so the badge is scannable, not just readable.
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs, marginTop: Space.sm },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xxs,
    borderRadius: Radius.sm,
    gap: Space.xs,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  trustBadgeText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
  // ── Quiet diligence link ──
  // A muted text link with a small chevron, not a prominent button.
  // The user has already read the excerpt; this is a "read more" path.
  diligenceLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs,
    marginTop: Space.xs,
  },
  diligenceLinkText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
  // ── Appraisal NAV row ──
  // The per-unit appraisal is the dominant number on this surface:
  // priceList (20pt bold, tabular-nums). The label stays at body so the
  // value dominates; the sublabel is meta so it recedes.
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: 52,
  },
  navLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    flexShrink: 1,
  },
  navValueCluster: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 2,
  },
  navValue: {
    ...typographyV2Style('priceList'),
    textAlign: 'right',
  },
  navSubLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'right',
  },
  // ── Key stats strip ──
  // Flat canvas, hairline vertical dividers. Each cell is equal-width
  // (flex: 1) so the strip reads as a single band of facts, not a row
  // of cards. Values use body + semibold + tabular-nums for scanability.
  statStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: Space.sm,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Space.xs,
  },
  statCell: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  statValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Disclosure ──
  disclosure: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  disclosureLabel: { fontSize: TypographyV2.body.size, fontFamily: FontFamily.semibold },
  grow: { flex: 1 },
  details: { gap: Space.md, paddingBottom: Space.sm },
  // ── Group label ──
  // Quiet label-scale label that structures the expanded rows without
  // adding a second layer of section headers. Uses the 'label' role
  // which permits uppercase per TypographyV2.UPPERCASE_ALLOWED_ROLES.
  group: { gap: Space.xs },
  groupLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: TypographyV2.label.textTransform,
  },
  // ── Document links ──
  linkText: { fontSize: TypographyV2.body.size, fontFamily: FontFamily.semibold },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.xs },
});
