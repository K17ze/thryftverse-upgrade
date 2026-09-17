// ── Alignment guides overlay ───────────────────────────────────────
// Canvas-space guide lines rendered at stage level so they are not
// displaced/rotated by the dragged layer's transform. Extracted
// verbatim from CreatorCanvas.tsx.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stroke } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { SAFE_MARGIN } from './layerGeometry';

export function AlignmentGuides({
  canvasWidth,
  canvasHeight,
  colors,
  smartGuides,
  centerGuideVisible }: {
  canvasWidth: number;
  canvasHeight: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
  smartGuides?: { vertical: number[]; horizontal: number[] };
  centerGuideVisible?: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {centerGuideVisible && (
        <>
          <View style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: canvasHeight / 2 - Stroke.hairline / 2,
            height: Stroke.hairline,
            backgroundColor: colors.brand,
            opacity: 0.4 }} />
          <View style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: canvasWidth / 2 - Stroke.hairline / 2,
            width: Stroke.hairline,
            backgroundColor: colors.brand,
            opacity: 0.4 }} />
        </>
      )}
      <View style={{ position: 'absolute', left: 0, right: 0, top: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      {(smartGuides?.vertical ?? []).map((x, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: x, width: Stroke.hairline, backgroundColor: colors.brand, opacity: 0.4 }} />
      ))}
      {(smartGuides?.horizontal ?? []).map((y, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: y, height: Stroke.hairline, backgroundColor: colors.brand, opacity: 0.4 }} />
      ))}
    </View>
  );
}
