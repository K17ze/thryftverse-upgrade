import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityInfo,
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Text,
  View,
  ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { Control, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { createVisualSearchStyles } from './visualSearchStyles';
import type { VisualSearchRegion } from './visualSearchTypes';

interface Props {
  visible: boolean;
  imageUri: string;
  /** Currently applied region (normalised fractions) — seeds the frame so
   *  reopening the overlay restores the user's last crop. */
  region: VisualSearchRegion | null;
  /** Confirmed region, or null when the confirmed frame covers the whole
   *  image (reset / untouched full frame — no region is sent). */
  onConfirm: (region: VisualSearchRegion | null) => void;
  onCancel: () => void;
}

/** Backend minimum region edge — 4% of the image on each axis. */
const MIN_REGION_FRACTION = 0.04;
/** A confirmed frame covering ~the whole image means "whole image" — no
 *  region is sent, matching the honest queryScope contract. */
const WHOLE_IMAGE_EPSILON = 0.005;
/** 44pt touch target; the visible bracket inside stays thin-stroke. */
const HANDLE_TOUCH = Control.hit;
/** Stage inset so corner handles straddling the frame edge keep their
 *  whole touch target inside the stage's dispatch bounds (Android only
 *  delivers touches within ancestor bounds). */
const EDGE_INSET = HANDLE_TOUCH / 2;
/** Per-adjust step for VoiceOver/TalkBack increment/decrement — 5% of the
 *  fitted image edge, comfortably above the 4% minimum region size so one
 *  step always produces a visible, contract-valid change. */
const ACCESSIBLE_STEP_FRACTION = 0.05;
/** Standard adjustable actions the crop frame and each handle expose. */
const ADJUST_ACTIONS = [{ name: 'increment' as const }, { name: 'decrement' as const }];

/** Rect in fitted-image display pixels (origin = top-left of the fitted image). */
interface DisplayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Drag a corner while its opposite corner stays anchored. The rect is
// clamped to the fitted image bounds and to the backend's 0.04 minimum
// linear fraction so the confirmed region is always contract-valid.
function resizeFromCorner(
  corner: Corner,
  start: DisplayRect,
  dx: number,
  dy: number,
  frameW: number,
  frameH: number,
): DisplayRect {
  const minW = MIN_REGION_FRACTION * frameW;
  const minH = MIN_REGION_FRACTION * frameH;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  let { x, y, w, h } = start;
  switch (corner) {
    case 'tl':
      x = clamp(start.x + dx, 0, right - minW);
      y = clamp(start.y + dy, 0, bottom - minH);
      w = right - x;
      h = bottom - y;
      break;
    case 'tr':
      w = clamp(start.w + dx, minW, frameW - start.x);
      y = clamp(start.y + dy, 0, bottom - minH);
      h = bottom - y;
      break;
    case 'bl':
      x = clamp(start.x + dx, 0, right - minW);
      w = right - x;
      h = clamp(start.h + dy, minH, frameH - start.y);
      break;
    case 'br':
      w = clamp(start.w + dx, minW, frameW - start.x);
      h = clamp(start.h + dy, minH, frameH - start.y);
      break;
  }
  return { x, y, w, h };
}

// ── R24 region-of-interest crop overlay ──────────────────────────────────
// Fullscreen modal: the query image fitted with contain semantics, a dark
// scrim outside the framed rect, and one draggable/resizable frame with
// four thin-stroke corner handles. The rect lives in fitted-image display
// pixels so converting to [0,1] source fractions is a divide — the
// letterbox offset only positions the overlay, never enters region math.
export function VisualSearchRegionCropper({ visible, imageUri, region, onConfirm, onCancel }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVisualSearchStyles(colors), [colors]);
  const { t } = useAppTranslation('visualSearch');
  const insets = useSafeAreaInsets();

  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<DisplayRect | null>(null);

  // Refs mirror state for the PanResponder closures, which are created
  // once and must always read the latest frame/rect.
  const rectRef = useRef<DisplayRect | null>(null);
  const fitRef = useRef<{ w: number; h: number } | null>(null);
  const dragStartRef = useRef<DisplayRect | null>(null);

  // Source image dimensions — getSize resolves without waiting for a
  // render; onLoad is the fallback for URIs getSize cannot stat.
  useEffect(() => {
    if (!visible || !imageUri) return;
    let cancelled = false;
    setImageSize(null);
    setRect(null);
    rectRef.current = null;
    Image.getSize(
      imageUri,
      (w, h) => { if (!cancelled) setImageSize({ w, h }); },
      () => { /* onLoad fallback covers URIs getSize cannot resolve */ });
    return () => { cancelled = true; };
  }, [visible, imageUri]);

  const handleImageLoad = useCallback((e: { nativeEvent: { source?: { width?: number; height?: number } } }) => {
    const { width, height } = e.nativeEvent.source ?? {};
    if (width && height) {
      setImageSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    }
  }, []);

  // Contain-fit: scale the source image into the stage (minus the handle
  // inset), letterboxed. ox/oy is the letterbox offset in stage pixels.
  const fit = useMemo(() => {
    if (!box || !imageSize || !imageSize.w || !imageSize.h) return null;
    const availW = Math.max(0, box.w - EDGE_INSET * 2);
    const availH = Math.max(0, box.h - EDGE_INSET * 2);
    if (!availW || !availH) return null;
    const scale = Math.min(availW / imageSize.w, availH / imageSize.h);
    const w = imageSize.w * scale;
    const h = imageSize.h * scale;
    return { w, h, ox: (box.w - w) / 2, oy: (box.h - h) / 2 };
  }, [box, imageSize]);

  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);

  // Seed the frame when the overlay opens (or the fitted size resolves):
  // the previously applied region when there is one, else the whole image.
  useEffect(() => {
    if (!visible || !fit) return;
    const seeded: DisplayRect = region
      ? {
          x: region.x * fit.w,
          y: region.y * fit.h,
          w: region.width * fit.w,
          h: region.height * fit.h }
      : { x: 0, y: 0, w: fit.w, h: fit.h };
    rectRef.current = seeded;
    setRect(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds once per open/fit change; `region` is stable while the modal is open (it only changes via confirm, which closes it).
  }, [visible, fit]);

  const applyRect = useCallback((next: DisplayRect) => {
    rectRef.current = next;
    setRect(next);
  }, []);

  const cornerResponders = useMemo(() => {
    const make = (corner: Corner) => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = rectRef.current ? { ...rectRef.current } : null;
      },
      onPanResponderMove: (_e, gesture) => {
        const f = fitRef.current;
        const start = dragStartRef.current;
        if (!f || !start) return;
        applyRect(resizeFromCorner(corner, start, gesture.dx, gesture.dy, f.w, f.h));
      },
      onPanResponderRelease: () => { dragStartRef.current = null; },
      onPanResponderTerminate: () => { dragStartRef.current = null; },
    });
    return { tl: make('tl'), tr: make('tr'), bl: make('bl'), br: make('br') };
  }, [applyRect]);

  const moveResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragStartRef.current = rectRef.current ? { ...rectRef.current } : null;
    },
    onPanResponderMove: (_e, gesture) => {
      const f = fitRef.current;
      const start = dragStartRef.current;
      if (!f || !start) return;
      applyRect({
        x: clamp(start.x + gesture.dx, 0, f.w - start.w),
        y: clamp(start.y + gesture.dy, 0, f.h - start.h),
        w: start.w,
        h: start.h });
    },
    onPanResponderRelease: () => { dragStartRef.current = null; },
    onPanResponderTerminate: () => { dragStartRef.current = null; },
  }), [applyRect]);

  const handleReset = useCallback(() => {
    const f = fitRef.current;
    if (!f) return;
    applyRect({ x: 0, y: 0, w: f.w, h: f.h });
  }, [applyRect]);

  // ── Screen-reader adjust path (S20-03) ─────────────────────────────────
  // The frame and each corner handle declare accessibilityRole="adjustable",
  // so they must honour the standard increment/decrement actions — VoiceOver
  // swipe up/down and TalkBack's adjust gesture dispatch these, not pan
  // gestures. Every adjustment reuses the same bounds/min-size clamping as
  // the drag path and announces the resulting region.
  const regionValueText = useCallback((r: DisplayRect, f: { w: number; h: number }): string => {
    const pct = (v: number) => Math.round(v * 100);
    return t('frame.value', {
      x: pct(r.x / f.w),
      y: pct(r.y / f.h),
      width: pct(r.w / f.w),
      height: pct(r.h / f.h) });
  }, [t]);

  const announceRegion = useCallback(() => {
    const f = fitRef.current;
    const r = rectRef.current;
    if (!f || !r) return;
    if (typeof AccessibilityInfo?.announceForAccessibility === 'function') {
      AccessibilityInfo.announceForAccessibility(regionValueText(r, f));
    }
  }, [regionValueText]);

  // Frame: increment nudges the whole region toward the bottom-right,
  // decrement toward the top-left — same clamped move as the pan handler.
  const handleFrameAction = useCallback((e: AccessibilityActionEvent) => {
    const { actionName } = e.nativeEvent;
    if (actionName !== 'increment' && actionName !== 'decrement') return;
    const f = fitRef.current;
    const start = rectRef.current;
    if (!f || !start) return;
    const dir = actionName === 'increment' ? 1 : -1;
    applyRect({
      x: clamp(start.x + dir * ACCESSIBLE_STEP_FRACTION * f.w, 0, f.w - start.w),
      y: clamp(start.y + dir * ACCESSIBLE_STEP_FRACTION * f.h, 0, f.h - start.h),
      w: start.w,
      h: start.h });
    announceRegion();
  }, [applyRect, announceRegion]);

  // Corner handle: increment pushes that corner outward (the region grows
  // toward it), decrement pulls it inward (the region shrinks from that
  // corner) — the opposite corner stays anchored, exactly like the drag.
  const handleCornerAction = useCallback((corner: Corner, e: AccessibilityActionEvent) => {
    const { actionName } = e.nativeEvent;
    if (actionName !== 'increment' && actionName !== 'decrement') return;
    const f = fitRef.current;
    const start = rectRef.current;
    if (!f || !start) return;
    const dir = actionName === 'increment' ? 1 : -1;
    const dx = dir * ACCESSIBLE_STEP_FRACTION * f.w * (corner === 'tl' || corner === 'bl' ? -1 : 1);
    const dy = dir * ACCESSIBLE_STEP_FRACTION * f.h * (corner === 'tl' || corner === 'tr' ? -1 : 1);
    applyRect(resizeFromCorner(corner, start, dx, dy, f.w, f.h));
    announceRegion();
  }, [applyRect, announceRegion]);

  const regionAccessibilityValue = useMemo(() => {
    if (!rect || !fit) return undefined;
    return { text: regionValueText(rect, fit) };
  }, [rect, fit, regionValueText]);

  // Convert the display-pixel rect to [0,1] source fractions. A frame
  // covering the whole image resolves to null — nothing is sent, so the
  // backend truthfully reports queryScope 'whole_image'.
  const handleConfirm = useCallback(() => {
    const f = fitRef.current;
    const r = rectRef.current;
    if (!f || !r) {
      onCancel();
      return;
    }
    const x = clamp(r.x / f.w, 0, 1);
    const y = clamp(r.y / f.h, 0, 1);
    const width = clamp(r.w / f.w, MIN_REGION_FRACTION, Math.max(MIN_REGION_FRACTION, 1 - x));
    const height = clamp(r.h / f.h, MIN_REGION_FRACTION, Math.max(MIN_REGION_FRACTION, 1 - y));
    const isWhole = x <= WHOLE_IMAGE_EPSILON && y <= WHOLE_IMAGE_EPSILON
      && x + width >= 1 - WHOLE_IMAGE_EPSILON && y + height >= 1 - WHOLE_IMAGE_EPSILON;
    onConfirm(isWhole ? null : { x, y, width, height });
  }, [onConfirm, onCancel]);

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  // Per-corner thin-stroke bracket: two emphasis-stroke edges forming an
  // L (selection chrome per the stroke grammar — the rect border itself
  // stays hairline).
  const cornerBracketStyles: Record<Corner, ViewStyle> = {
    tl: { borderTopWidth: Stroke.emphasis, borderLeftWidth: Stroke.emphasis },
    tr: { borderTopWidth: Stroke.emphasis, borderRightWidth: Stroke.emphasis },
    bl: { borderBottomWidth: Stroke.emphasis, borderLeftWidth: Stroke.emphasis },
    br: { borderBottomWidth: Stroke.emphasis, borderRightWidth: Stroke.emphasis },
  };
  const cornerLabels: Record<Corner, string> = {
    tl: t('frame.cornerTopLeft'),
    tr: t('frame.cornerTopRight'),
    bl: t('frame.cornerBottomLeft'),
    br: t('frame.cornerBottomRight'),
  };
  // Handles are stage-level siblings (not frame children) so their full
  // 44pt target stays dispatchable even when it straddles the frame edge.
  const handlePositions: Record<Corner, { left: number; top: number }> | null = rect && fit
    ? {
        tl: { left: fit.ox + rect.x - HANDLE_TOUCH / 2, top: fit.oy + rect.y - HANDLE_TOUCH / 2 },
        tr: { left: fit.ox + rect.x + rect.w - HANDLE_TOUCH / 2, top: fit.oy + rect.y - HANDLE_TOUCH / 2 },
        bl: { left: fit.ox + rect.x - HANDLE_TOUCH / 2, top: fit.oy + rect.y + rect.h - HANDLE_TOUCH / 2 },
        br: { left: fit.ox + rect.x + rect.w - HANDLE_TOUCH / 2, top: fit.oy + rect.y + rect.h - HANDLE_TOUCH / 2 },
      }
    : null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={[styles.cropRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.cropTopBar}>
          <AnimatedPressable
            style={styles.cropBarAction}
            onPress={onCancel}
            hapticFeedback="light"
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common:buttons.cancel')}
            accessibilityHint={t('frame.cancelHint')}
          >
            <Text style={styles.cropBarActionText}>{t('common:buttons.cancel')}</Text>
          </AnimatedPressable>
          <Text style={styles.cropTitle}>{t('frame.title')}</Text>
          <AnimatedPressable
            style={styles.cropBarAction}
            onPress={handleReset}
            hapticFeedback="light"
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('frame.reset')}
            accessibilityHint={t('frame.resetHint')}
          >
            <Text style={styles.cropBarActionText}>{t('frame.reset')}</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.cropStage} onLayout={handleStageLayout}>
          <Image
            source={{ uri: imageUri }}
            style={{
              position: 'absolute',
              left: EDGE_INSET,
              top: EDGE_INSET,
              right: EDGE_INSET,
              bottom: EDGE_INSET }}
            resizeMode="contain"
            onLoad={handleImageLoad}
            // Decorative context — the modal title, hint and the crop-area
            // controls carry the semantics; focusing a static image adds noise.
            accessible={false}
          />
          {fit && rect && (
            <View
              style={[styles.cropFrame, { left: fit.ox, top: fit.oy, width: fit.w, height: fit.h }]}
            >
              {/* Scrim outside the framed rect — four panels, no card chrome. */}
              <View pointerEvents="none" style={[styles.cropScrim, { left: 0, top: 0, right: 0, height: rect.y }]} />
              <View pointerEvents="none" style={[styles.cropScrim, { left: 0, top: rect.y + rect.h, right: 0, bottom: 0 }]} />
              <View pointerEvents="none" style={[styles.cropScrim, { left: 0, top: rect.y, width: rect.x, height: rect.h }]} />
              <View pointerEvents="none" style={[styles.cropScrim, { left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h }]} />

              {/* The frame itself — hairline border, drags to move;
                  increment/decrement nudge it for screen-reader users. */}
              <View
                {...moveResponder.panHandlers}
                style={[styles.cropRect, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={t('frame.areaLabel')}
                accessibilityHint={t('frame.areaHint')}
                accessibilityValue={regionAccessibilityValue}
                accessibilityActions={ADJUST_ACTIONS}
                onAccessibilityAction={handleFrameAction}
              />
            </View>
          )}
          {handlePositions && CORNERS.map((corner) => (
            <View
              key={corner}
              {...cornerResponders[corner].panHandlers}
              style={[styles.cropHandle, handlePositions[corner]]}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={cornerLabels[corner]}
              accessibilityHint={t('frame.cornerHint')}
              accessibilityValue={regionAccessibilityValue}
              accessibilityActions={ADJUST_ACTIONS}
              onAccessibilityAction={(e) => handleCornerAction(corner, e)}
            >
              <View style={[styles.cropHandleBracket, cornerBracketStyles[corner]]} />
            </View>
          ))}
        </View>

        <View style={styles.cropBottomBar}>
          <Text style={styles.cropHint}>{t('frame.hint')}</Text>
          <AppButton
            title={t('frame.confirm')}
            variant="primary"
            size="md"
            onPress={handleConfirm}
          />
        </View>
      </View>
    </Modal>
  );
}
