import React from 'react';
import { Path, Circle, Rect } from 'react-native-svg';
import { STROKE_WIDTH, STROKE_LINECAP, STROKE_LINEJOIN, type GlyphRenderProps } from './glyphShared';

// ── Layer / arrangement ──

export function LayersGlyph({ selected }: GlyphRenderProps) {
  // Stacked diamonds — layers
  if (selected) {
    return (
      <>
        <Path d="M12 3l9 5-9 5-9-5 9-5z" fill="currentColor" />
        <Path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      </>
    );
  }
  return (
    <>
      <Path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function ArrangeGlyph({ selected }: GlyphRenderProps) {
  // Squares overlapping — arrange/z-order
  if (selected) {
    return (
      <>
        <Rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" />
        <Rect x="9" y="9" width="12" height="12" rx="2" fill="currentColor" fillOpacity={0.5} stroke="currentColor" strokeWidth={STROKE_WIDTH} />
      </>
    );
  }
  return (
    <>
      <Rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
    </>
  );
}

export function BringForwardGlyph({ selected }: GlyphRenderProps) {
  // Square with up arrow — bring forward
  if (selected) {
    return (
      <>
        <Rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
        <Path d="M12 16V8M12 8l-3 3M12 8l3 3" stroke="currentColor" strokeOpacity={0.4} strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      </>
    );
  }
  return (
    <>
      <Rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M12 16V8M12 8l-3 3M12 8l3 3" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function BringBackGlyph({ selected }: GlyphRenderProps) {
  // Square with down arrow — bring back
  if (selected) {
    return (
      <>
        <Rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
        <Path d="M12 8v8M12 16l-3-3M12 16l3-3" stroke="currentColor" strokeOpacity={0.4} strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      </>
    );
  }
  return (
    <>
      <Rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M12 8v8M12 16l-3-3M12 16l3-3" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

// ── Composition ──

export function SafeZoneGlyph({ selected }: GlyphRenderProps) {
  // Outer frame with inner dashed safe area
  if (selected) {
    return (
      <>
        <Rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
        <Rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" fillOpacity={0.2} />
        <Path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeDasharray="2 2" strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      </>
    );
  }
  return (
    <>
      <Rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeDasharray="2 2" strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function ProductTagGlyph({ selected }: GlyphRenderProps) {
  // Luxury boutique fashion hangtag with eyelet and knotted thread
  if (selected) {
    return (
      <>
        {/* Filled designer tag */}
        <Path
          d="M3.5 12.5L11 5a2 2 0 0 1 1.4-.6H18a2 2 0 0 1 2 2v5.6a2 2 0 0 1-.6 1.4l-7.5 7.5a2 2 0 0 1-2.8 0l-5.6-5.6a2 2 0 0 1 0-2.8z"
          fill="currentColor"
        />
        <Circle cx="15.5" cy="8.5" r="1.5" fill="#000000" fillOpacity={0.5} />
        {/* Cord loop */}
        <Path
          d="M16.5 7.5L20 4a1.5 1.5 0 0 0-2-2l-3.5 3.5"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap={STROKE_LINECAP}
          fill="none"
        />
      </>
    );
  }
  return (
    <>
      <Path
        d="M3.5 12.5L11 5a2 2 0 0 1 1.4-.6H18a2 2 0 0 1 2 2v5.6a2 2 0 0 1-.6 1.4l-7.5 7.5a2 2 0 0 1-2.8 0l-5.6-5.6a2 2 0 0 1 0-2.8z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      <Circle
        cx="15.5"
        cy="8.5"
        r="1.5"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      <Path
        d="M16.5 7.5L20 4a1.5 1.5 0 0 0-2-2l-3.5 3.5"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        fill="none"
      />
    </>
  );
}

export function MultiSelectGlyph({ selected }: GlyphRenderProps) {
  // Two overlapping dashed squares — multi-select
  if (selected) {
    return (
      <>
        <Rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" />
        <Rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeDasharray="3 2" fill="none" />
      </>
    );
  }
  return (
    <>
      <Rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeDasharray="3 2" fill="none" />
    </>
  );
}
