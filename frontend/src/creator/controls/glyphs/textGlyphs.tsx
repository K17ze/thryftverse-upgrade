import React from 'react';
import { Path, Rect } from 'react-native-svg';
import { STROKE_WIDTH, STROKE_LINECAP, STROKE_LINEJOIN, type GlyphRenderProps } from './glyphShared';

// ── Text ──

export function TextGlyph({ selected }: GlyphRenderProps) {
  // Iconic Story "Aa" typography glyph (Instagram / Snapchat standard)
  if (selected) {
    return (
      <>
        {/* Capital A filled */}
        <Path
          d="M8.5 4L3 19h2.8l1.3-3.7h4.8L13.2 19H16L10.5 4H8.5zm.5 4.5l1.6 4.6H7.9L9 8.5z"
          fill="currentColor"
        />
        {/* Lowercase a filled */}
        <Path
          d="M18.8 10.5h2v8.5h-2v-1.1c-.8.8-1.8 1.3-2.9 1.3-2.4 0-4.1-1.8-4.1-4.1 0-2.4 1.8-4.1 4.1-4.1 1.1 0 2.1.5 2.9 1.3v-1.8zm-2.8 2.2c-1.4 0-2.3 1.1-2.3 2.3s.9 2.3 2.3 2.3 2.3-1.1 2.3-2.3-.9-2.3-2.3-2.3z"
          fill="currentColor"
        />
      </>
    );
  }
  return (
    <>
      {/* Capital A stroke */}
      <Path
        d="M3.5 19L8.5 5h.2L13.7 19"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      <Path
        d="M5.8 14.2h5.8"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        fill="none"
      />
      {/* Lowercase a stroke */}
      <Path
        d="M19.5 11v8"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        fill="none"
      />
      <Path
        d="M19.5 13.5c-.9-1-2.2-1.5-3.5-1.5-2.2 0-3.8 1.6-3.8 3.5s1.6 3.5 3.8 3.5c1.3 0 2.6-.5 3.5-1.5"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        fill="none"
      />
    </>
  );
}

export function TextBackgroundGlyph({ selected }: GlyphRenderProps) {
  // T inside a rounded rectangle — text background
  if (selected) {
    return (
      <>
        <Rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" />
        <Path d="M8 10h8M12 10v6" stroke="currentColor" strokeOpacity={0.4} strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M8 10h8M12 10v6" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function CaptionGlyph({ selected }: GlyphRenderProps) {
  // Rectangle with text lines — caption/subtitle
  if (selected) {
    return (
      <>
        <Rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor" />
        <Path d="M6 10h7M6 14h10" stroke="currentColor" strokeOpacity={0.4} strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M6 10h7M6 14h10" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function AlignLeftGlyph(_props: GlyphRenderProps) {
  // Three text lines aligned to the left edge
  return (
    <>
      <Path d="M4 6h16M4 12h12M4 18h16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function AlignCenterGlyph(_props: GlyphRenderProps) {
  // Three text lines aligned to the center
  return (
    <>
      <Path d="M4 6h16M6 12h12M4 18h16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function AlignRightGlyph(_props: GlyphRenderProps) {
  // Three text lines aligned to the right edge
  return (
    <>
      <Path d="M4 6h16M8 12h12M4 18h16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function BoldGlyph(_props: GlyphRenderProps) {
  return (
    <>
      <Path d="M8 5v14" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Path d="M8 5h6c3 0 3 6 0 6H8" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M8 11h7c3 0 3 8 0 8H8" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function ItalicGlyph(_props: GlyphRenderProps) {
  return (
    <>
      <Path d="M10 6h6" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Path d="M14 6l-4 12" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      <Path d="M8 18h6" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

export function UnderlineGlyph(_props: GlyphRenderProps) {
  return (
    <>
      <Path d="M7 5v10c0 3 10 3 10 0V5" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M5 21h14" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}
