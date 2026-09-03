/**
 * CoOwnRightsSheet — modal with the 13-row rights table (§01 §4).
 *
 * Each row must have an answer or "To be confirmed" — never blank.
 * "To be confirmed" is acceptable only in prelaunch preview; a live
 * market instrument must never show "Rights TBC" (audit blocker 5).
 * Each row expands to a plain-language answer + "View document" link.
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A8 + 01 §4.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface CoOwnRightsRow {
  label: string;
  answer: string;
  documentUri?: string;
  /** True if this row is "To be confirmed" — only acceptable for prelaunch. */
  isTbc?: boolean;
}

export interface CoOwnRightsSheetProps {
  visible: boolean;
  onClose: () => void;
  rights: CoOwnRightsRow[];
  disclosureVersion: string;
}

/** The 13 canonical rights labels (§01 §4). */
export const CANONICAL_RIGHTS_LABELS: readonly string[] = [
  'Title holder',
  'Your interest',
  'Voting rights',
  'Distributions',
  'Operating costs',
  'Reserve',
  'Borrowing',
  'Dilution / pre-emption',
  'Transfer eligibility',
  'Use / access rights',
  'Exit & proceeds',
  'If costs exceed reserves',
  'Insolvency priority',
] as const;

function RightsRowItem({
  row,
  colors,
}: {
  row: CoOwnRightsRow;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.rowItem, { borderColor: colors.border }]}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={styles.rowHeader}
        accessibilityRole="button"
        accessibilityLabel={`${row.label}: ${row.answer}`}
        accessibilityHint="Tap to expand"
      >
        <Text
          style={[
            styles.rowLabel,
            { color: colors.textPrimary },
            row.isTbc && { color: colors.warning },
          ]}
          numberOfLines={expanded ? undefined : 1}
        >
          {row.label}
        </Text>
        <View style={styles.rowRight}>
          {row.isTbc && (
            <View style={[styles.tbcBadge, { backgroundColor: colors.warningSubtle }]}>
              <Text style={[styles.tbcBadgeText, { color: colors.warning }]}>TBC</Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.rowExpanded}>
          <Text style={[styles.rowAnswer, { color: colors.textSecondary }]}>
            {row.answer}
          </Text>
          {row.documentUri && (
            <Pressable
              onPress={() => Linking.openURL(row.documentUri!)}
              style={[styles.docLink, { borderColor: colors.border }]}
              accessibilityRole="link"
              accessibilityLabel="View document"
            >
              <Ionicons name="document-text-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.docLinkText, { color: colors.textSecondary }]}>
                View document
              </Text>
              <Ionicons name="open-outline" size={11} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function CoOwnRightsSheet({
  visible,
  onClose,
  rights,
  disclosureVersion,
}: CoOwnRightsSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const tbcCount = rights.filter((r) => r.isTbc).length;
  const hasTbc = tbcCount > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.borderSubtle }]} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Rights & risks
            </Text>
            <View style={[styles.versionBadge, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.versionBadgeText, { color: colors.textMuted }]}>
                {disclosureVersion}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* TBC warning banner */}
        {hasTbc && (
          <View style={[styles.tbcBanner, { backgroundColor: colors.warningSubtle }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={[styles.tbcBannerText, { color: colors.warning }]}>
              {tbcCount} {tbcCount === 1 ? 'row' : 'rows'} to be confirmed — not yet tradable
            </Text>
          </View>
        )}

        {/* Rights list */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: Space.lg }}
        >
          {rights.map((row, i) => (
            <RightsRowItem key={i} row={row} colors={colors} />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.sm,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  headerTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  versionBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  versionBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tbcBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    borderRadius: Radius.md,
  },
  tbcBannerText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    flex: 1,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  rowItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    minHeight: 28,
  },
  rowLabel: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  tbcBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  tbcBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  rowExpanded: {
    marginTop: Space.sm,
    gap: Space.sm,
  },
  rowAnswer: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 2,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  docLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  docLinkText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});

export default CoOwnRightsSheet;
