import React from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';

// ── Skia availability check (same pattern as DrawingCanvas) ─────────────────
// On web, @shopify/react-native-skia requires WithSkiaWeb setup which this
// project does not configure. The try/catch prevents a hard crash; we render
// a lightweight SVG fallback instead.
let skiaAvailable = false;
let SkiaImports: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@shopify/react-native-skia');
  if (mod && mod.Canvas && mod.Skia && Platform.OS !== 'web') {
    skiaAvailable = true;
    SkiaImports = mod;
  }
} catch {
  skiaAvailable = false;
}

interface FlagshipEmptyGraphicProps {
  variant?: 'bag' | 'box' | 'search' | 'chat' | 'image';
  size?: number;
  color?: string;
}

/**
 * Flagship empty-state illustration — renders a geometric icon inside a
 * soft circle. On native platforms this uses Skia for GPU-accelerated
 * vector rendering. On web (where Skia requires extra setup not present
 * in this project), it falls back to inline SVG with the same geometry.
 */
export function FlagshipEmptyGraphic({
  variant = 'bag',
  size = 160,
  color,
}: FlagshipEmptyGraphicProps) {
  const { colors } = useAppTheme();
  const resolvedColor = color ?? colors.brand;
  const { width } = useWindowDimensions();
  const s = Math.min(size, width * 0.45);

  if (!skiaAvailable) {
    return <SvgFallback variant={variant} size={s} color={resolvedColor} />;
  }

  return <SkiaGraphic variant={variant} size={s} color={resolvedColor} />;
}

// ── Skia implementation (native only) ───────────────────────────────────────
function SkiaGraphic({ variant, size, color }: { variant: string; size: number; color: string }) {
  const { Skia, Canvas, Path, rect, rrect } = SkiaImports;
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.38;

  // Build simple geometric illustrations per variant
  const bgCircle = Skia.Path.Make();
  bgCircle.addCircle(cx, cy, r);

  const bagPath = Skia.Path.Make();
  // Bag body
  const bodyW = r * 1.4;
  const bodyH = r * 1.1;
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH * 0.1;
  const bodyRect = rect(bodyX, bodyY, bodyW, bodyH);
  const bodyRRect = rrect(bodyRect, 12, 12);
  bagPath.addRRect(bodyRRect);
  // Bag handle
  bagPath.moveTo(cx - r * 0.35, bodyY);
  bagPath.cubicTo(cx - r * 0.35, cy - r * 0.9, cx + r * 0.35, cy - r * 0.9, cx + r * 0.35, bodyY);

  const boxPath = Skia.Path.Make();
  const boxW = r * 1.3;
  const boxH = r * 1.0;
  const boxX = cx - boxW / 2;
  const boxY = cy - boxH * 0.15;
  const boxRect = rect(boxX, boxY, boxW, boxH);
  const boxRRect = rrect(boxRect, 10, 10);
  boxPath.addRRect(boxRRect);
  // Box lid line
  boxPath.moveTo(boxX, boxY + boxH * 0.28);
  boxPath.lineTo(boxX + boxW, boxY + boxH * 0.28);

  const searchPath = Skia.Path.Make();
  // Search circle
  const searchR = r * 0.55;
  searchPath.addCircle(cx - r * 0.15, cy - r * 0.15, searchR);
  // Handle line
  searchPath.moveTo(cx + r * 0.25, cy + r * 0.25);
  searchPath.lineTo(cx + r * 0.5, cy + r * 0.5);

  const chatPath = Skia.Path.Make();
  const chatW = r * 1.4;
  const chatH = r * 1.0;
  const chatX = cx - chatW / 2;
  const chatY = cy - chatH * 0.15;
  const chatRect = rect(chatX, chatY, chatW, chatH);
  const chatRRect = rrect(chatRect, 14, 14);
  chatPath.addRRect(chatRRect);
  // Chat tail
  chatPath.moveTo(cx - 8, chatY + chatH);
  chatPath.lineTo(cx, chatY + chatH + 10);
  chatPath.lineTo(cx + 8, chatY + chatH);

  const imagePath = Skia.Path.Make();
  const imgW = r * 1.4;
  const imgH = r * 1.1;
  const imgX = cx - imgW / 2;
  const imgY = cy - imgH * 0.1;
  const imgRect = rect(imgX, imgY, imgW, imgH);
  const imgRRect = rrect(imgRect, 12, 12);
  imagePath.addRRect(imgRRect);
  // Mountain line
  imagePath.moveTo(imgX + imgW * 0.2, imgY + imgH * 0.75);
  imagePath.lineTo(imgX + imgW * 0.45, imgY + imgH * 0.4);
  imagePath.lineTo(imgX + imgW * 0.7, imgY + imgH * 0.65);
  imagePath.lineTo(imgX + imgW * 0.85, imgY + imgH * 0.5);
  // Sun circle
  imagePath.addCircle(imgX + imgW * 0.72, imgY + imgH * 0.28, r * 0.12);

  const paths: Record<string, ReturnType<typeof Skia.Path.Make>> = {
    bag: bagPath,
    box: boxPath,
    search: searchPath,
    chat: chatPath,
    image: imagePath,
  };

  const selected = paths[variant] ?? bagPath;

  return (
    <View style={[styles.container, { width: s, height: s }]}>
      <Canvas style={{ width: s, height: s }}>
        {/* Background circle */}
        <Path path={bgCircle} color={color} opacity={0.08} />
        {/* Graphic stroke */}
        <Path
          path={selected}
          color={color}
          style="stroke"
          strokeWidth={3.5}
          strokeCap="round"
          strokeJoin="round"
          opacity={0.9}
        />
      </Canvas>
    </View>
  );
}

// ── SVG fallback (web or when Skia is unavailable) ──────────────────────────
// Renders the same geometric illustrations using inline SVG, which works
// natively in all browsers without extra setup.
function SvgFallback({ variant, size, color }: { variant: string; size: number; color: string }) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.38;
  const stroke = color;
  const sw = 3.5;

  // Build the inner icon path based on variant
  let iconPath: React.ReactNode = null;

  if (variant === 'bag') {
    const bodyW = r * 1.4;
    const bodyH = r * 1.1;
    const bodyX = cx - bodyW / 2;
    const bodyY = cy - bodyH * 0.1;
    iconPath = (
      <>
        <rect
          x={bodyX} y={bodyY} width={bodyW} height={bodyH}
          rx={12} ry={12}
          fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path
          d={`M ${cx - r * 0.35} ${bodyY} C ${cx - r * 0.35} ${cy - r * 0.9}, ${cx + r * 0.35} ${cy - r * 0.9}, ${cx + r * 0.35} ${bodyY}`}
          fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinecap="round"
        />
      </>
    );
  } else if (variant === 'box') {
    const boxW = r * 1.3;
    const boxH = r * 1.0;
    const boxX = cx - boxW / 2;
    const boxY = cy - boxH * 0.15;
    iconPath = (
      <>
        <rect
          x={boxX} y={boxY} width={boxW} height={boxH}
          rx={10} ry={10}
          fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <line
          x1={boxX} y1={boxY + boxH * 0.28}
          x2={boxX + boxW} y2={boxY + boxH * 0.28}
          stroke={stroke} strokeWidth={sw} strokeLinecap="round"
        />
      </>
    );
  } else if (variant === 'search') {
    const searchR = r * 0.55;
    iconPath = (
      <>
        <circle
          cx={cx - r * 0.15} cy={cy - r * 0.15} r={searchR}
          fill="none" stroke={stroke} strokeWidth={sw}
        />
        <line
          x1={cx + r * 0.25} y1={cy + r * 0.25}
          x2={cx + r * 0.5} y2={cy + r * 0.5}
          stroke={stroke} strokeWidth={sw} strokeLinecap="round"
        />
      </>
    );
  } else if (variant === 'chat') {
    const chatW = r * 1.4;
    const chatH = r * 1.0;
    const chatX = cx - chatW / 2;
    const chatY = cy - chatH * 0.15;
    iconPath = (
      <>
        <rect
          x={chatX} y={chatY} width={chatW} height={chatH}
          rx={14} ry={14}
          fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path
          d={`M ${cx - 8} ${chatY + chatH} L ${cx} ${chatY + chatH + 10} L ${cx + 8} ${chatY + chatH}`}
          fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round"
        />
      </>
    );
  } else {
    // image variant
    const imgW = r * 1.4;
    const imgH = r * 1.1;
    const imgX = cx - imgW / 2;
    const imgY = cy - imgH * 0.1;
    iconPath = (
      <>
        <rect
          x={imgX} y={imgY} width={imgW} height={imgH}
          rx={12} ry={12}
          fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path
          d={`M ${imgX + imgW * 0.2} ${imgY + imgH * 0.75} L ${imgX + imgW * 0.45} ${imgY + imgH * 0.4} L ${imgX + imgW * 0.7} ${imgY + imgH * 0.65} L ${imgX + imgW * 0.85} ${imgY + imgH * 0.5}`}
          fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <circle
          cx={imgX + imgW * 0.72} cy={imgY + imgH * 0.28} r={r * 0.12}
          fill="none" stroke={stroke} strokeWidth={sw}
        />
      </>
    );
  }

  return (
    <View style={[styles.container, { width: s, height: s }]}>
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        style={{ display: 'block' }}
      >
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.08} />
        {/* Graphic */}
        {iconPath}
      </svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    marginBottom: Space.md,
  },
});
