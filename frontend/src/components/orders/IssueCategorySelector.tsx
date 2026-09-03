import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Control, ZIndex } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';
import { t } from '../../i18n';

// Inline expansion that lets the buyer pick a specific issue type before
// navigating to support. Object-specific categories per spec:
// item not as described, damaged, wrong item, counterfeit/authenticity,
// parcel issue, missing contents.

export type IssueCategory = {
  id: string;
  label: string;
  description: string;
};

const ISSUE_CATEGORIES: IssueCategory[] = [
  { id: 'not_as_described', label: t('orderDetail.issue.notAsDescribed.label'), description: t('orderDetail.issue.notAsDescribed.desc') },
  { id: 'damaged', label: t('orderDetail.issue.damaged.label'), description: t('orderDetail.issue.damaged.desc') },
  { id: 'wrong_item', label: t('orderDetail.issue.wrongItem.label'), description: t('orderDetail.issue.wrongItem.desc') },
  { id: 'counterfeit', label: t('orderDetail.issue.counterfeit.label'), description: t('orderDetail.issue.counterfeit.desc') },
  { id: 'parcel_issue', label: t('orderDetail.issue.parcelIssue.label'), description: t('orderDetail.issue.parcelIssue.desc') },
  { id: 'missing_contents', label: t('orderDetail.issue.missingContents.label'), description: t('orderDetail.issue.missingContents.desc') },
];

export function IssueCategorySelector({
  onSelect,
  onClose,
  contextualIssues }: {
  onSelect: (category: IssueCategory) => void;
  onClose: () => void;
  contextualIssues?: IssueCategory[];
}) {
  const { colors } = useAppTheme();
  const themed = useMemo(() => ({
    sheetBackdrop: { backgroundColor: colors.overlay },
    sheet: { backgroundColor: colors.surface },
    title: { color: colors.textPrimary },
    sub: { color: colors.textSecondary },
    row: { borderBottomColor: colors.borderSubtle },
    rowLabel: { color: colors.textPrimary },
    rowDesc: { color: colors.textMuted },
    cancelBtn: { color: colors.textMuted },
    contextHeader: { color: colors.textMuted } }), [colors]);

  const hasContextual = contextualIssues && contextualIssues.length > 0;

  return (
    <View style={styles.issueSheetBackdrop} accessibilityRole="alert">
      <Pressable style={[styles.issueSheetBackdropPress, themed.sheetBackdrop]} onPress={onClose} accessibilityLabel="Close issue category selector" />
      <View style={[styles.issueSheet, themed.sheet]}>
        <Text style={[styles.issueSheetTitle, themed.title]}>{t('orderDetail.issueSelector.title')}</Text>
        <Text style={[styles.issueSheetSub, themed.sub]}>
          {t('orderDetail.issueSelector.subtitle')}
        </Text>

        {/* Contextual issues — specific to the current order state, shown first */}
        {hasContextual ? (
          <>
            <Text style={[styles.issueContextHeader, themed.contextHeader]}>{t('orderDetail.issueSelector.contextHeader')}</Text>
            {contextualIssues!.map((category) => (
              <Pressable
                key={category.id}
                style={({ pressed }) => [styles.issueRow, themed.row, pressed && styles.issueRowPressed]}
                onPress={() => { haptics.tap(); onSelect(category); }}
                accessibilityRole="button"
                accessibilityLabel={category.label}
              >
                <View style={styles.issueRowText}>
                  <Text style={[styles.issueRowLabel, themed.rowLabel]}>{category.label}</Text>
                  <Text style={[styles.issueRowDesc, themed.rowDesc]} numberOfLines={2}>{category.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
              </Pressable>
            ))}
            <Text style={[styles.issueContextHeader, themed.contextHeader]}>{t('orderDetail.issueSelector.otherHeader')}</Text>
          </>
        ) : null}

        {ISSUE_CATEGORIES.map((category) => (
          <Pressable
            key={category.id}
            style={({ pressed }) => [styles.issueRow, themed.row, pressed && styles.issueRowPressed]}
            onPress={() => { haptics.tap(); onSelect(category); }}
            accessibilityRole="button"
            accessibilityLabel={category.label}
          >
            <View style={styles.issueRowText}>
              <Text style={[styles.issueRowLabel, themed.rowLabel]}>{category.label}</Text>
              <Text style={[styles.issueRowDesc, themed.rowDesc]} numberOfLines={2}>{category.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
          </Pressable>
        ))}
        <Pressable
          style={({ pressed }) => [styles.issueCancelBtn, pressed && styles.issueCancelBtnPressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('orderDetail.issueSelector.cancelA11y')}
        >
          <Text style={[styles.issueCancelBtnText, themed.cancelBtn]}>{t('orderDetail.issueSelector.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  issueSheetBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: ZIndex.modal,
    justifyContent: 'flex-end' },
  issueSheetBackdropPress: {
    ...StyleSheet.absoluteFill },
  issueSheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.xl,
    gap: Space.xs },
  issueSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  issueSheetSub: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    marginBottom: Space.sm },
  issueContextHeader: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.size + 4,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginTop: Space.sm,
    marginBottom: Space.xs },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  issueRowPressed: {
    opacity: 0.6 },
  issueRowText: {
    flex: 1,
    gap: Space.xxs },
  issueRowLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  issueRowDesc: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  issueCancelBtn: {
    paddingVertical: Space.sm + 2,
    marginTop: Space.sm,
    alignItems: 'center',
    minHeight: Control.hit,
    justifyContent: 'center' },
  issueCancelBtnPressed: {
    opacity: 0.6 },
  issueCancelBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing } });
