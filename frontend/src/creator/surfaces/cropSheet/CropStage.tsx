/**
 * CropStage — media stage for CreatorCropSheet: transformed image, crop
 * frame with dim scrims + grid + corner handles, safe-zone overlay, and
 * the focal-point layer. Extracted verbatim from CreatorCropSheet.tsx;
 * the Reanimated styles that were scoped to this subtree moved with it.
 * Gesture worklets are untouched — the composed gesture arrives as a prop.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useAppTranslation } from '../../../i18n/useAppTranslation';
import { PressScale } from '../../shared/CreatorAnimations';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue } from 'react-native-reanimated';
import { GestureDetector, type ComposedGesture, type GestureType } from 'react-native-gesture-handler';
import { SAFE_ZONES, type CropDestination } from './cropSheetShared';
import { cropSheetStyles as styles } from './cropSheetStyles';

interface CropStageProps {
  imageUri: string;
  imageLoadFailed: boolean;
  onRetry: () => void;
  displayW: number;
  displayH: number;
  imageSize: { width: number; height: number };
  // Crop frame shared values (source of truth for the frame)
  cropXSV: SharedValue<number>;
  cropYSV: SharedValue<number>;
  cropWSV: SharedValue<number>;
  cropHSV: SharedValue<number>;
  rotateSV: SharedValue<number>;
  // Image zoom/pan shared values
  imageZoomSV: SharedValue<number>;
  imagePanXSV: SharedValue<number>;
  imagePanYSV: SharedValue<number>;
  isGestureActive: SharedValue<number>;
  straighten: number;
  flippedH: boolean;
  flippedV: boolean;
  cropGesture: GestureType | ComposedGesture;
  effectiveFocal: { x: number; y: number };
  onFocalTap: (evt: { nativeEvent: { locationX: number; locationY: number } }) => void;
  safeZonesOn: boolean;
  destination?: CropDestination;
}

export function CropStage({
  imageUri,
  imageLoadFailed,
  onRetry,
  displayW,
  displayH,
  imageSize,
  cropXSV,
  cropYSV,
  cropWSV,
  cropHSV,
  rotateSV,
  imageZoomSV,
  imagePanXSV,
  imagePanYSV,
  isGestureActive,
  straighten,
  flippedH,
  flippedV,
  cropGesture,
  effectiveFocal,
  onFocalTap,
  safeZonesOn,
  destination }: CropStageProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('creator');

  // Preview transform — composition order matches the confirm pipeline
  // (flip → straighten-rotate → crop → rotate 90°). RN composes transform
  // arrays CSS-style: the LAST entry is applied to the point FIRST (verified
  // against RN 0.86 Transform.cpp operator* — result = rhs × lhs — folded
  // left-to-right in BaseViewProps::resolveTransform, with row-vector point
  // application). The flips therefore run FIRST here, mirroring the
  // manipulate pipeline in handleCrop below. Do not "sort" these left to
  // right — that inverts the composition and breaks flip+rotate parity.
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotateSV.value}deg` },
      { rotate: `${straighten}deg` },
      { scaleX: flippedH ? -1 : 1 },
      { scaleY: flippedV ? -1 : 1 },
      { scale: imageZoomSV.value },
      { translateX: imagePanXSV.value },
      { translateY: imagePanYSV.value },
    ] }));

  // The cropped region appears on screen at the crop rect rotated by the
  // trailing 90° steps ONLY: the flip cancels (crop coords are defined on
  // the flipped canvas) and the straighten cancels (the inscribed rect is
  // defined on the straightened canvas), so rotating the overlay by the
  // 90° steps makes the visible frame wrap exactly what manipulateAsync
  // crops. RNGH inverse-maps gesture translations into this rotated space,
  // so the existing drag/pinch math keeps working unchanged.
  const cropOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateSV.value}deg` }] }));

  // Crop frame animated position/size (display coordinates)
  const scaleToDisplay = imageSize.width > 0 ? displayW / imageSize.width : 1;

  const cropFrameStyle = useAnimatedStyle(() => ({
    left: cropXSV.value * scaleToDisplay,
    top: cropYSV.value * scaleToDisplay,
    width: cropWSV.value * scaleToDisplay,
    height: cropHSV.value * scaleToDisplay }));

  // Dim scrims driven from the same shared values as the crop frame so
  // they follow the frame in real time during gestures. Previously these
  // were plain Views reading from React state (displayCropRect), which only
  // committed on gesture end — leaving a frozen shadow around a moving frame.
  const scrimTopStyle = useAnimatedStyle(() => ({
    height: cropYSV.value * scaleToDisplay }));

  const scrimBottomStyle = useAnimatedStyle(() => ({
    top: (cropYSV.value + cropHSV.value) * scaleToDisplay }));

  const scrimLeftStyle = useAnimatedStyle(() => ({
    top: cropYSV.value * scaleToDisplay,
    width: cropXSV.value * scaleToDisplay,
    height: cropHSV.value * scaleToDisplay }));

  const scrimRightStyle = useAnimatedStyle(() => ({
    top: cropYSV.value * scaleToDisplay,
    left: (cropXSV.value + cropWSV.value) * scaleToDisplay,
    height: cropHSV.value * scaleToDisplay }));

  // Grid lines are faintly visible at rest (0.12) and brighten during
  // interaction (0.35). A completely invisible grid at rest is a usability
  // defect — users cannot see the crop boundary until they start dragging.
  const gridStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      isGestureActive.value,
      [0, 1],
      [0.12, 0.35],
      Extrapolation.CLAMP ) }));

  return (
    <View style={styles.mediaStage}>
      <View style={[styles.previewFrame, { width: displayW, height: displayH }]}>
        {imageLoadFailed ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center' }}>
              {t('crop.loadError')}
            </Text>
            <PressScale
              onPress={onRetry}
              style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.surface }}
              accessibilityLabel={t('crop.retry')}
              accessibilityHint="Retries the crop"
              accessibilityRole="button"
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                {t('crop.retry')}
              </Text>
            </PressScale>
          </View>
        ) : (
        <>
        {/* Transformed image — flip → straighten → 90° steps */}
        <Reanimated.View style={[{ width: displayW, height: displayH }, imageStyle]}>
          <Image
            source={{ uri: imageUri }}
            style={{ width: displayW, height: displayH }}
            contentFit="cover"
          />
        </Reanimated.View>

        {/* Crop layer: dimming + frame (rotated by 90° steps only) */}
        <Reanimated.View
          style={[StyleSheet.absoluteFill, cropOverlayStyle]}
          pointerEvents="box-none"
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Reanimated.View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute', top: 0, left: 0, right: 0 }, scrimTopStyle]} />
            <Reanimated.View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute', left: 0, right: 0, bottom: 0 }, scrimBottomStyle]} />
            <Reanimated.View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute', left: 0 }, scrimLeftStyle]} />
            <Reanimated.View style={[styles.dimOverlay, { backgroundColor: colors.mediaOverlayScrim, position: 'absolute', right: 0 }, scrimRightStyle]} />
          </View>

          <GestureDetector gesture={cropGesture}>
            <Reanimated.View style={[styles.cropBorder, cropFrameStyle, { borderColor: colors.scrimTextPrimary }]}>
              <Reanimated.View style={[styles.gridLineV, { left: '33.33%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
              <Reanimated.View style={[styles.gridLineV, { left: '66.66%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
              <Reanimated.View style={[styles.gridLineH, { top: '33.33%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
              <Reanimated.View style={[styles.gridLineH, { top: '66.66%', backgroundColor: colors.scrimTextSecondary }, gridStyle]} />
              <View style={[styles.corner, styles.cornerTL, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerTR, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBL, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBR, { borderColor: colors.scrimTextPrimary }]} pointerEvents="none" />

              {/* ── Safe-zone overlay ───────────────────────────────
                  When enabled, renders the platform UI regions that will
                  obscure the media at the selected destination. The
                  unsafe bands are hatched so the user can see what will
                  be covered and compose around them. Truthful: based on
                  documented platform chrome, not arbitrary margins. */}
              {safeZonesOn && destination && SAFE_ZONES[destination] && (() => {
                const sz = SAFE_ZONES[destination];
                return (
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {sz.bands.top != null && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: `${sz.bands.top * 100}%`,
                          backgroundColor: colors.mediaOverlayScrim,
                          opacity: 0.45,
                        }}
                      />
                    )}
                    {sz.bands.bottom != null && (
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: `${(1 - sz.bands.bottom) * 100}%`,
                          backgroundColor: colors.mediaOverlayScrim,
                          opacity: 0.45,
                        }}
                      />
                    )}
                  </View>
                );
              })()}
            </Reanimated.View>
          </GestureDetector>
        </Reanimated.View>

        {/* Focal layer: tap-to-set + draggable reticle, in source space */}
        <Reanimated.View style={[StyleSheet.absoluteFill, imageStyle]} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onFocalTap}
            accessibilityLabel="Focal point"
            accessibilityHint="Tap to set the focal point for this image"
            accessibilityRole="button"
          >
            <View
              style={[
                styles.focalReticle,
                {
                  left: effectiveFocal.x * displayW - 10,
                  top: effectiveFocal.y * displayH - 10,
                  borderColor: colors.scrimTextPrimary },
              ]}
              pointerEvents="none"
            />
            <View
              style={[
                styles.focalReticleOuter,
                {
                  left: effectiveFocal.x * displayW - 22,
                  top: effectiveFocal.y * displayH - 22,
                  borderColor: colors.scrimTextPrimary },
              ]}
              pointerEvents="none"
            />
          </Pressable>
        </Reanimated.View>
        </>
        )}
      </View>
    </View>
  );
}
