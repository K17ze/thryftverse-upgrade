import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/** Screen-level styles for LoginScreen — extracted verbatim to keep the
 *  orchestrator under the 400-LOC charter. Shared by the screen and the
 *  login section components so every key resolves identically. */
export function createLoginScreenStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xs },
  backBtn: { width: Control.hit, height: Control.hit, borderRadius: Radius.xxl, alignItems: 'center', justifyContent: 'center' },
  backBtnSpacer: { width: Control.hit, height: Control.hit },

  keyboardWrap: { flex: 1 },
  content: { flex: 1 },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.lg },
  title: { fontSize: TypographyV2.display.size, fontFamily: TypographyV2.display.fontFamily, color: colors.textPrimary, lineHeight: TypographyV2.display.lineHeight, letterSpacing: TypographyV2.display.letterSpacing },
  subtitle: { marginTop: Space.sm, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight, color: colors.textSecondary, fontFamily: TypographyV2.body.fontFamily, marginBottom: Space.md },

  form: { marginBottom: Space.lg },
  inputGroup: { marginBottom: Space.md },

  forgotBtn: { alignSelf: 'flex-start', marginTop: Space.sm },
  forgotText: { color: colors.textSecondary, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, textDecorationLine: 'underline' },
  primaryBtn: { backgroundColor: colors.brand, minHeight: Space.xxl + Space.sm, borderRadius: Radius.xxl + 4, borderWidth: 0, marginTop: Space.md + 2 },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    marginTop: Space.md + 2,
    marginBottom: Space.sm },
  socialDividerLine: {
    flex: 1,
    height: Stroke.hairline,
    backgroundColor: colors.border },
  socialDividerText: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps },
  socialGroup: {
    gap: Space.sm + 2,
    marginBottom: Space.sm },
  socialFullBtn: {
    flexDirection: 'row',
    height: Space.xxl + Space.xl + 4,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  socialFullText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: 0.1 },
  socialBtnDisabled: { opacity: 0.7 },
  dividerRow: {
    marginTop: Space.md + 2,
    marginBottom: Space.smMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2 },
  dividerLine: {
    flex: 1,
    height: Stroke.standard,
    backgroundColor: colors.border },
  dividerText: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps },
  otpRequestBtn: {
    minHeight: Control.hit + 2,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface },
  otpRequestText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  otpGroup: {
    marginTop: Space.sm + 6,
    gap: Space.sm + 2 },
  twoFactorGroup: {
    marginBottom: Space.md,
    gap: Space.sm },
  twoFactorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs },
  twoFactorIcon: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  twoFactorTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  twoFactorHint: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs / 2 },
  magicLinkBtn: {
    minHeight: Control.hit - 2,
    borderRadius: Radius.xxl,
    borderWidth: 0,
    backgroundColor: 'transparent',
    marginTop: Space.sm + 2 },
  magicLinkText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textDecorationLine: 'underline' },
  otpVerifyBtn: {
    minHeight: Space.xxl,
    borderRadius: Radius.xxl,
    borderWidth: 0,
    backgroundColor: colors.brand },
  otpVerifyText: {
    color: colors.textInverse,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  otpTwoFactorGroup: {
    marginTop: Space.sm,
    gap: Space.sm },
  otpTwoFactorBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.size + 4 },
  otpTwoFactorToggle: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center' },
  otpTwoFactorToggleText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textDecorationLine: 'underline' },
  otpTwoFactorCancel: {
    alignSelf: 'center',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    justifyContent: 'center' },
  otpTwoFactorCancelText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  footer: { paddingTop: Space.sm, position: 'relative' },
  infoText: { color: colors.success, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, textAlign: 'center', marginBottom: Space.md - 4 },
  errorText: { color: colors.danger, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, textAlign: 'center', marginBottom: Space.md - 4 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.textInverse, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily },
  switchRow: {
    marginTop: Space.sm + 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs + 2 },
  switchText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  switchLink: {
    color: colors.textPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textDecorationLine: 'underline' } });
}
