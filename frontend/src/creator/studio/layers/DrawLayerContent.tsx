import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import {
  Canvas as SkiaCanvas,
  Path as SkiaPath,
  Group as SkiaGroup,
  Skia } from '@shopify/react-native-skia';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { layoutEmojiStamps } from '../../tools/drawing/emojiStampLayout';

// ── Draw layer content ─────────────────────────────────────────────
// Renders freehand strokes using Skia. Points are normalized 0-1
// relative to the layer bounds; scaled to the rendered pixel size.
interface RenderedStroke {
  key: number;
  path: ReturnType<typeof Skia.Path.Make>;
  stroke: Extract<CreatorLayer, { type: 'draw' }>['payload']['strokes'][number];
}

interface EmojiStamp {
  key: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  emoji: string;
}

export function DrawLayerContent({ layer, width, height }: { layer: Extract<CreatorLayer, { type: 'draw' }>; width: number; height: number }) {
  const { payload } = layer;

  const strokePaths = useMemo<RenderedStroke[]>(() => {
    const result: RenderedStroke[] = [];
    payload.strokes.forEach((stroke, i) => {
      if (stroke.points.length === 0) return;
      if (stroke.tool === 'emoji') return; // stamped, not stroked
      const path = Skia.Path.Make();
      if (!path) return;
      const first = stroke.points[0];
      path.moveTo(first.x * width, first.y * height);
      for (let j = 1; j < stroke.points.length; j++) {
        const prev = stroke.points[j - 1];
        const curr = stroke.points[j];
        const midX = ((prev.x + curr.x) / 2) * width;
        const midY = ((prev.y + curr.y) / 2) * height;
        path.quadTo(prev.x * width, prev.y * height, midX, midY);
      }
      const last = stroke.points[stroke.points.length - 1];
      path.lineTo(last.x * width, last.y * height);
      result.push({ key: i, path, stroke });
    });
    return result;
  }, [payload.strokes, width, height]);

  // Emoji-brush strokes stamp their glyph along the stroke polyline at
  // emojiSpacing intervals. Spacing/size are authored in source-canvas
  // pixels (stroke.sourceWidth/Height) and scaled to the rendered layer.
  // Emoji-brush strokes stamp their glyph along the stroke polyline.
  // Points are normalized 0-1; spacing/size are authored in source-canvas
  // pixels (stroke.sourceWidth/Height) and scaled to the rendered layer.
  // The layout is the shared deterministic walk used by the authoring
  // preview and export — replay matches what the user drew.
  const emojiStamps = useMemo<EmojiStamp[]>(() => {
    const stamps: EmojiStamp[] = [];
    payload.strokes.forEach((stroke, i) => {
      if (stroke.tool !== 'emoji' || !stroke.emoji || stroke.points.length === 0) return;
      const scale = stroke.sourceWidth ? width / stroke.sourceWidth : 1;
      const spacing = Math.max(4, stroke.emojiSpacing * scale);
      const size = stroke.emojiSize * scale;
      const pxPoints = stroke.points.map((p) => ({ x: p.x * width, y: p.y * height }));
      layoutEmojiStamps(pxPoints, spacing, stroke.emojiJitter, size, i).forEach((pt, j) => {
        stamps.push({
          key: `e${i}_${j}`,
          x: pt.x,
          y: pt.y,
          size,
          rotation: pt.rotation,
          emoji: stroke.emoji! });
      });
    });
    return stamps;
  }, [payload.strokes, width, height]);

  return (
    <View style={{ width, height }} accessibilityLabel="Drawing layer" accessibilityRole="image" accessibilityHint="Shows the drawn strokes on the canvas">
      <SkiaCanvas style={{ width, height }} pointerEvents="none">
        {strokePaths.map((sp) => {
          // Per-tool rendering parity with the authoring workspace
          // (DrawingWorkspace StrokePath): eraser clears at 2x width,
          // marker draws translucent at 1.25x, highlighter multiplies at
          // 1.8x, neon glows in three plus-blend passes. Without this the
          // replay flattened every stroke to a single opaque line.
          const tool = sp.stroke.tool;
          if (tool === 'eraser') {
            return (
              <SkiaPath
                key={sp.key}
                path={sp.path}
                style="stroke"
                strokeWidth={sp.stroke.width * 2}
                strokeCap="round"
                strokeJoin="round"
                blendMode="clear"
                color="#000000"
              />
            );
          }
          if (tool === 'neon') {
            return (
              <SkiaGroup key={sp.key} blendMode="plus">
                <SkiaPath path={sp.path} style="stroke" strokeWidth={sp.stroke.width * 3} strokeCap="round" strokeJoin="round" color={sp.stroke.color} blendMode="plus" opacity={0.15} />
                <SkiaPath path={sp.path} style="stroke" strokeWidth={sp.stroke.width * 2} strokeCap="round" strokeJoin="round" color={sp.stroke.color} blendMode="plus" opacity={0.3} />
                <SkiaPath path={sp.path} style="stroke" strokeWidth={sp.stroke.width} strokeCap="round" strokeJoin="round" color={sp.stroke.color} opacity={1} />
              </SkiaGroup>
            );
          }
          return (
            <SkiaPath
              key={sp.key}
              path={sp.path}
              style="stroke"
              strokeWidth={tool === 'highlighter' ? sp.stroke.width * 1.8 : tool === 'marker' ? sp.stroke.width * 1.25 : sp.stroke.width}
              color={sp.stroke.color}
              strokeCap={tool === 'highlighter' ? 'butt' : 'round'}
              strokeJoin="round"
              opacity={tool === 'highlighter' ? 0.3 : tool === 'marker' ? 0.6 : 1}
              blendMode={tool === 'highlighter' ? 'multiply' : 'srcOver'}
            />
          );
        })}
      </SkiaCanvas>
      {emojiStamps.map((s) => (
        <Text
          key={s.key}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: s.x - s.size / 2,
            top: s.y - s.size / 2,
            fontSize: s.size,
            lineHeight: s.size * 1.15,
            width: s.size * 1.2,
            textAlign: 'center',
            transform: [{ rotate: `${s.rotation}deg` }] }}
        >
          {s.emoji}
        </Text>
      ))}
    </View>
  );
}
