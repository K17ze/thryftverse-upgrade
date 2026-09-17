import React from 'react';
import { Path, Circle, Rect } from 'react-native-svg';
import { STROKE_WIDTH, STROKE_LINECAP, STROKE_LINEJOIN, type GlyphRenderProps } from './glyphShared';

// ── Color / style ──

export function GradientGlyph({ selected }: GlyphRenderProps) {
  // Rectangle with a diagonal gradient indicator
  if (selected) {
    return (
      <>
        <Rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" />
        <Path d="M5 17L19 7" stroke="currentColor" strokeOpacity={0.4} strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeDasharray="2 2" fill="none" />
      </>
    );
  }
  return (
    <>
      <Rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M5 17L19 7" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeDasharray="2 2" fill="none" />
    </>
  );
}

export function EyedropperGlyph({ selected }: GlyphRenderProps) {
  // Eyedropper / pipette
  if (selected) {
    return (
      <>
        <Path d="M17 3l4 4-3 3-4-4 3-3z" fill="currentColor" />
        <Path d="M14 6L4 16v4h4L18 10" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      </>
    );
  }
  return (
    <>
      <Path d="M17 3l4 4-3 3-4-4 3-3z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M14 6L4 16v4h4L18 10" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function OpacityGlyph({ selected }: GlyphRenderProps) {
  // Circle with half fill — opacity checkerboard pattern
  if (selected) {
    return (
      <>
        <Circle cx="12" cy="12" r="9" fill="currentColor" />
        <Path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" fillOpacity={0.4} />
      </>
    );
  }
  return (
    <>
      <Circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M12 3v18" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" fillOpacity={0.25} />
    </>
  );
}

export function StrokeGlyph({ selected }: GlyphRenderProps) {
  // Path with stroke weight indicator
  if (selected) {
    return (
      <>
        <Path d="M4 12h16" stroke="currentColor" strokeWidth={3.5} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Path d="M4 12h16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Path d="M4 7h16M4 17h16" stroke="currentColor" strokeWidth={STROKE_WIDTH * 0.6} strokeLinecap={STROKE_LINECAP} strokeOpacity={0.4} />
    </>
  );
}

export function ShadowGlyph({ selected }: GlyphRenderProps) {
  // Square with offset shadow
  if (selected) {
    return (
      <>
        <Rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" />
        <Rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" fillOpacity={0.3} />
      </>
    );
  }
  return (
    <>
      <Rect x="3" y="3" width="13" height="13" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" strokeOpacity={0.4} />
    </>
  );
}

// ── Adjust / enhance ──

export function EnhanceGlyph({ selected }: GlyphRenderProps) {
  // Sparkle / magic wand — enhance
  if (selected) {
    return (
      <>
        <Path d="M14 3l1.5 4.5L20 9l-4.5 1.5L14 15l-1.5-4.5L8 9l4.5-1.5L14 3z" fill="currentColor" />
        <Path d="M5 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="currentColor" fillOpacity={0.6} />
      </>
    );
  }
  return (
    <>
      <Path d="M14 3l1.5 4.5L20 9l-4.5 1.5L14 15l-1.5-4.5L8 9l4.5-1.5L14 3z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M5 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function AdjustGlyph({ selected }: GlyphRenderProps) {
  // Sliders — adjust settings
  if (selected) {
    return (
      <>
        <Path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
        <Circle cx="16" cy="6" r="2" fill="currentColor" />
        <Circle cx="8" cy="12" r="2" fill="currentColor" />
        <Circle cx="14" cy="18" r="2" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Circle cx="16" cy="6" r="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="14" cy="18" r="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
    </>
  );
}

export function FilterGlyph({ selected }: GlyphRenderProps) {
  // Iconic Instagram Stories magic sparkles cluster (effects/filters)
  if (selected) {
    return (
      <>
        {/* Dominant center sparkle */}
        <Path
          d="M12 2.5c0 3.6 3 6.5 6.5 6.5-3.5 0-6.5 2.9-6.5 6.5 0-3.6-3-6.5-6.5-6.5 3.5 0 6.5-2.9 6.5-6.5z"
          fill="currentColor"
        />
        {/* Secondary lower-left sparkle */}
        <Path
          d="M5.5 14c0 2 1.6 3.5 3.5 3.5-1.9 0-3.5 1.5-3.5 3.5 0-2-1.6-3.5-3.5-3.5 1.9 0 3.5-1.5 3.5-3.5z"
          fill="currentColor"
        />
        {/* Accent right twinkle */}
        <Path
          d="M19 15.5c0 1.3 1 2.5 2.5 2.5-1.5 0-2.5 1.2-2.5 2.5 0-1.3-1-2.5-2.5-2.5 1.5 0 2.5-1.2 2.5-2.5z"
          fill="currentColor"
        />
      </>
    );
  }
  return (
    <>
      <Path
        d="M12 2.5c0 3.6 3 6.5 6.5 6.5-3.5 0-6.5 2.9-6.5 6.5 0-3.6-3-6.5-6.5-6.5 3.5 0 6.5-2.9 6.5-6.5z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      <Path
        d="M5.5 14c0 2 1.6 3.5 3.5 3.5-1.9 0-3.5 1.5-3.5 3.5 0-2-1.6-3.5-3.5-3.5 1.9 0 3.5-1.5 3.5-3.5z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      <Path
        d="M19 15.5c0 1.3 1 2.5 2.5 2.5-1.5 0-2.5 1.2-2.5 2.5 0-1.3-1-2.5-2.5-2.5 1.5 0 2.5-1.2 2.5-2.5z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
    </>
  );
}
