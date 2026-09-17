/**
 * CutoutCanvas — the drawing canvas section of CreatorCutoutSheet:
 * original image, crop bounding-box preview overlay, subject highlight
 * pulse, and the traced-path drawing layer (Skia or View fallback),
 * wrapped in the drag/pinch race gesture. Extracted verbatim from
 * CreatorCutoutSheet.tsx.
 */
import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { type DerivedValue, type AnimatedStyle } from 'react-native-reanimated';
import { Canvas, Path as SkiaPath } from '@shopify/react-native-skia';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { skiaAvailable, type SkPath } from '../../tools/drawing/drawingSkia';
import type { Tool, Point, PathEntry } from './cutoutSheetShared';
import { PathOverlay } from './PathOverlay';
import { styles } from './cutoutSheetStyles';

interface CutoutCanvasProps {
  displaySize: { width: number; height: number };
  cutoutTransformStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  imageUri: string;
  previewCrop: boolean;
  cropBBox: { minX: number; maxX: number; minY: number; maxY: number } | null;
  subjectHighlightStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  panGesture: ReturnType<typeof Gesture.Pan>;
  dragGesture: ReturnType<typeof Gesture.Pan>;
  pinchGesture: ReturnType<typeof Gesture.Pinch>;
  effectivePaths: Point[][];
  paths: PathEntry[];
  liveTracePathDV: DerivedValue<SkPath>;
  liveMode: 'keep' | 'erase';
  currentPath: Point[];
  tool: Tool;
  colors: ThemeColors;
}

export function CutoutCanvas({
  displaySize,
  cutoutTransformStyle,
  imageUri,
  previewCrop,
  cropBBox,
  subjectHighlightStyle,
  panGesture,
  dragGesture,
  pinchGesture,
  effectivePaths,
  paths,
  liveTracePathDV,
  liveMode,
  currentPath,
  tool,
  colors }: CutoutCanvasProps) {
  return (
    /* Drawing canvas with drag/pinch for cutout positioning */
    <GestureHandlerRootView style={[styles.canvasArea, { backgroundColor: colors.mediaOverlayScrim }]}>
      <GestureDetector gesture={Gesture.Race(dragGesture, pinchGesture)}>
        <Reanimated.View
          style={[
            styles.canvasFrame,
            {
              width: displaySize.width,
              height: displaySize.height,
              backgroundColor: colors.mediaOverlayScrim },
            cutoutTransformStyle,
          ]}
        >
          {/* Original image */}
          <Image
            source={{ uri: imageUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          {/* Crop bounding box preview overlay */}
          {previewCrop && cropBBox && (
            <View
              style={{
                position: 'absolute',
                left: Math.max(0, cropBBox.minX - 16),
                top: Math.max(0, cropBBox.minY),
                width: Math.min(displaySize.width, cropBBox.maxX - cropBBox.minX),
                height: Math.min(displaySize.height, cropBBox.maxY - cropBBox.minY),
                borderWidth: 2,
                borderColor: colors.brand,
                backgroundColor: 'transparent' }}
              pointerEvents="none"
            />
          )}
          {/* Subject selection highlight pulse */}
          <Reanimated.View style={[StyleSheet.absoluteFill, subjectHighlightStyle, { backgroundColor: colors.brand }]} pointerEvents="none" />

          {/* Drawing layer for traced paths */}
          <GestureDetector gesture={panGesture}>
            <View style={StyleSheet.absoluteFill}>
              {skiaAvailable ? (
                <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                  {effectivePaths.map((path, i) => (
                    <PathOverlay key={i} path={path} color="#E06666" opacity={0.3} />
                  ))}
                  {/* Erase strokes render in a muted tone so the user sees
                      where they trimmed — they don't contribute to the crop. */}
                  {paths.map((entry, i) =>
                    entry.mode === 'erase' ? (
                      <PathOverlay key={`erase-${i}`} path={entry.points} color={colors.textMuted} opacity={0.35} />
                    ) : null,
                  )}
                  <SkiaPath
                    path={liveTracePathDV}
                    style="stroke"
                    strokeCap="round"
                    strokeJoin="round"
                    strokeWidth={40}
                    color={liveMode === 'erase' ? colors.textMuted : '#E06666'}
                    opacity={0.5}
                  />
                </Canvas>
              ) : (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {effectivePaths.map((path, i) => (
                    <PathOverlay key={i} path={path} color="#E06666" opacity={0.3} />
                  ))}
                  {paths.map((entry, i) =>
                    entry.mode === 'erase' ? (
                      <PathOverlay key={`erase-${i}`} path={entry.points} color={colors.textMuted} opacity={0.35} />
                    ) : null,
                  )}
                  {currentPath.length > 1 && (
                    <PathOverlay
                      path={currentPath}
                      color={tool === 'eraser' ? colors.textMuted : '#E06666'}
                      opacity={0.5}
                    />
                  )}
                </View>
              )}
            </View>
          </GestureDetector>
        </Reanimated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
