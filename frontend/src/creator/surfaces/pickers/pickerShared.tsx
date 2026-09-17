import React, {
  useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  Typography,
  Stroke,
  Elevation } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import {
  useAppTheme,
  type ThemeColors } from '../../../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../../../platform/keyboard/KeyboardProvider';
import {
  SheetContainer,
  PressScale } from '../../shared/CreatorAnimations';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { Motion } from '../../../theme/motionTokens';
import { withAlpha } from '../../../components/poster/shared/colorUtils';
import type { CreatorLayer } from '../../core/projectStore/composition';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation } from 'react-native-reanimated';

export function PickerShell({ title, onClose, children, compact }: { title: string; onClose: () => void; children: React.ReactNode; compact?: boolean }) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  return (
    <SheetContainer visible={true} onClose={onClose} compact={compact}>
      <KeyboardAwareScrollView contentContainerStyle={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ maxHeight: '100%' }}>
        <View style={styles.header}>
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker" accessibilityHint="Closes the picker sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} aria-hidden={true} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>
        {children}
      </KeyboardAwareScrollView>
    </SheetContainer>
  );
}

export function baseLayer(id: string, zIndex: number): Omit<CreatorLayer, 'type' | 'payload'> {
  return {
    id,
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.4,
    scale: 1,
    rotation: 0,
    zIndex,
    locked: false,
    hidden: false,
    opacity: 1 };
}

export const GRID_COLUMNS = 3;

// HSL → HEX converter for the spectrum color picker
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
// ── PermissionDeniedState — spring entrance with retry CTA ──
export function PermissionDeniedState({
  title,
  message,
  ctaLabel,
  onCta,
  colors,
  styles }: {
  title: string;
  message: string;
  ctaLabel: string;
  onCta: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const reduceMotion = useReducedMotion();
  const entranceSV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      // Per §5.14: entrance uses timing (ease-out), not spring.
      entranceSV.value = withDelay(100, withTiming(1, { duration: Motion.duration.slow, easing: Motion.easing.entrance }));
    }
  }, [reduceMotion, entranceSV]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceSV.value,
    transform: [{ translateY: interpolate(entranceSV.value, [0, 1], [20, 0], Extrapolation.CLAMP) }] }));

  return (
    <Reanimated.View style={[styles.mediaPermissionState, entranceStyle]}>
      <Text style={[styles.mediaPermissionTitle, { color: colors.textPrimary }]}>
        {title}
      </Text>
      <Text style={[styles.mediaPermissionText, { color: colors.textSecondary }]}>
        {message}
      </Text>
      <PressScale
        onPress={onCta}
        style={[styles.mediaPermissionBtn, { backgroundColor: colors.brand }]}
        accessibilityLabel={ctaLabel}
        accessibilityHint="Takes the suggested action"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[styles.mediaPermissionBtnText, { color: colors.textInverse }]}>{ctaLabel}</Text>
      </PressScale>
    </Reanimated.View>
  );
}
export const TEXT_COLORS = ['#ffffff', '#000000', '#9b0202', '#215634', '#06489A', '#C9A46A', '#8A6A3F', '#6B3245', '#E06666', '#B85566'];
export const RAINBOW_GRADIENT = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'] as const;
export const DEFAULT_STICKER_BG_COLOR = '#C9A46A';

// Content constant: the text-sticker preview stage mimics the dark document
// canvas in both themes, so it must not track the app background.
export const TEXT_PREVIEW_STAGE_BG = '#0d0d0d';
export const SHAPE_COLORS = ['#ffffff', '#000000', '#9b0202', '#215634', '#06489A', '#C9A46A', '#E06666', '#7B68EE'];
// ── Styles ─────────────────────────────────────────────────────────

export function createStyles(colors: ThemeColors, screenWidth: number) {
  const THUMB_SIZE = Math.floor((screenWidth - Space.md * 2 - Space.xs * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  return StyleSheet.create({
    ...createHeaderStyles(colors),
    ...createSelectionPreviewStyles(colors),
    ...createMediaGridStyles(colors, THUMB_SIZE),
    ...createSearchResultStyles(colors),
    ...createTextPickerStyles(colors),
    ...createDrawStyles(colors),
    ...createMediaPickerStyles(colors),
    ...createSpectrumStyles(colors),
    ...createChipStyles(colors),
    ...createPreviewStyles(colors),
  });
}

// ── Section builders (pure extraction from createStyles) ─────────────

function createHeaderStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: Space.sm },
    title: { flex: 1, textAlign: 'center', fontFamily: TypographyV2.sectionTitle.fontFamily, fontSize: TypographyV2.sectionTitle.size, color: colors.textPrimary },
    closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    headerSpacer: { width: 44, height: 44 },
    doneBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    doneBtnText: { fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size },
    albumPickerDropdown: {
      marginHorizontal: Space.md,
      marginBottom: Space.xs },
    albumPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      height: 48 },
    albumPickerItemText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      flex: 1 },
    albumPickerItemCount: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.caption.size,
      color: colors.textMuted },
    // ── Category tabs ──
    categoryTabRow: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      position: 'relative',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    categoryTabIndicator: {
      position: 'absolute',
      bottom: 0,
      height: 2 },
    categoryTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.md,
      zIndex: 1 },
    categoryTabLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    // ── Limited-access banner ──
    limitedAccessBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      borderRadius: Radius.sm },
    limitedAccessText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },
  });
}

function createSelectionPreviewStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Selection preview rail ──
    selectionPreviewRail: {
      paddingVertical: Space.sm },
    selectionPreviewScroll: {
      paddingHorizontal: Space.md,
      gap: Space.xs },
    selectionPreviewItem: {
      width: 56,
      height: 56,
      borderRadius: Radius.sm,
      overflow: 'hidden' },
    selectionPreviewItemSelected: {
      borderWidth: Stroke.emphasis,
      borderColor: colors.brand },
    selectionPreviewThumb: {
      width: '100%',
      height: '100%' },
    selectionPreviewOrder: {
      position: 'absolute',
      top: -6,
      left: -6,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2 },
    selectionPreviewOrderText: {
      fontFamily: TypographyV2.meta.fontFamily,
      fontSize: TypographyV2.meta.size,
      fontWeight: '700' },
    selectionPreviewRemove: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2 },
  });
}

function createMediaGridStyles(colors: ThemeColors, THUMB_SIZE: number) {
  return StyleSheet.create({
    // ── Media grid ──
    mediaGridContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    mediaGridRow: { gap: Space.xs, marginBottom: Space.xs },
    mediaCameraHero: {
      width: '100%',
      aspectRatio: 2,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs },
    mediaCameraHeroLabel: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary },
    mediaGridCell: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center' },
    mediaGridThumb: {
      width: '100%',
      height: '100%' },
    mediaGridVideoBadge: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.mediaOverlayScrim,
      paddingHorizontal: Space.xs,
      paddingVertical: 2,
      borderRadius: Radius.sm },
    mediaGridDuration: {
      color: colors.scrimTextPrimary,
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.medium },
    mediaGridSelectedOverlay: {
      ...StyleSheet.absoluteFill,
      borderWidth: Stroke.emphasis,
      borderRadius: Radius.sm },
    mediaGridSelectionBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 16,
      height: 16,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    mediaGridFooter: {
      paddingVertical: Space.md,
      alignItems: 'center' },
    mediaLoadingState: {
      paddingVertical: Space.xxl,
      alignItems: 'center' },
    mediaEmptyState: {
      paddingVertical: Space.xxl,
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.xl },
    mediaEmptyTitle: {
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontSize: TypographyV2.sectionTitle.size,
      fontWeight: TypographyV2.sectionTitle.weight,
      color: colors.textPrimary },
    mediaEmptySubtitle: {
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      textAlign: 'center' },
    mediaEmptyLink: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.brand,
      marginTop: Space.xs },
    mediaPermissionState: {
      paddingVertical: Space.xxl + Space.lg,
      alignItems: 'center',
      gap: Space.md,
      paddingHorizontal: Space.xl },
    mediaPermissionTitle: {
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontSize: TypographyV2.sectionTitle.size,
      fontWeight: TypographyV2.sectionTitle.weight,
      color: colors.textPrimary },
    mediaPermissionText: {
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      textAlign: 'center' },
    mediaPermissionBtn: {
      width: '100%',
      height: 52,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.md },
    mediaPermissionBtnText: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textInverse },
  });
}

function createSearchResultStyles(colors: ThemeColors) {
  return StyleSheet.create({
    searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: Space.sm, gap: 8 },
    searchIcon: {},
    searchInput: {
      flex: 1, borderWidth: Stroke.standard, borderColor: colors.border, borderRadius: Radius.md,
      paddingHorizontal: Space.md, paddingVertical: Space.sm, fontSize: TypographyV2.body.size, color: colors.textPrimary },
    // ── Product picker source tabs ──
    resultList: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    resultThumb: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    resultThumbImg: { width: '100%', height: '100%' },
    resultAvatar: { width: 40, height: 40, borderRadius: Radius.full, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    resultAvatarText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textSecondary },
    resultInfo: { flex: 1, gap: 2 },
    resultName: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textPrimary },
    resultPrice: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.brand },
    resultSubtext: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textMuted },
    loadingBody: { paddingVertical: Space.xl, alignItems: 'center' },
    emptyState: { paddingVertical: Space.xl, alignItems: 'center' },
    emptyText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textMuted },
    errorBody: { paddingVertical: Space.xl, alignItems: 'center', gap: Space.sm },
    errorText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textMuted },
    retryBtn: { paddingHorizontal: Space.lg, paddingVertical: Space.sm, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    retryBtnText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.brand },
  });
}

function createTextPickerStyles(colors: ThemeColors) {
  return StyleSheet.create({
    textPickerBody: { paddingHorizontal: Space.md, paddingBottom: Space.xl, gap: Space.sm },
    // Live preview area — dark canvas mimicking the poster/look background
    textPreview: {
      minHeight: 90,
      borderRadius: Radius.lg,
      backgroundColor: TEXT_PREVIEW_STAGE_BG,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: Space.md + 2,
      paddingHorizontal: Space.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.scrimTextTertiary },
    textPreviewText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    sectionLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    textInput: {
      borderWidth: Stroke.standard, borderColor: colors.border, borderRadius: Radius.lg,
      paddingHorizontal: Space.md, paddingVertical: Space.md, fontSize: TypographyV2.body.size, color: colors.textPrimary, minHeight: 52 },
    saveBtn: { height: 48, borderRadius: Radius.lg, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center' },
    saveBtnDisabled: { opacity: 0.35 },
    saveBtnText: { color: colors.textInverse, fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, letterSpacing: 0.3 },
    pickerSectionLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Space.xs },
    styleScroll: { marginHorizontal: -Space.md, paddingHorizontal: Space.md },
    styleOption: { paddingHorizontal: Space.md + 2, paddingVertical: Space.sm + 2, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm, backgroundColor: colors.surfaceAlt },
    styleOptionActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.09), borderWidth: Stroke.emphasis },
    styleOptionText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textPrimary },
    styleOptionTextActive: { color: colors.brand },
    colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    colorOption: { width: 44, height: 44, borderRadius: Radius.full, borderWidth: Stroke.emphasis, borderColor: 'transparent', ...Elevation.card },
    colorOptionActive: { borderColor: colors.brand, shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
    colorOptionTransparent: { borderWidth: Stroke.standard, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
    alignmentRow: { flexDirection: 'row', gap: Space.sm },
    alignmentOption: { width: 44, height: 44, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
    alignmentOptionActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.08) },
    shapeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.md, paddingVertical: Space.lg, paddingHorizontal: Space.md },
    shapeOption: { alignItems: 'center', gap: 6, width: 80, paddingVertical: Space.sm },
    shapeLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
  });
}

function createDrawStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Draw picker ──
    drawBody: { paddingHorizontal: Space.md, paddingBottom: Space.xl, gap: Space.xs },
    drawCanvasWrap: {
      flex: 1,
      minHeight: 280,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.scrimTextTertiary,
      overflow: 'hidden',
      marginBottom: Space.sm },
    drawCanvasHint: {
      position: 'absolute',
      bottom: Space.sm,
      left: 0,
      right: 0,
      alignItems: 'center',
      pointerEvents: 'none' },
    drawCanvasHintText: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.scrimTextTertiary,
      letterSpacing: 0.3 },
    brushSizeRow: { flexDirection: 'row', gap: Space.md, alignItems: 'center', paddingVertical: Space.xs },
    brushSizeOption: { width: 44, height: 44, borderRadius: Radius.full, justifyContent: 'center', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    brushSizeOptionActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.08) },
    brushSizeDot: { borderRadius: Radius.full },
    brushPreviewWrap: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.xs },
    brushPreviewDot: { ...Elevation.floating },
    brushPreviewLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    drawActions: { flexDirection: 'row', alignItems: 'center', gap: Space.md, marginTop: Space.md },
    drawActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Space.md, paddingVertical: Space.sm, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    drawActionLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    drawDoneBtn: { paddingHorizontal: Space.xl, paddingVertical: Space.sm, borderRadius: Radius.full, marginLeft: 'auto' },
    drawDoneBtnText: { fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, color: colors.textInverse },
  });
}

function createMediaPickerStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── GIF picker ──
    gifList: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    gifRow: { gap: Space.xs, marginBottom: Space.xs },
    gifCell: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    gifThumb: { width: '100%', height: '100%' },
    // ── Music picker ──
    musicPreviewCard: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginHorizontal: Space.md, marginBottom: Space.sm, ...Elevation.card },
    musicPreviewArt: { width: 48, height: 48, borderRadius: Radius.md },
    musicPreviewInfo: { flex: 1, gap: 2 },
    musicPreviewTrackName: { fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, color: colors.textPrimary },
    musicPreviewArtistName: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    musicPreviewPlayBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    musicLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.sm, paddingVertical: Space.sm },
    musicLoadingText: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    musicRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm, paddingHorizontal: Space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    musicArtwork: { width: 56, height: 56, borderRadius: Radius.md, ...Elevation.floating },
    musicInfo: { flex: 1, gap: 2 },
    musicTrackName: { fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, color: colors.textPrimary },
    musicArtistName: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    musicAddBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    // ── Quiz picker ──
    quizOptionRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.xs },
    quizCorrectDot: { width: 28, height: 28, borderRadius: Radius.full, borderWidth: Stroke.emphasis, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
    quizRemoveBtn: { padding: Space.xs },
    quizAddOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Space.sm },
    quizAddOptionText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.brand },
    // ── Countdown picker ──
    countdownDateBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.md, borderWidth: Stroke.standard, borderColor: colors.border },
    countdownDateText: { flex: 1, fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textPrimary },
    // ── Sticker tray ──
    stickerSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.sm, backgroundColor: colors.surfaceAlt, borderRadius: Radius.lg, marginHorizontal: Space.md, marginBottom: Space.sm },
    stickerSearchInput: { flex: 1, fontSize: TypographyV2.body.size, color: colors.textPrimary, fontFamily: TypographyV2.body.fontFamily, paddingVertical: Space.xs },
    stickerSearchClear: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
    stickerCategoryScroll: { marginHorizontal: -Space.md, marginBottom: Space.xs },
    stickerCategoryContent: { paddingHorizontal: Space.md, gap: 8 },
    stickerCategoryChip: { paddingHorizontal: 14, paddingVertical: Space.sm, borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    stickerCategoryChipText: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    stickerGridScroll: { flex: 1 },
    stickerGridContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    stickerCategorySection: { marginBottom: Space.lg },
    stickerCategoryTitle: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Space.sm },
    stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
    stickerCell: { width: 80, height: 80, borderRadius: Radius.lg, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', gap: Space.xs, borderWidth: Stroke.standard, borderColor: colors.borderSubtle },
    stickerCellLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textPrimary },
    stickerEmptyState: { paddingVertical: Space.xxl, alignItems: 'center', gap: Space.md },
    stickerEmptyText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textMuted },
    // ── Sticker preview pill (shared by Link/Location/Hashtag/Time/Weather) ──
    stickerPreviewPill: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.lg, backgroundColor: 'rgba(201,164,106,0.9)', alignSelf: 'center', marginBottom: Space.sm },
    stickerPreviewPillText: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textInverse },
    stickerPreviewPillEmoji: { fontSize: TypographyV2.priceList.size },
    // ── Weather picker ──
    weatherPreviewPill: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.xl, backgroundColor: 'rgba(201,164,106,0.95)', alignSelf: 'center', marginBottom: Space.sm, ...Elevation.floating, minWidth: 180 },
    weatherPreviewEmoji: { fontSize: TypographyV2.display.size },
    weatherPreviewInfo: { gap: 0 },
    weatherPreviewTemp: { fontFamily: TypographyV2.sectionTitle.fontFamily, fontSize: TypographyV2.sectionTitle.size, color: colors.textInverse },
    weatherPreviewCondition: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.scrimTextSecondary },
    weatherPreviewLocation: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
    weatherPreviewLocationText: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.scrimTextSecondary },
    weatherGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
    weatherCell: { width: 80, height: 80, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', gap: 4 },
    weatherCellActive: { backgroundColor: colors.brand },
    weatherCellEmoji: { fontSize: TypographyV2.priceHero.size },
    weatherCellLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary, textAlign: 'center' },
    inputCardLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary, marginBottom: 6, marginTop: Space.sm },
    inputCard: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginBottom: Space.xs },
    inputCardText: { flex: 1, fontSize: TypographyV2.body.size, color: colors.textPrimary, fontFamily: TypographyV2.body.fontFamily, paddingVertical: 2 },
    inputCardSuffix: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textSecondary },
  });
}

function createSpectrumStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Spectrum color picker ──
    spectrumWrap: { marginTop: Space.sm, gap: Space.xs },
    spectrumBar: { height: 36, borderRadius: Radius.full, overflow: 'hidden', position: 'relative', ...Elevation.floating },
    spectrumOverlay: { ...StyleSheet.absoluteFill },
    spectrumIndicator: { position: 'absolute', top: -4, width: 28, height: 28, borderRadius: Radius.full, borderWidth: Stroke.emphasis, borderColor: colors.textInverse, backgroundColor: colors.textInverse, ...Elevation.modal, left: '50%', marginLeft: -14 },
    spectrumClose: { alignSelf: 'center', paddingVertical: Space.xs },
    // ── Vertical brush size slider ──
    brushSliderWrap: { position: 'absolute', left: Space.sm, top: '50%', marginTop: -60, zIndex: 10, ...Elevation.modal },
    brushSliderTrack: { width: 28, height: 120, borderRadius: Radius.full, backgroundColor: colors.mediaOverlayScrim, justifyContent: 'flex-end', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.scrimTextTertiary },
    brushSliderFill: { width: '100%', backgroundColor: colors.scrimTextTertiary, borderRadius: Radius.full },
    brushSliderHandle: { position: 'absolute', left: '50%', marginLeft: -11, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
    brushSliderDot: { borderWidth: Stroke.standard, borderColor: colors.scrimTextSecondary },
  });
}

function createChipStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Text effect chips (visual preview) ──
    effectChip: { width: 56, height: 56, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', gap: 2 },
    effectChipActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.09), borderWidth: Stroke.emphasis },
    effectChipSample: { fontFamily: TypographyV2.priceList.fontFamily, fontSize: TypographyV2.priceList.size, lineHeight: 24 },
    effectChipLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    effectChipLabelActive: { color: colors.brand },
    // ── Text animation chips (visual preview) ──
    animChip: { width: 48, height: 56, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', gap: 4 },
    animChipActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.09), borderWidth: Stroke.emphasis },
    animChipLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary, textAlign: 'center' },
    animChipLabelActive: { color: colors.brand },
    // ── Draw brush chips (premium tool selection) ──
    brushChipScroll: { gap: Space.sm, paddingVertical: Space.xs },
    brushChip: { width: 48, height: 48, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', marginRight: Space.sm },
    brushChipActive: { backgroundColor: colors.brand },
    // ── Shape preview box ──
    shapePreviewBox: { width: 56, height: 56, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    // ── GIF category chips ──
    gifCategoryScroll: { marginHorizontal: -Space.md, marginBottom: Space.sm },
    gifCategoryContent: { paddingHorizontal: Space.md, gap: 8 },
    gifCategoryChip: { paddingHorizontal: 14, paddingVertical: Space.sm, borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    gifCategoryChipText: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
  });
}

function createPreviewStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Vote preview ──
    votePreviewWrap: { backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginBottom: Space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    votePreviewQuestion: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textPrimary, marginBottom: Space.sm, textAlign: 'center' },
    votePreviewOptions: { flexDirection: 'row', gap: Space.sm },
    votePreviewOption: { flex: 1, paddingVertical: Space.sm, paddingHorizontal: Space.sm, borderRadius: Radius.md, borderWidth: Stroke.standard, alignItems: 'center' },
    votePreviewOptionText: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textPrimary },
    addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Space.sm, marginBottom: Space.xs },
    addOptionBtnText: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.brand },
    timerChip: { paddingHorizontal: 14, paddingVertical: Space.sm, borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm },
    timerChipText: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary },
    // ── Quiz preview ──
    quizPreviewWrap: { backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginBottom: Space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: Space.xs },
    quizPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.xs },
    quizPreviewEmoji: { fontSize: TypographyV2.screenTitle.size },
    quizPreviewQuestion: { flex: 1, fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textPrimary },
    quizPreviewOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Space.sm, paddingHorizontal: Space.md, borderRadius: Radius.md, backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    quizPreviewOptionCorrect: { borderColor: colors.success, backgroundColor: withAlpha(colors.success, 0.08) },
    quizPreviewOptionText: { flex: 1, fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textPrimary },
    // ── Question preview (improved) ──
    questionPreviewWrap: { borderRadius: Radius.xl, padding: Space.md + 2, marginBottom: Space.sm, gap: Space.sm, ...Elevation.floating },
    questionPreviewIconRow: { marginBottom: Space.xs },
    questionPreviewPrompt: { fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, color: colors.scrimTextPrimary, lineHeight: TypographyV2.bodyStrong.size * 1.3 },
    questionPreviewInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.scrimTextTertiary, borderRadius: Radius.md, paddingVertical: Space.sm, paddingHorizontal: Space.md },
    questionPreviewPlaceholder: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.scrimTextSecondary },
    questionPreviewSendDot: { width: 24, height: 24, borderRadius: Radius.full, backgroundColor: colors.scrimTextSecondary, justifyContent: 'center', alignItems: 'center' },
    // ── Emoji slider preview (improved) ──
    sliderPreviewWrap: { backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Space.md + 2, marginBottom: Space.sm, gap: Space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...Elevation.card },
    sliderPreviewQuestion: { fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textPrimary, textAlign: 'center' },
    sliderPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
    sliderPreviewEmoji: { fontSize: TypographyV2.display.size },
    sliderPreviewTrack: { flex: 1, height: 8, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt, position: 'relative' },
    sliderPreviewFill: { height: '100%', borderRadius: Radius.sm },
    sliderPreviewHandle: { position: 'absolute', top: -6, width: 20, height: 20, borderRadius: Radius.full, marginLeft: -10, borderWidth: Stroke.emphasis, borderColor: colors.textInverse, ...Elevation.modal },
    sliderPreviewEndLabel: { fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.textSecondary, textAlign: 'center' },
    // ── Product source tabs ──
    productTabBar: { flexDirection: 'row', paddingHorizontal: Space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    productTabBarContent: { gap: Space.md },
    productTab: { paddingVertical: Space.md },
    productTabLabel: { fontFamily: Typography.family.medium, fontSize: TypographyV2.body.size, color: colors.textSecondary },
    // ── Long-press preview overlay ──
    previewOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.background,
      zIndex: 1000 },
    previewImage: {
      ...StyleSheet.absoluteFill,
    }
  });
}
