/**
 * CutoutPreviewStage — the preview canvas/mask section of
 * CutoutPreviewSheet: the checkerboard-backed Skia MaskedPreview with
 * brush drawing, or the hold-to-compare original image. Includes the
 * Checkerboard helper. Extracted verbatim from CutoutPreviewSheet.tsx.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { Space } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { MaskedPreview } from '../../core/cutout/MaskCompositor';
import type { MaskStroke } from '../../core/cutout/MaskRenderer';
import { BRUSH_RADIUS, CHECKER_SIZE, type BrushMode } from './cutoutPreviewShared';
import { styles } from './cutoutPreviewStyles';

function Checkerboard({ size }: { size: { width: number; height: number } }) {
  const { colors } = useAppTheme();
  const cols = Math.ceil(size.width / CHECKER_SIZE);
  const rows = Math.ceil(size.height / CHECKER_SIZE);
  const squares: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isLight = (r + c) % 2 === 0;
      squares.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * CHECKER_SIZE,
            top: r * CHECKER_SIZE,
            width: CHECKER_SIZE,
            height: CHECKER_SIZE,
            backgroundColor: isLight ? colors.surfaceAlt : colors.border }}
        />,
      );
    }
  }
  return <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>{squares}</View>;
}

interface CutoutPreviewStageProps {
  comparing: boolean;
  previewSize: { width: number; height: number };
  imageUri: string;
  panGesture: ReturnType<typeof Gesture.Pan>;
  brushMode: BrushMode | null;
  currentBrushColor: string;
  strokes: MaskStroke[];
  livePointsSV: SharedValue<{ x: number; y: number }[]>;
  colors: ThemeColors;
}

export function CutoutPreviewStage({
  comparing,
  previewSize,
  imageUri,
  panGesture,
  brushMode,
  currentBrushColor,
  strokes,
  livePointsSV,
  colors }: CutoutPreviewStageProps) {
  return (
    <>
      {/* ── Preview area ── */}
      {comparing ? (
        // Hold-to-compare: show the original image full-width.
        // Reduce Motion-safe: no animation, just an instant swap.
        <View style={[styles.previewRow, { height: previewSize.height + Space.sm * 2 }]}>
          <View style={styles.previewCell}>
            <View style={[styles.previewFrame, { width: previewSize.width, height: previewSize.height, borderColor: colors.border }]}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
              />
            </View>
          </View>
        </View>
      ) : (
        // Real-time Skia MaskedPreview with brush drawing.
        // The checkerboard shows through erased regions.
        <View style={[styles.previewRow, { height: previewSize.height + Space.sm * 2 }]}>
          <View style={styles.previewCell}>
            <GestureHandlerRootView style={styles.gestureRoot}>
              <GestureDetector gesture={panGesture}>
                <View
                  style={[
                    styles.previewFrame,
                    {
                      width: previewSize.width,
                      height: previewSize.height,
                      borderColor: brushMode ? currentBrushColor : colors.border },
                  ]}
                >
                  <Checkerboard size={{ width: previewSize.width, height: previewSize.height }} />
                  {/* Skia MaskedPreview — real-time alpha-masked cutout */}
                  <MaskedPreview
                    imageUri={imageUri}
                    width={previewSize.width}
                    height={previewSize.height}
                    strokes={strokes}
                    livePointsSV={livePointsSV}
                    liveMode={brushMode === 'erase' ? 'erase' : brushMode ? 'keep' : null}
                    brushSize={BRUSH_RADIUS * 2}
                    showLiveOverlay={!!brushMode}
                  />
                </View>
              </GestureDetector>
            </GestureHandlerRootView>
          </View>
        </View>
      )}
    </>
  );
}
