import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CachedImage } from '../../../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import {
  useSharedValue,
  useAnimatedReaction,
  runOnJS } from 'react-native-reanimated';
import {
  Canvas as SkiaCanvas,
  Image as SkiaImage,
  ColorMatrix as SkiaColorMatrix,
  Mask as SkiaMask,
  useImage as useSkiaImage,
  useVideo as useSkiaVideo,
  Fit as SkiaFit,
  fitbox as skiaFitbox,
  rect as skiaRect } from '@shopify/react-native-skia';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { mediaStyles } from './layerContentShared';

// ── Skia video frame layer ──────────────────────────────────────────
// Renders a video through Skia's useVideo hook so the current frame is a
// SkImage inside a Canvas — enabling the same ColorMatrix / Mask / shader
// pipeline used for images. This path is gated by the render profile's
// skiaVideoFrames + videoEffects capabilities (both hidden in the registry
// today). useVideo is a React hook, so this must be its own component —
// it cannot be called conditionally inside MediaLayerContent.
//
// API (react-native-skia 2.6.2+, stable):
//   const { currentFrame, currentTime, duration, framerate, rotation, size }
//     = useVideo(uri, { paused, seek, looping, volume });
//   currentFrame is a SharedValue<SkImage | null> — render via <SkiaImage>.
export function SkiaVideoLayerContent({
  layer,
  width,
  height,
  effectGraph,
  shouldPlay,
  isLooping,
  volume,
  onError,
  colors }: {
  layer: Extract<CreatorLayer, { type: 'media' }>;
  width: number;
  height: number;
  effectGraph?: import('../../engine/evaluateScene').ResolvedEffectGraph;
  shouldPlay: boolean;
  isMuted: boolean;
  isLooping: boolean;
  volume: number;
  onError: () => void;
  colors: ThemeColors;
}) {
  const { payload } = layer;
  const paused = useSharedValue(!shouldPlay);
  const looping = useSharedValue(isLooping);

  // Keep the paused shared value in sync with the shouldPlay prop. useVideo
  // reads `paused` as a shared value so changes do not re-instantiate the
  // video decoder.
  useEffect(() => {
    paused.value = !shouldPlay;
  }, [shouldPlay, paused]);
  useEffect(() => {
    looping.value = isLooping;
  }, [isLooping, looping]);

  // useVideo is the stable Skia video decode hook. It returns the current
  // frame as a SharedValue<SkImage | null>. When the URI is invalid or the
  // platform cannot decode, currentFrame stays null and we fall back to
  // the thumbnail / error state.
  const { currentFrame, rotation, size } = useSkiaVideo(payload.mediaUri, {
    paused,
    looping,
    volume });

  const contentFitMap: Record<string, SkiaFit> = {
    cover: 'cover',
    contain: 'contain',
    fill: 'fill' };
  const fit = contentFitMap[payload.contentFit] ?? 'cover';

  const hasColorMatrix = !!effectGraph?.colorMatrix && effectGraph.colorMatrix.length === 20;
  const maskUri = effectGraph?.maskUri ?? layer.maskRef ?? null;
  const skiaMaskImage = useSkiaImage(maskUri);
  const hasMask = !!skiaMaskImage;

  // Rotation + scale correction via Skia's fitbox (per the official Skia
  // video docs). useVideo returns a rotation of 0/90/180/270 and the source
  // dimensions; fitbox computes the matrix that maps the source rect into
  // the destination rect with the correct rotation and aspect-fit.
  const videoTransform = useMemo(() => {
    if (!rotation || (size.width === 0 && size.height === 0)) return undefined;
    const src = skiaRect(0, 0, size.width, size.height);
    const dst = skiaRect(0, 0, width, height);
    return skiaFitbox(fit === 'cover' ? 'cover' : 'contain', src, dst, rotation);
  }, [rotation, size.width, size.height, width, height, fit]);

  // Thumbnail fallback while the first frame decodes (or when the platform
  // cannot decode the video through Skia).
  const [showThumbnail, setShowThumbnail] = useState(true);
  useAnimatedReaction(
    () => currentFrame.value,
    (frame) => {
      if (frame !== null && showThumbnail) runOnJS(setShowThumbnail)(false);
    },
    [showThumbnail],
  );

  // If after a reasonable delay no frame has decoded, surface the error so
  // the parent can fall back to the native VideoView.
  useEffect(() => {
    if (showThumbnail) {
      const t = setTimeout(() => {
        // If we still have no frame, treat as a decode error so the caller
        // can fall back. This is conservative — Skia video decode failing
        // should not leave a blank surface.
        onError();
      }, 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [showThumbnail, onError]);

  return (
    <>
      {showThumbnail && payload.thumbnailUri && (
        <CachedImage
          uri={payload.thumbnailUri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          focalPoint={payload.focalPoint}
        />
      )}
      <SkiaCanvas style={{ width, height }} accessibilityLabel="Video media layer with effects"
      accessibilityHint="Renders the video with applied effects" accessibilityRole="image">
        {hasMask && skiaMaskImage ? (
          <SkiaMask
            mode="alpha"
            mask={
              <SkiaImage
                image={skiaMaskImage}
                x={0}
                y={0}
                width={width}
                height={height}
                fit={fit}
              />
            }
          >
            <SkiaImage
              image={currentFrame}
              x={0}
              y={0}
              width={width}
              height={height}
              fit={fit}
              transform={videoTransform}
            >
              {hasColorMatrix && (
                <SkiaColorMatrix matrix={effectGraph!.colorMatrix!} />
              )}
            </SkiaImage>
          </SkiaMask>
        ) : (
          <SkiaImage
            image={currentFrame}
            x={0}
            y={0}
            width={width}
            height={height}
            fit={fit}
            transform={videoTransform}
          >
            {hasColorMatrix && (
              <SkiaColorMatrix matrix={effectGraph!.colorMatrix!} />
            )}
          </SkiaImage>
        )}
      </SkiaCanvas>
      <View style={[mediaStyles.videoBadge, { backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="none" accessibilityLabel="Video media layer"
      accessibilityHint="Plays the video in the canvas" accessibilityRole="image">
        <Ionicons name="videocam" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
      </View>
    </>
  );
}
