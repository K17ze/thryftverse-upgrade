import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * Shared stylesheet for the Agent Studio screen and every extracted section
 * component. Theme-only — identical keys/values to the original monolith's
 * createStyles so each section renders pixel-identically.
 */
export function createAgentStudioStyles(colors: ThemeColors) {
  return StyleSheet.create({
    summaryWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md },
    summaryTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight },
    summarySubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs / 2 },
    flatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
      minHeight: Control.hit },
    flatRowText: {
      flex: 1,
      minWidth: 0 },
    flatRowTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    flatRowSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: Space.xs / 2 },
    flatRowCaveat: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: Space.xs / 2,
      lineHeight: TypographyV2.meta.lineHeight },
    flatRowSeparator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: Space.md + Control.icon + Space.sm },
    loadingWrap: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      justifyContent: 'center' },
    sectionLabelWrap: {
      paddingBottom: Space.sm },
    sectionLabel: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      letterSpacing: TypographyV2.label.letterSpacing,
      textTransform: 'uppercase' },
    providerRow: {
      paddingVertical: Space.md },
    providerHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm },
    providerIdentity: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      flex: 1,
      minWidth: 0 },
    providerNameWrap: {
      flex: 1,
      minWidth: 0 },
    providerName: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    providerDesc: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs / 2 },
    providerStatus: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      flexShrink: 0,
      textAlign: 'right' },
    connectedBody: {
      marginTop: Space.sm,
      gap: Space.xs },
    keyDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      borderRadius: Radius.md },
    keyText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      flex: 1 },
    baseUrlText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    validNote: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    storageNote: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    connectCta: {
      marginTop: Space.sm,
      gap: Space.sm },
    connectHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    editBody: {
      marginTop: Space.sm,
      gap: Space.sm },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      backgroundColor: colors.input },
    input: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      padding: 0,
      minHeight: Space.lg },
    modelsWrap: {
      gap: Space.xs },
    modelsLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    modelDiscovering: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    modelHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    modelsList: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight + 2 },
    testResult: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Space.sm,
      marginTop: Space.xs },
    primaryBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    primaryBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    secondaryBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    secondaryBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    securityNote: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginTop: Space.lg,
      marginBottom: Space.md },
    securityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs },
    securityTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    securityBody: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      letterSpacing: TypographyV2.meta.letterSpacing },
    // Server connections (Phase 3)
    connectFormBody: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      gap: Space.sm },
    providerSelectorWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs },
    providerChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard },
    providerChipText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    providerChipSoon: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    serverConnectionRow: {
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      gap: Space.xs },
    serverConnectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm },
    emptyServerConnections: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md },
    deviceLocalNote: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      paddingBottom: Space.sm },
    confirmWrap: {
      marginHorizontal: Space.md,
      marginTop: Space.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      borderRadius: Radius.md,
      gap: Space.xs },
    confirmTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    confirmBody: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight },
    toast: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      marginHorizontal: Space.md,
      marginTop: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard },
    toastText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight },
    // Agent Studio hub (Phase 7)
    statusSkeleton: {
      gap: Space.xs },
    skeletonLine: {
      height: 14,
      borderRadius: Radius.sm },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + Space.xs,
      paddingHorizontal: Space.md },
    skeletonIcon: {
      width: Space.lg + Space.xs,
      height: Space.lg + Space.xs,
      borderRadius: Radius.sm },
    skeletonCopy: {
      flex: 1,
      gap: Space.xs },
    agentListSkeleton: {
      gap: 0 },
    emptyAgents: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md },
    emptyText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight + 1 },
    createAgentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
      minHeight: Control.hit },
    createAgentText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    pendingAction: {
      minHeight: 44,
      justifyContent: 'center',
      marginTop: Space.xs,
      paddingVertical: Space.xs },
    pendingActionText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    sectionHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    collapseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.sm },
    collapseHeaderLeft: {
      flex: 1,
      gap: Space.xs / 2 } });
}

export type AgentStudioStyles = ReturnType<typeof createAgentStudioStyles>;
