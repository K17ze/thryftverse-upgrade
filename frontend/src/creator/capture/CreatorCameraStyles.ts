import { StyleSheet } from 'react-native';
import { Typography, Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// ── CreatorCamera styles ──────────────────────────────────────────────
// Static StyleSheet for the camera surface. Theme colours are applied via
// inline overrides at the call sites (see the overlay-text-colour note on
// `btnPressed` below) because StyleSheet.create cannot reference tokens.

// Shutter constants kept in sync with ShutterButton.tsx (78pt outer, 60pt inner).
const CORNER_SIZE = 32;
const CORNER_STROKE = 2;
// Camera countdown shutter glyph — not a typographic token. This is a
// large display effect glyph for the countdown overlay, not body text.
const SHUTTER_GLYPH_SIZE = 96;

export const styles = StyleSheet.create({
  // ── Camera initialization loading overlay ──
  cameraInitOverlay: {
    ...StyleSheet.absoluteFill,
    // backgroundColor applied inline via colors.mediaOverlayScrim
  },
  cameraInitSpinnerWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  cameraInitSpinner: {
    width: 24,
    height: 24,
    borderRadius: Radius.lg,
    borderWidth: 2,
    // borderColor / borderTopColor applied inline via scrim text tokens
  },
  cameraInitLabel: {
    marginTop: Space.sm,
    fontSize: TypographyV2.caption.size,
    // color applied inline via colors.scrimTextSecondary
    fontFamily: Typography.family.regular },
  cameraInitErrorBtn: {
    marginTop: Space.md,
    height: 50,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  cameraInitErrorBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  cameraInitErrorGalleryBtn: {
    marginTop: Space.sm,
    height: 44,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center' },
  cameraInitErrorGalleryText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  // ── Camera-overlay text colours ────────────────────────────────────
  // The camera preview is always dark regardless of app theme, so overlay
  // controls (brackets, crosshair, grid, labels, shutter ring, review
  // secondary actions) use the theme's scrim text tokens —
  // `scrimTextPrimary`, `scrimTextSecondary`, `scrimTextTertiary` — which
  // resolve to white / rgba-white in both light and dark themes. The
  // `mediaOverlayScrim` token is used for pill backgrounds. These are
  // applied via inline overrides above because StyleSheet.create is static
  // and cannot reference theme tokens. Semantic colours (danger,
  // antiqueGold) and non-overlay surfaces (review overlay, primary button)
  // use theme tokens directly.
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }] },
  // Gradient overlays
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120 },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140 },
  // One geometry owner for rule-of-thirds, framing corners and crosshair.
  captureGuideViewport: {
    position: 'absolute' },
  // Framing frame — the aspect-ratio-fitted guide rect inside the measured
  // viewport. Brackets and crosshair are positioned relative to this frame
  // so they describe the actual capture crop, not the available space.
  framingFrame: {
    position: 'absolute' },
  // Grid overlay (rule-of-thirds)
  gridOverlay: {
    ...StyleSheet.absoluteFill },
  gridLineV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  gridLineV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  gridLineH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  gridLineH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  // Capture flash — full-screen white overlay
  captureFlash: {
    ...StyleSheet.absoluteFill,
    // backgroundColor applied inline via colors.scrimTextPrimary
  },
  // Countdown overlay
  countdownOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  countdownText: {
    fontFamily: Typography.family.bold,
    fontSize: SHUTTER_GLYPH_SIZE,
    // color applied inline via colors.scrimTextPrimary
    // textShadowColor applied inline via colors.shadow
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8 },
  // Corner brackets — refined 1.5pt stroke, 6pt radius
  bracketTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    // borderColor applied inline via colors.scrimTextSecondary
    borderTopLeftRadius: 6 },
  bracketTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    // borderColor applied inline via colors.scrimTextSecondary
    borderTopRightRadius: 6 },
  bracketBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    // borderColor applied inline via colors.scrimTextSecondary
    borderBottomLeftRadius: 6 },
  bracketBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    // borderColor applied inline via colors.scrimTextSecondary
    borderBottomRightRadius: 6 },
  // Crosshair — centered in the framing guide area
  crosshair: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 16,
    height: 16,
    marginLeft: -8,
    marginTop: -8,
    alignItems: 'center',
    justifyContent: 'center' },
  crosshairH: {
    position: 'absolute',
    width: 16,
    height: 1,
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: 16,
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: Space.sm },
  topRightControls: {
    flexDirection: 'row',
    gap: 8 },
  // Top bar buttons — transparent 44pt targets
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  // Flash active state — subtle accent background so the user can read
  // the toggle state at a glance without a heavy fill.
  topIconBtnActive: {
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  // ── Multi-snap staging tray ──
  // A persistent horizontal row of captured thumbnails below the top bar.
  // Flat canvas, hairline-edged thumbs, no enclosing card.
  stagingTray: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 15 },
  stagingTrayContent: {
    gap: 6,
    alignItems: 'center' },
  stagingThumbWrap: {
    position: 'relative' },
  // 36x48pt thumbnail — compact and elegant. 2pt ring, 4px radius.
  stagingThumb: {
    width: 36,
    height: 48,
    borderRadius: Radius.sm,
    borderWidth: Stroke.emphasis,
    // borderColor applied inline via colors.scrimTextPrimary
  },
  // Video captures have no decodable still — a dark tile carrying the
  // play glyph and duration reads as media, not a broken image.
  stagingThumbVideo: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2 },
  stagingThumbDuration: {
    fontSize: Typography.size.micro,
    fontFamily: Typography.family.medium },
  // Order index badge — 12pt diameter, bottom-left.
  stagingOrderBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 12,
    height: 12,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.mediaOverlayScrim
    alignItems: 'center',
    justifyContent: 'center' },
  stagingOrderText: {
    // color applied inline via colors.scrimTextPrimary
    fontSize: Typography.size.micro,
    fontFamily: Typography.family.medium },
  // Done button — finishes multi-capture and enters the editor.
  // Compact pill with a checkmark that commits the accumulated batch.
  stagingDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.scrimTextTertiary
  },
  stagingDoneText: {
    // color applied inline via colors.scrimTextPrimary
    fontSize: TypographyV2.caption.size,
    fontFamily: Typography.family.semibold },
  // Bottom bar — gallery (left) | shutter (center) | flip (right).
  // The viewfinder dominates; controls are compact and purposeful.
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Space.lg,
    paddingTop: 10,
    minHeight: 100 },
  // Slide-to-lock pill — floats up-left of the shutter while a hold
  // recording is live (Snap grammar). pointerEvents none; hit-tested
  // against the held finger's screen coordinates.
  recordLockPill: {
    position: 'absolute',
    alignSelf: 'center',
    top: -56,
    marginLeft: -120,
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor applied inline (brand when hot, scrim otherwise)
  },
  // Flip camera — transparent 44pt target. No persistent dark plate; the
  // bottom scrim provides legibility over bright previews.
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  // Flip press feedback — subtle background circle only while pressed.
  // Applied inline via colors.scrimTextTertiary + scale transform.
  flipBtnPressed: {
    // backgroundColor / transform applied inline
  },
  // Recording dot — used inside the consolidated status pill.
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.danger (theme token)
  },
  recordingTimerText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.caption.size,
    // color applied inline via colors.scrimTextPrimary
    fontVariant: ['tabular-nums'] },
  // Muted recording indicator — mic-off icon shown when recording without audio
  mutedIndicator: {
    marginLeft: 2,
    opacity: 0.8 },
  // Quick-review overlay
  reviewOverlay: {
    ...StyleSheet.absoluteFill,
    // backgroundColor applied inline via colors.background (theme token)
    zIndex: 100 },
  reviewImage: {
    ...StyleSheet.absoluteFill,
    resizeMode: 'contain' },
  // Top scrim for the review overlay — ensures any top chrome is legible
  // over bright captures (white backgrounds, light product photography).
  reviewTopScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100 },
  reviewActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Space.xl,
    paddingTop: Space.md },
  reviewBtn: {
    alignItems: 'center',
    gap: 6 },
  reviewBtnLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.captionElevated.size,
    // color applied inline via colors.scrimTextPrimary
  },
  reviewPrimaryBtn: {
    height: 52,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.textPrimary (theme token)
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Space.xs },
  reviewPrimaryPressed: {
    transform: [{ scale: 0.97 }] },
  reviewPrimaryLabel: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.captionElevated.size,
    // color applied inline via colors.background (theme token)
  },
  // ── Consolidated status region (replaces separate top badges) ──
  statusRegion: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  statusPillText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size,
    letterSpacing: 0.3,
  },
  // ── Simplified review actions ──
  reviewRetakeBtn: {
    position: 'absolute',
    left: Space.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  reviewRetakePressed: {
    opacity: 0.6,
  },
  reviewRetakeText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
  },
  reviewPrimaryWrap: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    bottom: 0,
  },
  reviewPrimaryFullBtn: {
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewPrimaryFullLabel: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.bodyStrong.size,
  },
  // ── Green screen thumbnail (used inside the consolidated status pill) ──
  greenScreenThumb: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm },
  });
