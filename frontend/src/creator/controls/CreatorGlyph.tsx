/**
 * CreatorGlyph — purpose-built SVG glyph system for creator-specific concepts.
 *
 * Editorial/creative tools (trim, split, crop, keyframe, speed-curve, waveform,
 * layers, etc.) get custom SVG paths with a consistent optical system:
 *   - 24×24 viewBox
 *   - 1.9 stroke width (within the 1.75–2.0 spec band)
 *   - round caps and joins
 *   - matched optical weight across all glyphs
 *   - selected/filled variants where meaningful
 *   - pixel-aligned at common DPR
 *
 * Universally understood actions (close, back, play, pause, search, delete,
 * share, camera-flip, chevron, plus, check, settings) are NOT duplicated here —
 * consumers should use Ionicons from @expo/vector-icons for those.
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §1 (Purpose-built creator glyph layer)
 *   - AGENTS.md §4 (Icon grammar: one family, one optical band, stable rule)
 *   - AGENTS.md §13 (Control quality)
 */
import React from 'react';
import { Svg, Path, G, Circle, Rect, Line, Defs, ClipPath } from 'react-native-svg';

// ── Types ────────────────────────────────────────────────────────────

/**
 * All creator-specific glyph names. Universally understood actions
 * (close, back, play, etc.) are intentionally excluded — use Ionicons.
 */
export type CreatorGlyphName =
  // Video / timeline editing
  | 'trim'
  | 'split'
  | 'crop'
  | 'rotate'
  | 'cutout'
  | 'keyframe'
  | 'speed-curve'
  | 'waveform'
  | 'reverse'
  | 'freeze-frame'
  | 'fade-in'
  | 'fade-out'
  // Layer / arrangement
  | 'layers'
  | 'arrange'
  | 'bring-forward'
  | 'bring-back'
  // Color / style
  | 'gradient'
  | 'eyedropper'
  | 'opacity'
  | 'stroke'
  | 'shadow'
  // Text
  | 'text'
  | 'text-background'
  | 'caption'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  // Composition
  | 'safe-zone'
  | 'product-tag'
  | 'multi-select'
  // Adjust / enhance
  | 'enhance'
  | 'adjust'
  | 'filter'
  // Creative tools
  | 'drawing'
  | 'sticker'
  // Audio
  | 'audio'
  | 'music'
  | 'voiceover'
  // History
  | 'undo'
  | 'redo';

export interface CreatorGlyphProps {
  /** Which glyph to render. */
  name: CreatorGlyphName;
  /** Glyph size in points (default 24). */
  size?: number;
  /** Stroke / fill color. */
  color?: string;
  /** When true, renders the filled/selected variant where meaningful. */
  selected?: boolean;
  /** Optional accessibility label for screen readers. */
  accessibilityLabel?: string;
  /** Test ID for testing. */
  testID?: string;
}

// ── Constants ────────────────────────────────────────────────────────

const VIEWBOX = 24;
const STROKE_WIDTH = 1.9;
const STROKE_LINECAP = 'round';
const STROKE_LINEJOIN = 'round';

// ── Glyph renderers ──────────────────────────────────────────────────
// Each function returns the inner SVG elements for a glyph.
// `selected` switches to a filled variant where it makes semantic sense.

interface GlyphRenderProps {
  selected: boolean;
}

// ── Video / timeline editing ──

function TrimGlyph({ selected }: GlyphRenderProps) {
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

function SplitGlyph({ selected }: GlyphRenderProps) {
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

function CropGlyph({ selected }: GlyphRenderProps) {
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

function RotateGlyph({ selected }: GlyphRenderProps) {
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

function CutoutGlyph({ selected }: GlyphRenderProps) {
  // Dashed rectangle with a cut-out shape inside — mask/cutout
  if (selected) {
    return (
      <>
        <Rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
        <Path d="M9 9l6 6M15 9l-6 6" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} fill="none" />
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

function KeyframeGlyph({ selected }: GlyphRenderProps) {
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

function SpeedCurveGlyph({ selected }: GlyphRenderProps) {
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

function WaveformGlyph({ selected }: GlyphRenderProps) {
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

function ReverseGlyph({ selected }: GlyphRenderProps) {
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

function FreezeFrameGlyph({ selected }: GlyphRenderProps) {
  // Play triangle inside a snowflake-ish frame — freeze frame
  if (selected) {
    return (
      <>
        <Rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" />
        <Path d="M10 9l5 3-5 3V9z" fill="white" />
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

function FadeInGlyph({ selected }: GlyphRenderProps) {
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

function FadeOutGlyph({ selected }: GlyphRenderProps) {
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

// ── Layer / arrangement ──

function LayersGlyph({ selected }: GlyphRenderProps) {
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

function ArrangeGlyph({ selected }: GlyphRenderProps) {
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

function BringForwardGlyph({ selected }: GlyphRenderProps) {
  // Square with up arrow — bring forward
  if (selected) {
    return (
      <>
        <Rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
        <Path d="M12 16V8M12 8l-3 3M12 8l3 3" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
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

function BringBackGlyph({ selected }: GlyphRenderProps) {
  // Square with down arrow — bring back
  if (selected) {
    return (
      <>
        <Rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
        <Path d="M12 8v8M12 16l-3-3M12 16l3-3" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
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

// ── Color / style ──

function GradientGlyph({ selected }: GlyphRenderProps) {
  // Rectangle with a diagonal gradient indicator
  if (selected) {
    return (
      <>
        <Rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" />
        <Path d="M5 17L19 7" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeDasharray="2 2" fill="none" />
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

function EyedropperGlyph({ selected }: GlyphRenderProps) {
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

function OpacityGlyph({ selected }: GlyphRenderProps) {
  // Circle with half fill — opacity checkerboard pattern
  if (selected) {
    return (
      <>
        <Circle cx="12" cy="12" r="9" fill="currentColor" />
        <Path d="M12 3a9 9 0 0 1 0 18z" fill="white" fillOpacity={0.4} />
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

function StrokeGlyph({ selected }: GlyphRenderProps) {
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

function ShadowGlyph({ selected }: GlyphRenderProps) {
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

// ── Text ──

function TextGlyph({ selected }: GlyphRenderProps) {
  // Capital T — text tool
  if (selected) {
    return (
      <>
        <Path d="M5 5h14M12 5v14" stroke="currentColor" strokeWidth={3} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Path d="M5 5h14M12 5v14" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

function TextBackgroundGlyph({ selected }: GlyphRenderProps) {
  // T inside a rounded rectangle — text background
  if (selected) {
    return (
      <>
        <Rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" />
        <Path d="M8 10h8M12 10v6" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
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

function CaptionGlyph({ selected }: GlyphRenderProps) {
  // Rectangle with text lines — caption/subtitle
  if (selected) {
    return (
      <>
        <Rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor" />
        <Path d="M6 10h7M6 14h10" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
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

function AlignLeftGlyph(_props: GlyphRenderProps) {
  // Three text lines aligned to the left edge
  return (
    <>
      <Path d="M4 6h16M4 12h12M4 18h16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

function AlignCenterGlyph(_props: GlyphRenderProps) {
  // Three text lines aligned to the center
  return (
    <>
      <Path d="M4 6h16M6 12h12M4 18h16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

function AlignRightGlyph(_props: GlyphRenderProps) {
  // Three text lines aligned to the right edge
  return (
    <>
      <Path d="M4 6h16M8 12h12M4 18h16" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

// ── Composition ──

function SafeZoneGlyph({ selected }: GlyphRenderProps) {
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

function ProductTagGlyph({ selected }: GlyphRenderProps) {
  // Tag shape with a dot — product tag
  if (selected) {
    return (
      <>
        <Path d="M3 12l9-9h9v9l-9 9-9-9z" fill="currentColor" />
        <Circle cx="16" cy="8" r="1.5" fill="white" />
      </>
    );
  }
  return (
    <>
      <Path d="M3 12l9-9h9v9l-9 9-9-9z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Circle cx="16" cy="8" r="1.5" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
    </>
  );
}

function MultiSelectGlyph({ selected }: GlyphRenderProps) {
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

// ── Adjust / enhance ──

function EnhanceGlyph({ selected }: GlyphRenderProps) {
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

function AdjustGlyph({ selected }: GlyphRenderProps) {
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

function FilterGlyph({ selected }: GlyphRenderProps) {
  // Three overlapping circles — filter
  if (selected) {
    return (
      <>
        <Circle cx="9" cy="9" r="5" fill="currentColor" fillOpacity={0.5} />
        <Circle cx="15" cy="9" r="5" fill="currentColor" fillOpacity={0.5} />
        <Circle cx="12" cy="15" r="5" fill="currentColor" fillOpacity={0.5} />
      </>
    );
  }
  return (
    <>
      <Circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="15" cy="9" r="5" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="12" cy="15" r="5" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
    </>
  );
}

// ── Creative tools ──

function DrawingGlyph({ selected }: GlyphRenderProps) {
  // Pencil / brush — drawing tool
  if (selected) {
    return (
      <>
        <Path d="M16 3l5 5-12 12H4v-5L16 3z" fill="currentColor" />
        <Path d="M14 5l5 5" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
      </>
    );
  }
  return (
    <>
      <Path d="M16 3l5 5-12 12H4v-5L16 3z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M14 5l5 5" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} />
    </>
  );
}

function StickerGlyph({ selected }: GlyphRenderProps) {
  // Sticker with a peeled corner
  if (selected) {
    return (
      <>
        <Path d="M3 4a1 1 0 0 1 1-1h12l5 5v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" fill="currentColor" />
        <Path d="M16 3v5h5" stroke="white" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      </>
    );
  }
  return (
    <>
      <Path d="M3 4a1 1 0 0 1 1-1h12l5 5v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Path d="M16 3v5h5" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
    </>
  );
}

// ── Audio ──

function AudioGlyph({ selected }: GlyphRenderProps) {
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

function MusicGlyph({ selected }: GlyphRenderProps) {
  // Music note
  if (selected) {
    return (
      <>
        <Path d="M9 18V5l11-2v13" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
        <Circle cx="6" cy="18" r="3" fill="currentColor" />
        <Circle cx="17" cy="16" r="3" fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <Path d="M9 18V5l11-2v13" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap={STROKE_LINECAP} strokeLinejoin={STROKE_LINEJOIN} fill="none" />
      <Circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
      <Circle cx="17" cy="16" r="3" stroke="currentColor" strokeWidth={STROKE_WIDTH} fill="none" />
    </>
  );
}

function VoiceoverGlyph({ selected }: GlyphRenderProps) {
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

function UndoGlyph({ selected }: GlyphRenderProps) {
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

function RedoGlyph({ selected }: GlyphRenderProps) {
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

// ── Glyph registry ───────────────────────────────────────────────────

const GLYPH_REGISTRY: Record<CreatorGlyphName, (props: GlyphRenderProps) => React.ReactElement> = {
  trim: TrimGlyph,
  split: SplitGlyph,
  crop: CropGlyph,
  rotate: RotateGlyph,
  cutout: CutoutGlyph,
  keyframe: KeyframeGlyph,
  'speed-curve': SpeedCurveGlyph,
  waveform: WaveformGlyph,
  reverse: ReverseGlyph,
  'freeze-frame': FreezeFrameGlyph,
  'fade-in': FadeInGlyph,
  'fade-out': FadeOutGlyph,
  layers: LayersGlyph,
  arrange: ArrangeGlyph,
  'bring-forward': BringForwardGlyph,
  'bring-back': BringBackGlyph,
  gradient: GradientGlyph,
  eyedropper: EyedropperGlyph,
  opacity: OpacityGlyph,
  stroke: StrokeGlyph,
  shadow: ShadowGlyph,
  text: TextGlyph,
  'text-background': TextBackgroundGlyph,
  caption: CaptionGlyph,
  'align-left': AlignLeftGlyph,
  'align-center': AlignCenterGlyph,
  'align-right': AlignRightGlyph,
  'safe-zone': SafeZoneGlyph,
  'product-tag': ProductTagGlyph,
  'multi-select': MultiSelectGlyph,
  enhance: EnhanceGlyph,
  adjust: AdjustGlyph,
  filter: FilterGlyph,
  drawing: DrawingGlyph,
  sticker: StickerGlyph,
  audio: AudioGlyph,
  music: MusicGlyph,
  voiceover: VoiceoverGlyph,
  undo: UndoGlyph,
  redo: RedoGlyph,
};

// ── Component ────────────────────────────────────────────────────────

/**
 * Renders a purpose-built creator glyph at the given size and color.
 *
 * All custom glyphs use a 24×24 viewBox with consistent 1.9 stroke width,
 * round caps and joins, and matched optical weight. When `selected` is true,
 * glyphs that have a meaningful filled variant render as filled shapes.
 *
 * For universally understood actions (close, back, play, pause, search,
 * delete, share, camera-flip, chevron, plus, check, settings), use Ionicons
 * from @expo/vector-icons instead.
 */
export function CreatorGlyph({
  name,
  size = 24,
  color = '#000000',
  selected = false,
  accessibilityLabel,
  testID,
}: CreatorGlyphProps): React.ReactElement {
  const GlyphRenderer = GLYPH_REGISTRY[name];
  if (!GlyphRenderer) {
    if (__DEV__) {
      console.warn(`CreatorGlyph: unknown glyph name "${name}"`);
    }
    return <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} />;
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="none"
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      testID={testID}
    >
      <G color={color}>
        <GlyphRenderer selected={selected} />
      </G>
    </Svg>
  );
}

export default CreatorGlyph;
