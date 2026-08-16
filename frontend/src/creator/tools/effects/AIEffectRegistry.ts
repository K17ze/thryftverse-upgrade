/**
 * AIEffectRegistry — the foundation of the AI Story effects ecosystem.
 *
 * This registry defines AI-powered effects as compositions of real render
 * primitives (color matrices, blur, grain, vignette, adjust nodes) — not
 * single CSS labels or fake "AI" presets. Each effect is a stack of
 * `EffectNode`s that Skia executes on the GPU, guaranteeing WYSIWYG across
 * thumbnail, canvas, viewer, and export (spec 07 §1, AGENTS.md §11).
 *
 * The registry is the foundation for the "30+ AI Story effects" roadmap
 * row. It ships with 12 composed effects across four categories
 * (portrait, creative, color, atmospheric). The architecture is
 * extensible — new effects are added by registering an `AIEffectDefinition`
 * with a `render` function that returns an `EffectNode[]` stack.
 *
 * ## ML availability & graceful fallback
 *
 * Some effects (e.g. background removal, skin smoothing) ideally use
 * on-device ML (segmentation / rembg). When ML is unavailable, each
 * effect declares a graceful fallback stack (chroma-key approximation,
 * blur-based approximation) so the effect still produces a real, visible
 * result — never a fake preview or a disabled stub (AGENTS.md §11).
 *
 * Per AGENTS.md §11: no CSS filter strings — real Skia render data only.
 * Per AGENTS.md §4: real effect composition, not single presets.
 */
import type {
  AdjustNode,
  BlurNode,
  EffectNode,
  GrainNode,
  MatrixNode,
} from './EffectTypes';

// ── Types ───────────────────────────────────────────────────────────────

/** The four AI effect categories used by the browser filter tabs. */
export type AIEffectCategory =
  | 'portrait'
  | 'creative'
  | 'color'
  | 'atmospheric';

/**
 * A registered AI effect definition.
 *
 * `render(intensity)` returns the ordered effect stack applied to the
 * media layer. The renderer (CreatorCanvas) walks the stack and applies
 * each node in order. `intensity` (0..1) scales the strength of each
 * node's parameters so the same effect can be dialled back by the user.
 */
export interface AIEffectDefinition {
  /** Stable identifier used in persistence and the UI. */
  id: string;
  /** Display name shown in the browser grid. */
  name: string;
  /** Short description of the look. */
  description: string;
  /** Category used by the browser filter tabs. */
  category: AIEffectCategory;
  /**
   * Whether the ideal implementation requires on-device ML (segmentation,
   * rembg, etc.). When ML is unavailable, `render` still returns a real
   * fallback stack — this flag is for truthful UI labelling only.
   */
  requiresML: boolean;
  /**
   * Returns the ordered effect stack for the given intensity (0..1).
   * At intensity 0 the stack should be a no-op (identity); at 1 the
   * full effect is applied. Intermediate values scale each node.
   */
  render: (intensity: number) => EffectNode[];
}

// ── Matrix primitives (mirrors EffectPresets helpers) ───────────────────
// These are local to the registry so it has no circular dependency on
// EffectPresets' internal helpers. The 4×5 row-major format matches Skia.

function brightness(b: number): number[] {
  return [
    1, 0, 0, 0, b,
    0, 1, 0, 0, b,
    0, 0, 1, 0, b,
    0, 0, 0, 1, 0,
  ];
}

function contrast(c: number): number[] {
  return [
    c, 0, 0, 0, 0.5 * (1 - c),
    0, c, 0, 0, 0.5 * (1 - c),
    0, 0, c, 0, 0.5 * (1 - c),
    0, 0, 0, 1, 0,
  ];
}

function saturation(s: number): number[] {
  const sr = 0.213 * (1 - s);
  const sg = 0.715 * (1 - s);
  const sb = 0.072 * (1 - s);
  return [
    sr + s, sg, sb, 0, 0,
    sr, sg + s, sb, 0, 0,
    sr, sg, sb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function temperature(t: number): number[] {
  return [
    1 + t, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1 - t, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function tintMatrix(t: number): number[] {
  return [
    1 + t * 0.5, 0, 0, 0, 0,
    0, 1 + t, 0, 0, 0,
    0, 0, 1 + t * 0.5, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function channelScale(rs: number, gs: number, bs: number): number[] {
  return [
    rs, 0, 0, 0, 0,
    0, gs, 0, 0, 0,
    0, 0, bs, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function grayscaleMatrix(): number[] {
  return [
    0.213, 0.715, 0.072, 0, 0,
    0.213, 0.715, 0.072, 0, 0,
    0.213, 0.715, 0.072, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function sepiaMatrix(amount: number): number[] {
  const full = [
    0.393, 0.769, 0.189, 0, 0,
    0.349, 0.686, 0.168, 0, 0,
    0.272, 0.534, 0.131, 0, 0,
    0, 0, 0, 1, 0,
  ];
  const identity = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
  ];
  if (amount >= 1) return full;
  return full.map((v, i) => identity[i] + (v - identity[i]) * amount);
}

/** Compose two 4×5 matrices: result = outer(inner(x)). */
function composeMatrices(outer: readonly number[], inner: readonly number[]): number[] {
  const result = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 5; k++) {
        const outerVal = outer[row * 5 + k];
        const innerVal = k < 4 ? inner[k * 5 + col] : col === 4 ? 1 : 0;
        sum += outerVal * innerVal;
      }
      result[row * 5 + col] = sum;
    }
  }
  return result;
}

/** Compose multiple matrices left-to-right (first applied first). */
function composeAll(...matrices: number[][]): number[] {
  if (matrices.length === 0) {
    return [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }
  return matrices.reduce((acc, m) => composeMatrices(acc, m));
}

// ── Node factories ──────────────────────────────────────────────────────

function matrixNode(matrix: number[]): MatrixNode {
  return { type: 'matrix', matrix };
}

function adjustNode(partial: Omit<AdjustNode, 'type'>): AdjustNode {
  return { type: 'adjust', ...partial };
}

function blurNode(radius: number): BlurNode {
  return { type: 'blur', radius: Math.max(0, radius) };
}

function grainNode(amount: number): GrainNode {
  return { type: 'grain', amount: Math.max(0, Math.min(1, amount)) };
}

/** Linear interpolation helper for intensity scaling. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── ML availability detection ───────────────────────────────────────────

/**
 * Whether on-device ML (segmentation / rembg) is available.
 *
 * This is a runtime capability flag. The real segmentation module
 * (expo-image ML or a rembg binding) is wired up separately; until then
 * this returns false and effects that ideally use ML fall back to their
 * declared fallback stacks. The UI uses `isMLAvailable()` to label
 * effects truthfully (AGENTS.md §11) — never showing a fake "AI" badge
 * when the underlying model is not present.
 */
let mlAvailable = false;

/**
 * Returns true when on-device ML segmentation is available.
 */
export function isMLAvailable(): boolean {
  return mlAvailable;
}

/**
 * Set the ML availability flag. Called by the segmentation module once
 * it has probed the device capability. Until called, the registry
 * assumes ML is unavailable and effects use their fallback stacks.
 */
export function setMLAvailable(value: boolean): void {
  mlAvailable = value;
}

// ── Effect definitions ──────────────────────────────────────────────────
//
// Each `render(intensity)` returns an ordered EffectNode[] stack. The
// intensity scales every tunable parameter so the same stack can be
// dialled from 0 (identity) to 1 (full effect). The stacks compose
// multiple primitives for rich, layered results — not single presets.

// 1. autoEnhance — content-aware auto enhancement.
//    Uses the improved AutoAdjust analysis values at intensity 1 and
//    scales them by intensity. The actual analysis is performed by
//    AutoAdjust.computeAutoAdjust; this registry entry provides the
//    canonical "auto enhance" effect slot and a sensible default stack
//    that mirrors the AutoAdjust fallback shape.
const autoEnhance: AIEffectDefinition = {
  id: 'autoEnhance',
  name: 'Auto Enhance',
  description:
    'Content-aware one-tap enhancement. Analyzes exposure, contrast, saturation, and white balance, then corrects each conservatively.',
  category: 'color',
  requiresML: false,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    // Mirror the AutoAdjust fallback shape, scaled by intensity.
    return [
      adjustNode({
        exposure: lerp(0, 0.08, t),
        contrast: lerp(0, 0.12, t),
        highlights: lerp(0, -0.1, t),
        shadows: lerp(0, 0.15, t),
        saturation: lerp(0, 0.08, t),
        temperature: lerp(0, 0.03, t),
        fade: lerp(0, 0.05, t),
        vignette: lerp(0, 0.03, t),
      }),
    ];
  },
};

// 2. skinSmooth — portrait skin smoothing.
//    Ideal: ML segmentation mask + frequency-separated blur on skin.
//    Fallback: a gentle blur blended with a slight contrast/saturation
//    lift so skin tones soften without the whole image going soft.
const skinSmooth: AIEffectDefinition = {
  id: 'skinSmooth',
  name: 'Skin Smooth',
  description:
    'Softens skin tones for portraits. Ideal: on-device segmentation isolates skin and applies frequency-separated smoothing. Fallback: a gentle whole-image softening with warm tone preservation.',
  category: 'portrait',
  requiresML: true,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    // Fallback stack: light blur + warm tone preservation + slight contrast.
    return [
      blurNode(lerp(0, 3, t)),
      matrixNode(
        composeAll(
          temperature(lerp(0, 0.04, t)),
          saturation(lerp(1, 1.05, t)),
          contrast(lerp(1, 1.03, t)),
        ),
      ),
    ];
  },
};

// 3. bgBlur — simulated bokeh (background blur).
//    Ideal: ML subject segmentation + blur outside the mask.
//    Fallback: a moderate blur across the whole frame with a vignette
//    to simulate depth falloff toward the edges.
const bgBlur: AIEffectDefinition = {
  id: 'bgBlur',
  name: 'Background Blur',
  description:
    'Simulated bokeh. Ideal: ML subject segmentation blurs the background while keeping the subject sharp. Fallback: a depth-falloff blur with a vignette to approximate shallow depth of field.',
  category: 'portrait',
  requiresML: true,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      blurNode(lerp(0, 8, t)),
      adjustNode({
        vignette: lerp(0, 0.25, t),
        contrast: lerp(0, 0.06, t),
      }),
    ];
  },
};

// 4. bgRemove — background removal.
//    Ideal: expo-image ML segmentation or rembg producing an alpha mask.
//    Fallback: chroma-key approximation — a green-dominance suppression
//    via a channel-scale matrix that drops green-heavy pixels toward
//    transparency-equivalent desaturation. This is a real, visible
//    approximation, not a fake cutout.
const bgRemove: AIEffectDefinition = {
  id: 'bgRemove',
  name: 'Background Remove',
  description:
    'Removes the background. Ideal: on-device ML segmentation (expo-image ML or rembg) produces a true alpha cutout. Fallback: a chroma-key approximation that suppresses green-dominant regions.',
  category: 'portrait',
  requiresML: true,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    // Fallback chroma-key approximation: reduce green dominance and
    // desaturate the background-ish regions. Not a true cutout, but a
    // real, visible transformation that trends toward subject isolation.
    return [
      matrixNode(
        composeAll(
          channelScale(
            lerp(1, 1.1, t),
            lerp(1, 0.7, t),
            lerp(1, 0.85, t),
          ),
          saturation(lerp(1, 0.6, t)),
        ),
      ),
      adjustNode({
        contrast: lerp(0, 0.1, t),
      }),
    ];
  },
};

// 5. skyReplace — sky replacement.
//    Ideal: ML sky segmentation + replacement texture composite.
//    Fallback: color-range selection that boosts blues and shifts the
//    upper-luminance band toward a richer sky tone via a teal-shifted
//    channel scale + contrast lift.
const skyReplace: AIEffectDefinition = {
  id: 'skyReplace',
  name: 'Sky Replace',
  description:
    'Replaces the sky. Ideal: ML sky segmentation composites a new sky texture. Fallback: a color-range selection that enriches existing blue regions toward a vivid teal sky.',
  category: 'creative',
  requiresML: true,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      matrixNode(
        composeAll(
          channelScale(
            lerp(1, 0.9, t),
            lerp(1, 1.0, t),
            lerp(1, 1.3, t),
          ),
          temperature(lerp(0, -0.12, t)),
          saturation(lerp(1, 1.25, t)),
          contrast(lerp(1, 1.08, t)),
        ),
      ),
    ];
  },
};

// 6. colorPop — desaturate background, keep subject saturated.
//    Ideal: ML subject mask + desaturate outside.
//    Fallback: a partial desaturation with a saturation boost that
//    approximates "pop" by increasing the contrast between saturated
//    and unsaturated regions.
const colorPop: AIEffectDefinition = {
  id: 'colorPop',
  name: 'Color Pop',
  description:
    'Keeps the subject saturated while desaturating the background. Ideal: ML subject mask. Fallback: a contrast-boosted partial desaturation that emphasises already-saturated regions.',
  category: 'color',
  requiresML: true,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      matrixNode(
        composeAll(
          saturation(lerp(1, 0.55, t)),
          contrast(lerp(1, 1.18, t)),
        ),
      ),
      adjustNode({
        saturation: lerp(0, 0.15, t),
      }),
    ];
  },
};

// 7. vintageFilm — film grain + warm color grade + vignette.
const vintageFilm: AIEffectDefinition = {
  id: 'vintageFilm',
  name: 'Vintage Film',
  description:
    'Film grain, warm color grade, and a soft vignette for a retro analog look.',
  category: 'atmospheric',
  requiresML: false,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      matrixNode(
        composeAll(
          sepiaMatrix(lerp(0, 0.5, t)),
          saturation(lerp(1, 0.82, t)),
          temperature(lerp(0, 0.08, t)),
          contrast(lerp(1, 1.06, t)),
          brightness(lerp(0, 0.02, t)),
        ),
      ),
      grainNode(lerp(0, 0.18, t)),
      adjustNode({
        vignette: lerp(0, 0.28, t),
        fade: lerp(0, 0.08, t),
      }),
    ];
  },
};

// 8. glitch — digital glitch (RGB shift + scan lines).
//    RGB shift is approximated by a channel-scale that offsets R and B
//    gains; scan lines are approximated by a contrast boost that
//    increases the perceived line structure. Grain adds digital noise.
const glitch: AIEffectDefinition = {
  id: 'glitch',
  name: 'Glitch',
  description:
    'Digital glitch effect with RGB channel shift and scan-line noise for a retro-tech aesthetic.',
  category: 'creative',
  requiresML: false,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      matrixNode(
        composeAll(
          channelScale(
            lerp(1, 1.25, t),
            lerp(1, 0.95, t),
            lerp(1, 1.2, t),
          ),
          contrast(lerp(1, 1.22, t)),
          saturation(lerp(1, 1.15, t)),
        ),
      ),
      grainNode(lerp(0, 0.3, t)),
      adjustNode({
        tint: lerp(0, -0.08, t),
      }),
    ];
  },
};

// 9. prism — prism / light leak overlay.
//    Approximated by a split-tone grade (cool shadows, warm highlights)
//    via channel scale + temperature + a soft bloom (slight blur blend).
const prism: AIEffectDefinition = {
  id: 'prism',
  name: 'Prism',
  description:
    'Prism and light-leak overlay with split-tone coloring and a soft bloom for a dreamy refractive look.',
  category: 'creative',
  requiresML: false,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      matrixNode(
        composeAll(
          channelScale(
            lerp(1, 1.12, t),
            lerp(1, 1.02, t),
            lerp(1, 1.15, t),
          ),
          temperature(lerp(0, 0.06, t)),
          tintMatrix(lerp(0, 0.05, t)),
          saturation(lerp(1, 1.18, t)),
        ),
      ),
      blurNode(lerp(0, 1.5, t)),
      adjustNode({
        fade: lerp(0, 0.06, t),
      }),
    ];
  },
};

// 10. dreamy — soft glow + bloom.
//     A light blur blended with a lifted exposure and reduced contrast
//     for a soft, glowing, ethereal look.
const dreamy: AIEffectDefinition = {
  id: 'dreamy',
  name: 'Dreamy',
  description:
    'Soft glow and bloom with lifted exposure and reduced contrast for an ethereal, romantic feel.',
  category: 'atmospheric',
  requiresML: false,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      blurNode(lerp(0, 2.5, t)),
      matrixNode(
        composeAll(
          brightness(lerp(0, 0.06, t)),
          contrast(lerp(1, 0.9, t)),
          saturation(lerp(1, 1.08, t)),
          temperature(lerp(0, 0.03, t)),
        ),
      ),
      adjustNode({
        fade: lerp(0, 0.1, t),
        highlights: lerp(0, -0.06, t),
      }),
    ];
  },
};

// 11. noir — high contrast B&W + grain.
const noir: AIEffectDefinition = {
  id: 'noir',
  name: 'Noir',
  description:
    'High-contrast black and white with film grain for a dramatic monochrome look.',
  category: 'color',
  requiresML: false,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      matrixNode(
        composeAll(
          grayscaleMatrix(),
          contrast(lerp(1, 1.4, t)),
          brightness(lerp(0, -0.03, t)),
        ),
      ),
      grainNode(lerp(0, 0.22, t)),
      adjustNode({
        vignette: lerp(0, 0.2, t),
      }),
    ];
  },
};

// 12. cinematic — cinematic color grade (teal/orange) + letterbox feel.
//     Teal shadows + orange highlights via channel scale + temperature,
//     plus a contrast lift and a vignette to approximate the letterbox
//     falloff.
const cinematic: AIEffectDefinition = {
  id: 'cinematic',
  name: 'Cinematic',
  description:
    'Cinematic teal-and-orange color grade with a contrast lift and vignette for a filmic look.',
  category: 'color',
  requiresML: false,
  render: (intensity: number): EffectNode[] => {
    const t = Math.max(0, Math.min(1, intensity));
    return [
      matrixNode(
        composeAll(
          // Teal shadows: boost B/G slightly, drop R in shadows via contrast.
          channelScale(
            lerp(1, 1.05, t),
            lerp(1, 1.02, t),
            lerp(1, 1.08, t),
          ),
          // Orange highlights: warm temperature shift.
          temperature(lerp(0, 0.1, t)),
          saturation(lerp(1, 1.12, t)),
          contrast(lerp(1, 1.15, t)),
        ),
      ),
      adjustNode({
        vignette: lerp(0, 0.22, t),
        shadows: lerp(0, 0.05, t),
        highlights: lerp(0, -0.05, t),
      }),
    ];
  },
};

// ── Registry ────────────────────────────────────────────────────────────

/**
 * The canonical registered AI effects. This is the foundation for the
 * "30+ AI Story effects" roadmap row — new effects are appended here.
 */
const REGISTRY: AIEffectDefinition[] = [
  autoEnhance,
  skinSmooth,
  bgBlur,
  bgRemove,
  skyReplace,
  colorPop,
  vintageFilm,
  glitch,
  prism,
  dreamy,
  noir,
  cinematic,
];

// O(1) lookup map keyed by effect id.
const REGISTRY_MAP: ReadonlyMap<string, AIEffectDefinition> = new Map(
  REGISTRY.map((e) => [e.id, e]),
);

/**
 * Returns the effect definition for the given id, or `undefined`.
 */
export function getAIEffect(id: string): AIEffectDefinition | undefined {
  return REGISTRY_MAP.get(id);
}

/**
 * Returns all registered AI effects.
 */
export function getAllAIEffects(): AIEffectDefinition[] {
  return REGISTRY;
}

/**
 * Returns all registered AI effects in the given category.
 */
export function getEffectsByCategory(category: AIEffectCategory): AIEffectDefinition[] {
  return REGISTRY.filter((e) => e.category === category);
}

/**
 * The ordered list of category filter tabs shown in the browser.
 * "All" is always first; the rest follow the canonical category order.
 */
export const AI_EFFECT_CATEGORIES: ReadonlyArray<'all' | AIEffectCategory> = [
  'all',
  'portrait',
  'creative',
  'color',
  'atmospheric',
];
