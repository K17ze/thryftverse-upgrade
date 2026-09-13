import { Platform, StyleSheet } from 'react-native';
import { Space, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/** Screen-level styles for MakeOfferScreen — extracted to keep the
 *  orchestrator under the size budget. All colours are applied inline at
 *  the call sites, so this stays a static sheet shared by the make-offer
 *  section components. */
export const makeOfferScreenStyles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl },
  // ── Item summary ──
  itemSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md },
  itemThumb: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' },
  itemThumbImage: {
    width: '100%',
    height: '100%' },
  itemInfo: {
    flex: 1,
    gap: Space.xs },
  itemTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  itemListingPrice: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Message seller action ──
  messageAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + Space.xs,
    minHeight: Control.hit },
  messageActionText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Price input section ──
  priceSection: {
    paddingTop: Space.lg,
    paddingBottom: Space.md },
  sectionLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.md },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: Stroke.emphasis,
    paddingBottom: Space.xs },
  currencySymbol: {
    fontSize: TypographyV2.display.size,
    fontFamily: TypographyV2.display.fontFamily,
    marginRight: Space.sm },
  priceInput: {
    flex: 1,
    fontSize: TypographyV2.display.size + 8,
    fontFamily: TypographyV2.display.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing * 2,
    paddingVertical: Space.sm },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.sm },
  discountText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Quick offer chips ──
  quickOfferRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md },
  quickOfferChip: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    gap: Space.xs / 2 },
  quickOfferChipLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  quickOfferChipSub: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Context rows (counter-offer, seller minimum) ──
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm },
  contextText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Counter-offer side-by-side compare ──
  counterCompareBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md },
  counterCompareCol: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2 },
  counterCompareLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase' },
  counterCompareValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  // ── Expiry section ──
  expirySection: {
    paddingTop: Space.lg,
    paddingBottom: Space.md },
  expiryRow: {
    flexDirection: 'row',
    gap: Space.sm },
  expiryChip: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center' },
  expiryChipText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  expiryHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.sm },
  // ── Summary section ──
  summarySection: {
    paddingTop: Space.lg },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  summaryLabelCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  summaryLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  summaryValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    minHeight: Control.hit },
  totalLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  totalValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] },
  // ── Trust signal ──
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    paddingTop: Space.lg },
  trustText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Error ──
  errorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  errorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.sm + 2 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit },
  retryBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Footer ──
  footer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Platform.OS === 'ios' ? Space.lg : Space.md,
    borderTopWidth: StyleSheet.hairlineWidth },
  sendBtn: {
    width: '100%' },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md },
  footerLoadingText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  // ── Review overlay ──
  reviewOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100 },
  reviewBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent' },
  reviewSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Platform.OS === 'ios' ? Space.xl : Space.lg,
    maxHeight: '85%' },
  reviewHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Space.md },
  reviewTitle: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    marginBottom: Space.md },
  reviewItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginBottom: Space.md },
  reviewItemInfo: {
    flex: 1,
    gap: Space.xs / 2 },
  reviewItemTitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  reviewItemPrice: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  reviewAmountBox: {
    borderRadius: Radius.lg,
    padding: Space.md,
    alignItems: 'center',
    marginBottom: Space.md },
  reviewAmountLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs },
  reviewAmountValue: {
    fontSize: TypographyV2.display.size,
    fontFamily: TypographyV2.display.fontFamily,
    fontVariant: ['tabular-nums'] },
  reviewCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent' },
  reviewCompareItem: {
    alignItems: 'center',
    flex: 1 },
  reviewCompareLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs / 2 },
  reviewCompareValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  reviewExpiry: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.sm,
    textAlign: 'center' },
  reviewSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  reviewSummaryLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  reviewSummaryValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  reviewTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    minHeight: Control.hit },
  reviewTotalLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  reviewTotalValue: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    fontVariant: ['tabular-nums'] },
  reviewActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.lg },
  reviewCancelBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    minHeight: Control.hit },
  reviewCancelText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  reviewConfirmBtn: {
    flex: 1 } });
