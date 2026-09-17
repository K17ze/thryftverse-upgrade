import React from 'react';
import { Path, Circle, Rect, Line } from 'react-native-svg';
import { STROKE_WIDTH, STROKE_LINECAP, STROKE_LINEJOIN, type GlyphRenderProps } from './glyphShared';

// ── Video / timeline editing ──

export function TrimGlyph({ selected }: GlyphRenderProps) {
  // Brackets on both sides of a timeline segment — trim handles
  if (selected) {
    return (
      <>
        <Path d="M6 4v16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
        <Path d="M18 4v16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
        <Rect x="6" y="7" width="12" height="10" rx="2" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path d="M6 4v16M6 4l-2 2M6 4l2 2M6 20l-2-2M6 20l2-2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M18 4v16M18 4l-2 2M18 4l2 2M18 20l-2-2M18 20l2-2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M8 12h8" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
    </>
  );
}

export function SplitGlyph({ selected }: GlyphRenderProps) {
  // Scissors-like split: two diverging arrows from a center point
  if (selected) {
    return (
      <>
        <Circle cx="6" cy="7" r="2" fill="currentColor" />
        <Circle cx="6" cy="17" r="2" fill="currentColor" />
        <Path d="M8 8l10 8M8 16l10-8" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
      </>
    );
  }
  return (
    <>
      <Circle cx="6" cy="7" r="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="6" cy="17" r="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M8 8l10 8M8 16l10-8" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
    </>
  );
}

export function CropGlyph({ selected }: GlyphRenderProps) {
  // Classic crop corners
  const sw = STROKE_WIDTH;
  if (selected) {
    return (
      <>
        <Path d="M6 2v14a2 2 0 0 0 2 2h14" stroke="currentColor" strokeWidth={sw} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
        <Path d="M2 6h14a2 2 0 0 1 2 2v14" stroke="currentColor" strokeWidth={sw} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      </>
    );
  }
  return (
    <>
      <Path d="M6 2v14a2 2 0 0 0 2 2h14" stroke="currentColor" strokeWidth={sw} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M2 6h14a2 2 0 0 1 2 2v14" stroke="currentColor" strokeWidth={sw} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M2 6l2-2M6 2L4 4M22 18l-2 2M18 22l2-2" stroke="currentColor" strokeWidth={sw} strokeLinecap={STROKE_LINECAP} fill="none" />
    </>
  );
}

export function RotateGlyph({ selected }: GlyphRenderProps) {
  // Circular arrow with rotation pivot
  if (selected) {
    return (
      <>
        <Path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
        <Path d="M20 4v4h-4" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
        <Circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
      <Path d="M20 4v4h-4" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
    </>
  );
}

export function CutoutGlyph({ selected }: GlyphRenderProps) {
  // Dashed rectangle with a cut-out shape inside — mask/cutout
  if (selected) {
    return (
      <>
        <Rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
        <Path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeOpacity={0.4} strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
      </>
    );
  }
  return (
    <>
      <Path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeDasharray="3 2" strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
    </>
  );
}

export function KeyframeGlyph({ selected }: GlyphRenderProps) {
  // Diamond keyframe on a timeline
  if (selected) {
    return (
      <>
        <Path d="M12 4l8 8-8 8-8-8z" fill="currentColor" />
        <Path d="M3 12h2M19 12h2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Path d="M12 4l8 8-8 8-8-8z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M3 12h2M19 12h2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function SpeedCurveGlyph({ selected }: GlyphRenderProps) {
  // Bezier curve with control points — speed curve editor
  if (selected) {
    return (
      <>
        <Path d="M3 18C8 18 8 6 21 6" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
        <Circle cx="3" cy="18" r="2" fill="currentColor" />
        <Circle cx="21" cy="6" r="2" fill="currentColor" />
        <Path d="M3 18l5-5M21 6l-5 5" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeDasharray="2 2" fill="none" />
      </>
    );
  }
  return (
    <>
      <Path d="M3 18C8 18 8 6 21 6" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
      <Circle cx="3" cy="18" r="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="21" cy="6" r="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M3 18l5-5M21 6l-5 5" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeDasharray="2 2" fill="none" />
    </>
  );
}

export function WaveformGlyph({ selected }: GlyphRenderProps) {
  // Vertical bars of varying height — audio waveform
  const bars = [
    { x: 3, h: 6 },
    { x: 6, h: 12 },
    { x: 9, h: 18 },
    { x: 12, h: 10 },
    { x: 15, h: 16 },
    { x: 18, h: 8 },
    { x: 21, h: 12 },
  ];
  const cy = 12;
  return (
    <>
      {bars.map((b, i) => {
        const y1 = cy - b.h / 2;
        const y2 = cy + b.h / 2;
        return selected ? (
          <Rect key={i} x={b.x - 1} y={y1} width="2" height={b.h} rx="1" fill="currentColor" />
        ) : (
          <Line key={i} x1={b.x} y1={y1} x2={b.x} y2={y2} stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
        );
      })}
    </>
  );
}

export function ReverseGlyph({ selected }: GlyphRenderProps) {
  // Two arrows pointing left — reverse direction
  if (selected) {
    return (
      <>
        <Path d="M11 7L4 12l7 5V7z" fill="currentColor" />
        <Path d="M20 7l-7 5 7 5V7z" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path d="M11 7L4 12l7 5V7z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M20 7l-7 5 7 5V7z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function FreezeFrameGlyph({ selected }: GlyphRenderProps) {
  // Play triangle inside a snowflake-ish frame — freeze frame
  if (selected) {
    return (
      <>
        <Rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" />
        <Path d="M10 9l5 3-5 3V9z" fill="currentColor" fillOpacity={0.4} />
      </>
    );
  }
  return (
    <>
      <Rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M10 9l5 3-5 3V9z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M12 2v3M12 19v3" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function FadeInGlyph({ selected }: GlyphRenderProps) {
  // Circle fading in from left — sun rising over horizon
  if (selected) {
    return (
      <>
        <Path d="M3 16h18" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
        <Circle cx="9" cy="16" r="4" fill="currentColor" />
        <Path d="M9 4v3M4 8l2 2M14 8l-2 2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Path d="M3 16h18" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Circle cx="9" cy="16" r="4" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M9 4v3M4 8l2 2M14 8l-2 2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function FadeOutGlyph({ selected }: GlyphRenderProps) {
  // Circle setting to right — fade out
  if (selected) {
    return (
      <>
        <Path d="M3 16h18" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
        <Circle cx="15" cy="16" r="4" fill="currentColor" />
        <Path d="M15 4v3M10 8l2 2M20 8l-2 2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Path d="M3 16h18" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Circle cx="15" cy="16" r="4" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M15 4v3M10 8l2 2M20 8l-2 2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}
