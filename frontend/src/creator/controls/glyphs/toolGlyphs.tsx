import React from 'react';
import { Path, Circle, Rect } from 'react-native-svg';
import { STROKE_WIDTH, STROKE_LINECAP, STROKE_LINEJOIN, type GlyphRenderProps } from './glyphShared';

// ── Creative tools ──

export function DrawingGlyph({ selected }: GlyphRenderProps) {
  // Iconic calligraphy marker with creative ink wave (Instagram/Snapchat doodle)
  if (selected) {
    return (
      <>
        <Path
          d="M17.5 3.5l3 3-9 9-4.5 1.5 1.5-4.5 9-9z"
          fill="currentColor"
        />
        <Path
          d="M3 20.5c3-1.5 5 1.5 8 0s5-1.5 8 0"
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
        d="M17.5 3.5l3 3-9 9-4.5 1.5 1.5-4.5 9-9z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      <Path
        d="M14.5 6.5l3 3"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
      />
      <Path
        d="M3 20.5c3-1.5 5 1.5 8 0s5-1.5 8 0"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        fill="none"
      />
    </>
  );
}

export function StickerGlyph({ selected }: GlyphRenderProps) {
  // Iconic peeled smiley sticker (Instagram / Snapchat Stories standard)
  if (selected) {
    return (
      <>
        {/* Sticker body with peeled fold */}
        <Path
          d="M4 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10l7-7V5a2 2 0 0 0-2-2H4z"
          fill="currentColor"
        />
        {/* Folded flap */}
        <Path
          d="M14 21v-5a2 2 0 0 1 2-2h5l-7 7z"
          fill="currentColor"
          fillOpacity={0.6}
        />
        {/* Eyes (contrast cutout) */}
        <Circle cx="8" cy="10" r="1.5" fill="#000000" fillOpacity={0.6} />
        <Circle cx="14" cy="10" r="1.5" fill="#000000" fillOpacity={0.6} />
        {/* Cheerful smile */}
        <Path
          d="M8 14c1.2 1.8 3.8 1.8 5 0"
          stroke="#000000"
          strokeOpacity={0.6}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap={STROKE_LINECAP}
          fill="none"
        />
      </>
    );
  }
  return (
    <>
      {/* Outer sticker boundary with peel corner */}
      <Path
        d="M4 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10l7-7V5a2 2 0 0 0-2-2H4z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      {/* Peeled flap crease */}
      <Path
        d="M14 21v-5a2 2 0 0 1 2-2h5"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      {/* Smiley eyes */}
      <Circle cx="8" cy="10" r="1.2" fill="currentColor" />
      <Circle cx="14" cy="10" r="1.2" fill="currentColor" />
      {/* Smile */}
      <Path
        d="M8 14c1.2 1.8 3.8 1.8 5 0"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        fill="none"
      />
    </>
  );
}

// ── Audio ──

export function AudioGlyph({ selected }: GlyphRenderProps) {
  // Speaker with sound waves
  if (selected) {
    return (
      <>
        <Path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <Path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
      </>
    );
  }
  return (
    <>
      <Path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
    </>
  );
}

export function MusicGlyph({ selected }: GlyphRenderProps) {
  // Beamed eighth notes with angled noteheads (Instagram Music standard)
  if (selected) {
    return (
      <>
        <Path
          d="M9 16V4.5l11-2v11.5"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap={STROKE_LINECAP}
          strokeLinejoin={STROKE_LINEJOIN}
          fill="none"
        />
        <Path
          d="M9 7.5l11-2"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH + 1}
          strokeLinecap={STROKE_LINECAP}
        />
        <Circle cx="6.5" cy="16.5" r="3" fill="currentColor" />
        <Circle cx="17.5" cy="14.5" r="3" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path
        d="M9 16V4.5l11-2v11.5"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        strokeLinejoin={STROKE_LINEJOIN}
        fill="none"
      />
      <Path
        d="M9 7.5l11-2"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH + 1}
        strokeLinecap={STROKE_LINECAP}
      />
      <Circle cx="6.5" cy="16.5" r="3" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="17.5" cy="14.5" r="3" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
    </>
  );
}

export function VoiceoverGlyph({ selected }: GlyphRenderProps) {
  // Microphone — voiceover
  if (selected) {
    return (
      <>
        <Rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
        <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
      </>
    );
  }
  return (
    <>
      <Rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
    </>
  );
}

// ── History ──

export function UndoGlyph({ selected }: GlyphRenderProps) {
  // Curved arrow pointing left — undo
  if (selected) {
    return (
      <>
        <Path d="M9 7L3 12l6 5v-3h6a4 4 0 0 1 0 8h-2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
        <Path d="M9 7L3 12l6 5" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path d="M9 7L3 12l6 5v-3h6a4 4 0 0 1 0 8h-2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

export function RedoGlyph({ selected }: GlyphRenderProps) {
  // Curved arrow pointing right — redo
  if (selected) {
    return (
      <>
        <Path d="M15 7l6 5-6 5v-3H9a4 4 0 0 0 0 8h2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
        <Path d="M15 7l6 5-6 5" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path d="M15 7l6 5-6 5v-3H9a4 4 0 0 0 0 8h2" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}
