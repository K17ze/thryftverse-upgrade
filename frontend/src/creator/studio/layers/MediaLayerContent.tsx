import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CachedImage } from '../../../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas as SkiaCanvas,
  Image as SkiaImage,
  ColorMatrix as SkiaColorMatrix,
  Mask as SkiaMask,
  useImage as useSkiaImage,
  Fit as SkiaFit,
  Blur as SkiaBlur,
  Rect as SkiaRect,
  RadialGradient as SkiaRadialGradient,
  Turbulence as SkiaTurbulence,
  Group as SkiaGroup,
  vec } from '@shopify/react-native-skia';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Video, ResizeMode } from '../../../components/compat/Video';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { ResolvedLayer } from '../../engine/evaluateScene';
import type { PlaybackClock } from '../../core/playback/PlaybackClock';
import { computeVolumeAtTime } from '../../core/audio';
import type { ProjectedClip } from '../../core/playback';
import { useFreezeFramePreview } from '../../poster/useFreezeFramePreview';
import {
  evaluateCompositionEffectStack,
  multiplyMatrix,
  type EvaluatedEffect } from '../../core/playback/EffectEvaluator';
import {
  getActiveAdjustmentLayers,
  applyAdjustmentLayersToClip } from '../../core/playback/AdjustmentLayerEvaluator';
import { mediaStyles, type VideoPlayerRef } from './layerContentShared';
import { SkiaVideoLayerContent } from './SkiaVideoLayerContent';

export function MediaLayerContent({
  layer,
  width,
  height,
  playbackClock,
  currentTimeMs,
  activeClip,
  videoPlayerRef,
  siblingLayers,
  compareOriginal,
  resolvedLayer }: {
  layer: Extract<CreatorLayer, { type: 'media' }>;
  width: number;
  height: number;
  playbackClock?: PlaybackClock | null;
  currentTimeMs?: number;
  activeClip?: ProjectedClip | null;
  videoPlayerRef?: React.MutableRefObject<VideoPlayerRef | null>;
  siblingLayers?: CreatorLayer[];
  compareOriginal?: boolean;
  resolvedLayer?: ResolvedLayer;
}) {
  const { colors } = useAppTheme();
  const { payload } = layer;
  const [videoError, setVideoError] = React.useState(false);
  const hasPlaybackClock = !!playbackClock;
  const timeMs = currentTimeMs ?? 0;
  // Clip-relative time for authored clip-space semantics (adjustment
  // timeRanges, fades). The freeze-window math below intentionally uses
  // the global `timeMs` — isInFreezeWindow subtracts timelineStartMs.
  const clipRelMs = activeClip
    ? Math.max(0, Math.min(timeMs - activeClip.timelineStartMs, activeClip.durationMs))
    : timeMs;

  // ── Freeze-frame preview ───────────────────────────────────────────
  // When the playhead is inside this clip's freeze window, decode the
  // frozen frame through Skia's useVideo and render it as an opaque Skia
  // overlay on top of the (paused) native player — a truthful preview of
  // the held frame. Only the media layer that IS the active clip activates
  // the hook; other layers pass null so no decoder is instantiated.
  const freezeClip = activeClip && activeClip.layerId === layer.id ? activeClip : null;
  const { frozenFrame, isFrozen } = useFreezeFramePreview({
    activeClip: freezeClip,
    playheadMs: timeMs,
    isPlaying: hasPlaybackClock ? (playbackClock?.isPlaying ?? false) : false,
  });

  // ── Scene-evaluator gating ─────────────────────
  // The resolved scene carries the authoritative decision on whether this
  // video layer should render through Skia video frames (useVideo) with
  // per-pixel effects, or fall back to the native VideoView without
  // effects. This is gated by the render profile's skiaVideoFrames +
  // videoEffects capabilities — both hidden in the registry today, so the
  // native path is preserved. When the capabilities flip to supported,
  // the Skia video path activates automatically.
  const useSkiaVideoFrames = resolvedLayer?.useSkiaVideoFrames ?? false;
  const resolvedEffectGraph = resolvedLayer?.effectGraph;

  // ── Effect evaluation ───────────────────────────────────────────
  // Evaluate the clip's own effect stack, then merge any active adjustment
  // layers (Meta Edits August 2026). Adjustment layers apply a global grade
  // on top of per-clip adjustments; their opacity blends the contribution.
  // Each segment is evaluated independently with its intensity (the
  // EffectEvaluator interpolates color matrices toward identity for
  // intensity < 1), then the per-segment EvaluatedEffects are combined:
  //   - color matrices are multiplied (composes the grades)
  //   - blur radii take the maximum
  //   - vignette / grain amounts are summed (clamped to 0..1)
  const evaluatedEffect = useMemo<EvaluatedEffect>(() => {
    // Compare-to-original: when the user long-presses the canvas background,
    // skip all effect evaluation so they see the ungraded image.
    if (compareOriginal) return {};
    const clipEffects = payload.effects ?? [];
    // Resolve active adjustment layers from the sibling set at the current
    // time. siblingLayers excludes this clip but includes adjustment layers
    // (they are separate layers). getActiveAdjustmentLayers filters by
    // type, enabled, hidden, and temporal range.
    const adjustmentLayers = siblingLayers
      ? getActiveAdjustmentLayers(siblingLayers, clipRelMs)
      : [];

    // No adjustment layers -> evaluate the clip's own effects directly
    // (preserves the original fast path).
    if (adjustmentLayers.length === 0) {
      if (clipEffects.length === 0) return {};
      return evaluateCompositionEffectStack(clipEffects, 1);
    }

    // Build the combined segment stack: clip effects first, then each
    // applicable adjustment layer's effects scaled by its opacity.
    const combined = applyAdjustmentLayersToClip(
      { id: layer.id, effects: clipEffects },
      adjustmentLayers,
      clipRelMs,
    );

    // Evaluate each segment with its own intensity and merge.
    let colorMatrix: number[] | undefined;
    let blurRadius = 0;
    let vignetteAmount = 0;
    let grainAmount = 0;
    let hasBlur = false;
    let hasVignette = false;
    let hasGrain = false;

    for (const segment of combined.segments) {
      const segResult = evaluateCompositionEffectStack(segment.effects, segment.intensity);
      if (segResult.colorMatrix) {
        if (colorMatrix) {
          // Multiply matrices to compose the grades.
          colorMatrix = multiplyMatrix(colorMatrix, segResult.colorMatrix);
        } else {
          colorMatrix = [...segResult.colorMatrix];
        }
      }
      if (segResult.blurRadius !== undefined && segResult.blurRadius > 0) {
        blurRadius = Math.max(blurRadius, segResult.blurRadius);
        hasBlur = true;
      }
      if (segResult.vignetteAmount !== undefined && segResult.vignetteAmount > 0) {
        vignetteAmount += segResult.vignetteAmount;
        hasVignette = true;
      }
      if (segResult.grainAmount !== undefined && segResult.grainAmount > 0) {
        grainAmount += segResult.grainAmount;
        hasGrain = true;
      }
    }

    const result: EvaluatedEffect = {};
    if (colorMatrix) result.colorMatrix = colorMatrix;
    if (hasBlur && blurRadius > 0) result.blurRadius = blurRadius;
    if (hasVignette && vignetteAmount > 0) result.vignetteAmount = Math.min(1, vignetteAmount);
    if (hasGrain && grainAmount > 0) result.grainAmount = Math.min(1, grainAmount);
    return result;
  }, [payload.effects, siblingLayers, clipRelMs, layer.id, compareOriginal]);

  const hasColorMatrix = !!evaluatedEffect?.colorMatrix && evaluatedEffect.colorMatrix.length === 20;

  // ── Mask evaluation ──────────────────────────────────────────────
  // If the layer has a maskRef, we composite the media with the mask
  // using Skia's Mask component (alpha mode). The mask URI is resolved
  // from the layer's maskRef field (which stores the mask URI directly
  // in the current schema).
  const maskUri = layer.maskRef ?? null;
  const skiaMaskImage = useSkiaImage(maskUri);
  const hasMask = !!skiaMaskImage;

  // ── Skia image for effect/mask rendering ─────────────────────────
  // For images with effects or masks, we load the image via Skia's
  // useImage hook so we can render it inside a Skia Canvas with
  // ColorMatrix and Mask components.
  const hasBlur = (evaluatedEffect?.blurRadius ?? 0) > 0;
  const hasVignette = (evaluatedEffect?.vignetteAmount ?? 0) > 0;
  const hasGrain = (evaluatedEffect?.grainAmount ?? 0) > 0;
  const skiaImage = useSkiaImage(payload.mediaUri);
  // Every evaluated channel must reach pixels — gating on only
  // colorMatrix/mask silently dropped blur, vignette, and grain
  // (the evaluator produced values nothing rendered).
  const useSkiaRendering = (hasColorMatrix || hasMask || hasBlur || hasVignette || hasGrain) && !!skiaImage;

  // ── Skia fit + focal-point transform ─────────────────────────────
  // Computed unconditionally (rules-of-hooks) — used only when
  // useSkiaRendering is true, but the useMemo must always run.
  const contentFitMap: Record<string, SkiaFit> = {
    cover: 'cover',
    contain: 'contain',
    fill: 'fill' };
  const fit = contentFitMap[payload.contentFit] ?? 'cover';

  // Focal-point art direction for Skia image paths. Skia's cover fit
  // crops from center by default. When the layer carries a focalPoint,
  // compute a translate offset that shifts the over-scaled image so the
  // focal region stays in frame. The offset is the difference between
  // the focal point and center, scaled by the overflow on each axis.
  const focalTransform = useMemo(() => {
    if (fit !== 'cover' || !payload.focalPoint || !skiaImage) return undefined;
    const imgW = skiaImage.width();
    const imgH = skiaImage.height();
    if (imgW === 0 || imgH === 0) return undefined;
    const scale = Math.max(width / imgW, height / imgH);
    const overflowX = imgW * scale - width;
    const overflowY = imgH * scale - height;
    const dx = (0.5 - payload.focalPoint.x) * overflowX;
    const dy = (0.5 - payload.focalPoint.y) * overflowY;
    return [{ translateX: dx }, { translateY: dy }];
  }, [fit, payload.focalPoint, skiaImage, width, height]);

  // ── Video playback state ─────────────────────────────────────────
  // When a playback clock is provided, video play/pause follows the clock.
  // When no clock is present (Look composer, viewer), fall back to the
  // legacy behavior: shouldPlay=true, muted=true, looping=true.
  const volume = payload.volume ?? 1;
  const speed = payload.speed ?? 1;
  const isMuted = hasPlaybackClock ? volume === 0 : true;
  const shouldPlay = hasPlaybackClock ? (playbackClock?.isPlaying ?? false) : true;
  const isLooping = !hasPlaybackClock;

  // ── Audio fades — preview parity with the export's afade filters ────
  // The backend applies afade in OUTPUT time (st=0..fadeIn, then
  // duration-fadeOut..duration). Mirror that gain curve here so the
  // preview auditions what export produces. Output duration comes from
  // the projected clip; fall back to the authored trim window / speed.
  const fadeInMs = Math.max(0, Math.min(payload.fadeInMs ?? 0, 5000));
  const fadeOutMs = Math.max(0, Math.min(payload.fadeOutMs ?? 0, 5000));
  const clipOutDurationMs = activeClip?.durationMs
    ?? (payload.trimEndMs != null && payload.trimStartMs != null
      ? Math.max(0, (payload.trimEndMs - payload.trimStartMs) / Math.max(speed, 0.001))
      : 0);
  const effectiveVolume = !hasPlaybackClock || (fadeInMs <= 0 && fadeOutMs <= 0) || clipOutDurationMs <= 0
    ? volume
    : computeVolumeAtTime(layer.id, clipRelMs, clipOutDurationMs, volume, fadeInMs, fadeOutMs);

  // ── Video seek driven by playback clock ──────────────────────────
  // When the clock's currentTimeMs changes, seek the video to the
  // corresponding source position. The seek is handled by the Video
  // compat component's internal effect on `shouldPlay` and the
  // playback clock's registered adapter. For simplicity, we use the
  // currentTimeMs prop to drive seeks via a ref to the Video player.
  // The actual seek is performed by the playback clock's video adapter,
  // which is registered by the timeline screen. Here we just pass the
  // playback state as props.

  if (payload.mediaType === 'video' && !videoError) {
    // Skia video frame path: when the render profile supports
    // skiaVideoFrames, decode the video via useVideo and render the
    // current frame as a Skia image inside a Canvas — the same
    // ColorMatrix / Mask / shader pipeline used for images. This is
    // gated by the capability registry (skiaVideoFrames + videoEffect
    // both hidden today), so the native VideoView path below remains
    // the live path until the capabilities are flipped to supported.
    if (useSkiaVideoFrames) {
      return (
        <SkiaVideoLayerContent
          layer={layer}
          width={width}
          height={height}
          effectGraph={resolvedEffectGraph}
          shouldPlay={shouldPlay}
          isMuted={isMuted}
          isLooping={isLooping}
          volume={volume}
          onError={() => setVideoError(true)}
          colors={colors}
        />
      );
    }
    return (
      <>
        {payload.thumbnailUri && !hasPlaybackClock && (
          <CachedImage
            uri={payload.thumbnailUri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            focalPoint={payload.focalPoint}
          />
        )}
        <Video
          key={`${layer.id}-${payload.mediaUri}`}
          source={{ uri: payload.mediaUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={shouldPlay}
          isMuted={isMuted}
          volume={effectiveVolume}
          isLooping={isLooping}
          playerRef={videoPlayerRef}
          onError={() => setVideoError(true)}
        />
        {/* Freeze-frame hold: while the playhead is inside this clip's
            freeze window, draw the decoded frame over the native player —
            the decoder seeks to sourceStartMs + freezeFrameMs, matching
            computeSourceTime's freeze mapping. Without this overlay the
            hook decoded a frame that was never rendered. */}
        {isFrozen && frozenFrame ? (
          <SkiaCanvas
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessibilityLabel="Frozen video frame preview"
            accessibilityHint="Shows the held frame during the freeze segment">
            <SkiaImage
              image={frozenFrame}
              x={0}
              y={0}
              width={width}
              height={height}
              fit="cover"
            />
          </SkiaCanvas>
        ) : null}
        {/* Video effects: the native expo-video VideoView renders natively
            and cannot be wrapped in a Skia Canvas, so per-pixel effects
            (color matrix, mask, shader) are NOT applied on this path.
            The scene evaluator returns no effect graph for video layers
            when the videoEffect capability is hidden (§6.4 — no
            metadata-only effect is advertised as a visible result). The
            Skia video frame path above renders the full effect graph
            when the capability is supported. */}
        <View style={[mediaStyles.videoBadge, { backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="none" accessibilityLabel="Video media layer"
        accessibilityHint="Plays the video in the canvas" accessibilityRole="image">
          <Ionicons name="videocam" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
        </View>
      </>
    );
  }

  // ── Image rendering with Skia effects/mask ───────────────────────
  // When the image has effects (color matrix) or a mask, render it via
  // a Skia Canvas with ColorMatrix and Mask components. Otherwise, use
  // the standard CachedImage for memory/disk caching and BlurHash support.
  if (useSkiaRendering) {
    return (
      <SkiaCanvas style={{ width, height }} accessibilityLabel="Media layer with effects"
      accessibilityHint="Renders the media with applied effects" accessibilityRole="image">
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
              image={skiaImage!}
              x={0}
              y={0}
              width={width}
              height={height}
              fit={fit}
              transform={focalTransform}
            >
              {hasBlur && <SkiaBlur blur={evaluatedEffect!.blurRadius!} />}
              {hasColorMatrix && (
                <SkiaColorMatrix matrix={evaluatedEffect!.colorMatrix!} />
              )}
            </SkiaImage>
          </SkiaMask>
        ) : (
          <SkiaImage
            image={skiaImage!}
            x={0}
            y={0}
            width={width}
            height={height}
            fit={fit}
            transform={focalTransform}
          >
            {hasBlur && <SkiaBlur blur={evaluatedEffect!.blurRadius!} />}
            {hasColorMatrix && (
              <SkiaColorMatrix matrix={evaluatedEffect!.colorMatrix!} />
            )}
          </SkiaImage>
        )}
        {hasVignette && (
          <SkiaRect x={0} y={0} width={width} height={height}>
            <SkiaRadialGradient
              c={vec(width / 2, height / 2)}
              r={Math.max(width, height) * 0.75}
              colors={['transparent', `rgba(0,0,0,${Math.min(1, evaluatedEffect!.vignetteAmount!)})`]}
            />
          </SkiaRect>
        )}
        {hasGrain && (
          <SkiaGroup blendMode="overlay" opacity={Math.min(1, evaluatedEffect!.grainAmount!) * 0.4}>
            <SkiaRect x={0} y={0} width={width} height={height}>
              <SkiaTurbulence freqX={0.9} freqY={0.9} octaves={2} />
            </SkiaRect>
          </SkiaGroup>
        )}
      </SkiaCanvas>
    );
  }

  // Image layers use the shared CachedImage system for memory/disk caching,
  // BlurHash placeholder support, and CDN downscale support — consistent
  // with the rest of the app. CachedImage handles its own loading shimmer
  // and error fallback graphic internally.
  //
  // Focal-point art direction: when the layer carries a focalPoint, pass
  // it through so CachedImage shifts the cover crop to keep the important
  // region in frame. Absent focalPoint defaults to center (0.5, 0.5).
  const contentFit = payload.contentFit === 'contain' ? 'contain' : payload.contentFit === 'fill' ? 'fill' : 'cover';
  return (
    <CachedImage
      uri={payload.mediaUri}
      style={StyleSheet.absoluteFill}
      contentFit={contentFit}
      focalPoint={contentFit === 'cover' ? payload.focalPoint : undefined}
    />
  );
}
