import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  type StyleProp,
  type ImageStyle,
  type LayoutChangeEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

/**
 * Normalized cover-fit anchor, 0-1 on both axes. (0.5, 0.5) — the default —
 * renders pixel-identical to `contentFit="cover"`; (0, 0) pins the image's
 * top-left corner to the container's, (1, 1) its bottom-right.
 */
export interface FocalImageProps {
  uri: string;
  focalPoint?: { x: number; y: number };
  /** Container size comes from style. */
  style: StyleProp<ImageStyle>;
  transition?: number;
  recyclingKey?: string;
  accessibilityLabel?: string;
}

interface Size {
  width: number;
  height: number;
}

interface FocalLayout {
  width: number;
  height: number;
  translateX: number;
  translateY: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** Keeps the translated image over the container — no gaps at any aspect ratio. */
function clampTranslate(translate: number, overflow: number): number {
  if (!Number.isFinite(translate)) return 0;
  const limit = overflow / 2;
  return Math.min(limit, Math.max(-limit, translate));
}

/**
 * Cover-fit focal anchoring — the same math as the Skia path in
 * CreatorCanvas: scale = max of the axis ratios, then pan the over-scaled
 * image by the focal offset. The offset is the distance between the focal
 * point and center, scaled by the per-axis overflow, so the focal point
 * shifts toward the viewport center and pins at the edges when the overflow
 * cannot absorb it.
 */
function computeFocalLayout(
  container: Size,
  natural: Size,
  focalPoint?: { x: number; y: number }
): FocalLayout | null {
  if (container.width <= 0 || container.height <= 0) return null;
  if (natural.width <= 0 || natural.height <= 0) return null;
  const scale = Math.max(container.width / natural.width, container.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const overflowX = width - container.width;
  const overflowY = height - container.height;
  const fx = clamp01(focalPoint?.x ?? 0.5);
  const fy = clamp01(focalPoint?.y ?? 0.5);
  return {
    width,
    height,
    translateX: clampTranslate((0.5 - fx) * overflowX, overflowX),
    translateY: clampTranslate((0.5 - fy) * overflowY, overflowY) };
}

/**
 * Drop-in cover-fit image that anchors on a focal point instead of the
 * center. The image is rendered at its cover-fit scale inside an
 * overflow-hidden container and panned with a transform, so user intent
 * set in the crop sheet survives the preview. With no focal point (or
 * before the natural size resolves) it renders centered cover, identical
 * to a plain expo-image.
 */
export const FocalImage = React.memo(function FocalImage({
  uri,
  focalPoint,
  style,
  transition,
  recyclingKey,
  accessibilityLabel }: FocalImageProps) {
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNaturalSize(null);
    ExpoImage.loadAsync(uri)
      .then((ref) => {
        if (!cancelled && ref.width > 0 && ref.height > 0) {
          setNaturalSize({ width: ref.width, height: ref.height });
        }
      })
      .catch(() => {
        /* natural size unavailable — stay on centered cover */
      });
    return () => { cancelled = true; };
  }, [uri]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize((prev) =>
      prev?.width === width && prev?.height === height ? prev : { width, height });
  }, []);

  const layout = useMemo(
    () => (containerSize && naturalSize ? computeFocalLayout(containerSize, naturalSize, focalPoint) : null),
    [containerSize, naturalSize, focalPoint]
  );

  const imageStyle: StyleProp<ImageStyle> = layout && containerSize
    ? {
        position: 'absolute',
        left: (containerSize.width - layout.width) / 2,
        top: (containerSize.height - layout.height) / 2,
        width: layout.width,
        height: layout.height,
        transform: [{ translateX: layout.translateX }, { translateY: layout.translateY }] }
    : styles.fill;

  return (
    <View style={[style, styles.container]} onLayout={handleLayout}>
      <ExpoImage
        source={{ uri }}
        style={imageStyle}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey ?? uri}
        transition={transition}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden' },
  fill: {
    width: '100%',
    height: '100%' } });
