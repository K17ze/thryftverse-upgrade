import { StyleSheet } from 'react-native';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';

/**
 * Screen-level styles for OrderDetailScreen — extracted to keep the
 * orchestrator under the size budget.
 *
 * The static sheet contains only non-color properties; all colours are
 * applied through `createOrderDetailThemedStyles` (or inline) so the
 * screen is fully dark-mode compatible.
 */
export const orderDetailScreenStyles = StyleSheet.create({
  container: {
    flex: 1 },
  headerBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  headerBtnPressed: {
    opacity: 0.5 },
  retryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }] },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  errorTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center' },
  errorBody: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight },
  retryBtn: {
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center' },
  retryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  statusHeader: {
    paddingVertical: Space.md,
    gap: Space.xs + 2 },
  // Order number — clear reference, captionElevated with tabular-nums
  orderNumber: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.xs / 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full },
  statusDot: {
    width: Space.sm - 1,
    height: Space.sm - 1,
    borderRadius: Radius.full },
  statusBadgeText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  statusExplanation: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  lastUpdated: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2 },
  refreshErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs },
  refreshErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  retryLink: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.lg },
  timelineSection: {
    paddingVertical: Space.sm },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.md },
  staleText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    opacity: 0.7 },
  // ─── Latest event summary — one muted text line, not a card ───
  latestEventLine: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.sm },
  // ─── Dispatch extension — quiet inline card, hairline border, no fill ───
  extensionCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm },
  extensionHeader: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'flex-start' },
  extensionHeaderText: {
    flex: 1,
    gap: 2 },
  extensionTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  extensionSub: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.size + 4 },
  extensionActions: {
    flexDirection: 'row',
    gap: Space.xs + 2 },
  extensionAcceptBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    minHeight: Control.hit },
  extensionDeclineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  extensionActionText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  extensionPendingLine: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.size + 4,
    marginHorizontal: Space.md,
    marginBottom: Space.sm },
  // ─── Package contents ───
  packageContentsWrap: {
    marginBottom: Space.sm },
  packageContentsLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.xs } });

/**
 * Theme-aware color overrides for the static styles. The static
 * StyleSheet contains only non-color properties; colors are applied
 * via this themed proxy so the screen is fully dark-mode compatible.
 */
export function createOrderDetailThemedStyles(colors: ThemeColors) {
  return {
    container: { backgroundColor: colors.background },
    errorTitle: { color: colors.textPrimary },
    errorBody: { color: colors.textMuted },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    orderNumber: { color: colors.textMuted },
    statusExplanation: { color: colors.textSecondary },
    lastUpdated: { color: colors.textMuted },
    refreshErrorText: { color: colors.textMuted },
    retryLink: { color: colors.brand },
    sectionDivider: { backgroundColor: colors.border },
    staleBanner: { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder },
    staleText: { color: colors.warning },
    detailLabel: { color: colors.textSecondary } };
}
