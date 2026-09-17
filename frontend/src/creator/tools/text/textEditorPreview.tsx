/**
 * textEditorPreview — live text preview for TextEditorSheet.
 *
 * Extracted from TextEditorSheet.tsx (pure extraction, zero behavior change).
 * Renders the preview text with fill, shadow, optional background padding,
 * and — when stroke is enabled — the 8-direction multi-shadow stroke
 * technique behind the fill text.
 */
import React from 'react';
import { Text, View, type TextStyle } from 'react-native';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { CreatorColor } from '../../color';
import { colorToRgba } from './textEditorShared';
import { useEditorStyles } from './textEditorStyles';

export interface TextEditorPreviewProps {
  previewText: string;
  /** Base preview style (font, size, alignment, fill color). */
  previewTextBase: TextStyle;
  /** Text shadow style, or {} when shadow is disabled. */
  previewShadow: TextStyle;
  strokeEnabled: boolean;
  strokeColor: CreatorColor;
  strokeOffsets: Array<{ width: number; height: number }>;
  bgEnabled: boolean;
  bgColor: CreatorColor;
  bgRadius: number;
  bgPaddingX: number;
  bgPaddingY: number;
  colors: ThemeColors;
}

export function TextEditorPreview({
  previewText,
  previewTextBase,
  previewShadow,
  strokeEnabled,
  strokeColor,
  strokeOffsets,
  bgEnabled,
  bgColor,
  bgRadius,
  bgPaddingX,
  bgPaddingY,
  colors }: TextEditorPreviewProps) {
  const styles = useEditorStyles(colors);

  return (
    <View
      style={[
        styles.preview,
        bgEnabled && {
          backgroundColor: colorToRgba(bgColor),
          borderRadius: bgRadius,
          paddingHorizontal: bgPaddingX,
          paddingVertical: bgPaddingY },
      ]}
    >
      {strokeEnabled && strokeOffsets.length > 0 ? (
        <View style={styles.strokePreviewWrap}>
          {strokeOffsets.map((offset, i) => (
            <Text
              key={`stroke-${i}`}
              style={[
                previewTextBase,
                {
                  position: 'absolute',
                  color: 'transparent',
                  textShadowColor: colorToRgba(strokeColor),
                  textShadowOffset: offset,
                  textShadowRadius: 0 },
              ]}
              numberOfLines={3}
            >
              {previewText}
            </Text>
          ))}
          <Text
            style={[previewTextBase, previewShadow, { position: 'absolute' }]}
            numberOfLines={3}
          >
            {previewText}
          </Text>
        </View>
      ) : (
        <Text
          style={[previewTextBase, previewShadow]}
          numberOfLines={3}
        >
          {previewText}
        </Text>
      )}
    </View>
  );
}
