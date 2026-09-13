import { StyleSheet } from 'react-native';
import { Space, FontFamily, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * Style factory for the Settings screen and its extracted section
 * components. Centralised so the orchestrator and the section components
 * share one source of truth.
 */
export function createSettingsScreenStyles() {
  return StyleSheet.create({
    searchField: {
      height: 48 },
    // ── Search empty state ──
    emptySearch: {
      paddingVertical: Space.lg,
      alignItems: 'center' },
    emptySearchText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular },
    // ── Account health indicator ──
    healthRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      marginBottom: Space.sm },
    healthPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xxs + 1,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xxs + 1,
      borderRadius: Radius.full },
    healthPillText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.meta.letterSpacing },
    // Thryft Balance Card
    balanceCard: {
      marginHorizontal: Space.md,
      marginTop: Space.xs,
      marginBottom: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 4,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    balanceCardLeft: {
      gap: 2,
    },
    balanceCardLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      letterSpacing: TypographyV2.caption.letterSpacing,
    },
    balanceCardValue: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    balanceCardRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    walletJumpBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    walletJumpBtnText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600',
    },
  });
}

export type SettingsScreenStyles = ReturnType<typeof createSettingsScreenStyles>;
