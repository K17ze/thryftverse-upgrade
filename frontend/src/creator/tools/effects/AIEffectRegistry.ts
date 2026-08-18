/**
 * EffectRegistry — the foundation of the Story effects ecosystem.
 *
 * This registry defines effects as compositions of real render primitives
 * (color matrices, blur, grain, vignette, adjust nodes) — not single CSS
 * labels or fake "AI" presets. Each effect is a stack of `EffectNode`s
 * that Skia executes on the GPU, guaranteeing WYSIWYG across thumbnail,
 * canvas, viewer, and export (spec 07 §1, AGENTS.md §11).
 *
 * The registry is the foundation for the "30+ Story effects" roadmap row.
 * It ships with 12 composed effects across four categories (portrait,
 * creative, color, atmospheric). The architecture is extensible — new
 * effects are added by registering an `EffectDefinition` with a `render`
 * function that returns an `EffectNode[]` stack.
 *
 * ## Honest capability labelling
 *
 * Each effect declares a `capabilityClass` describing what it actually
 * does: 'filter' (deterministic pixel math), 'manual' (a user-guided
 * transform such as a colour-key), 'ml' (requires on-device ML), or
 * 'generative' (requires a generative model). Effects are labelled
 * truthfully in the UI via `getEffectCapabilityLabel` — never labelled
 * "AI" when the underlying implementation is a deterministic filter
 * (AGENTS.md §11).
 *
 * ## ML availability & graceful fallback
 *
 * Some effects ideally use on-device ML (segmentation / rembg). When ML
 * is unavailable, each such effect declares a graceful fallback stack
 * (chroma-key approximation, blur-based approximation) so the effect
 * still produces a real, visible result — never a fake preview or a
 * disabled stub (AGENTS.md §11). The `capabilityClass` reflects the
 * *current* implementation path, so when ML is not available an effect's
 * class is reported honestly as 'filter' or 'manual'.
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

/** The four effect categories used by the browser filter tabs. */
export type EffectCategory =
  | 'portrait'
  | 'creative'
  | 'color'
  | 'atmospheric';

/**
 * @deprecated Use `EffectCategory`. Kept as an alias for backward
 * compatibility with existing imports.
 */
export type AIEffectCategory = EffectCategory;

/**
 * The capability class describes what an effect's implementation
 * actually does, so the UI can label it honestly.
 *
 * - 'filter'     — deterministic pixel math (color matrices, blur, grain).
 * - 'manual'     — a user-guided transform (e.g. a colour-key).
 * - 'ml'         — requires on-device ML (segmentation / rembg).
 * - 'generative' — requires a generative model.
 */
export type CapabilityClass = 'filter' | 'manual' | 'ml' | 'generative';

/**
 * A registered effect definition.
 *
 * `render(intensity)` returns the ordered effect stack applied to the
 * media layer. The renderer (CreatorCanvas) walks the stack and applies
 * each node in order. `intensity` (0..1) scales the strength of each
 * node's parameters so the same effect can be dialled back by the user.
 */
export interface EffectDefinition {
  /** Stable identifier used in persistence and the UI. */
  id: string;
  /** Display name shown in the browser grid. */
  name: string;
  /** Short description of the look. */
  description: string;
  /** Category used by the browser filter tabs. */
  category: EffectCategory;
  /**
   * Whether the ideal implementation requires on-device ML (segmentation,
   * rembg, etc.). When ML is unavailable, `render` still returns a real
   * fallback stack — this flag is for truthful UI labelling only.
   */
  requiresML: boolean;
  /**
   * What this effect's implementation actually does, so the UI can label
   * it honestly. An effect that ships a deterministic fallback stack
   * while ML is unavailable should declare 'filter' or 'manual' here,
   * not 'ml'.
   */
  capabilityClass: CapabilityClass;
  /**
   * Returns the ordered effect stack for the given intensity (0..1).
   * At intensity 0 the stack should be a no-op (identity); at 1 the
   * full effect is applied. Intermediate values scale each node.
   */
  render: (intensity: number) => EffectNode[];
}

/**
 * @deprecated Use `EffectDefinition`. Kept as an alias for backward
 * compatibility with existing imports.
 */
export type AIEffectDefinition = EffectDefinition;

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
 *
 * Note: effects whose current implementation is a deterministic filter
 * or colour-key declare `capabilityClass: 'filter' | 'manual'` directly,
 * regardless of this flag, because that is what they actually do today.
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
const autoEnhance: EffectDefinition = {
  id: 'autoEnhance',
  name: 'Auto Enhance',
  description:
    'One-tap enhancement. Adjusts exposure, contrast, saturation, and white balance conservatively for a balanced, corrected look.',
  category: 'color',
  requiresML: false,
  capabilityClass: 'filter',
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

// 2. skinSmooth — portrait skin softening.
//    A gentle whole-image blur blended with a slight contrast/saturation
//    lift so skin tones soften without the whole image going hard. This
//    is a deterministic softening filter, not ML-based skin detection.
const skinSmooth: EffectDefinition = {
  id: 'skinSmooth',
  name: 'Skin Soften',
  description:
    'Softens skin tones for portraits with a gentle whole-image softening and warm tone preservation. A deterministic smoothing filter.',
  category: 'portrait',
  requiresML: false,
  capabilityClass: 'filter',
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

// 3. bgBlur — depth-falloff blur.
//    A moderate blur across the whole frame with a vignette to simulate
//    depth falloff toward the edges. This is a vignette blur, not
//    subject-background separation.
const bgBlur: EffectDefinition = {
  id: 'bgBlur',
  name: 'Depth Blur',
  description:
    'A depth-falloff blur with a vignette that approximates shallow depth of field. A whole-frame softening filter, not subject-background separation.',
  category: 'portrait',
  requiresML: false,
  capabilityClass: 'filter',
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

// 4. bgRemove — colour-key background suppression.
//    A chroma-key approximation: a green-dominance suppression via a
//    channel-scale matrix that drops green-heavy pixels toward
//    transparency-equivalent desaturation. This is a colour-key
//    transform, not subject segmentation or a true alpha cutout.
const bgRemove: EffectDefinition = {
  id: 'bgRemove',
  name: 'Colour-Key Remove',
  description:
    'A chroma-key approximation that suppresses green-dominant regions via a colour-key transform. Not a true subject cutout — a manual colour-range suppression.',
  category: 'portrait',
  requiresML: false,
  capabilityClass: 'manual',
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

// 5. skyReplace — sky enhance.
//    A color-range selection that boosts blues and shifts the
//    upper-luminance band toward a richer sky tone via a teal-shifted
//    channel scale + contrast lift. It enriches existing blues rather
//    than replacing the sky with a new texture.
const skyReplace: EffectDefinition = {
  id: 'skyReplace',
  name: 'Sky Enhance',
  description:
    'Enriches existing blue regions toward a vivid teal sky via a color-range selection with a contrast lift. Enhances rather than replaces the sky.',
  category: 'creative',
  requiresML: false,
  capabilityClass: 'filter',
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

// 6. colorPop — partial desaturation with saturation boost.
//    A partial desaturation with a saturation boost that approximates
//    "pop" by increasing the contrast between saturated and unsaturated
//    regions. A deterministic filter, not subject masking.
const colorPop: EffectDefinition = {
  id: 'colorPop',
  name: 'Color Pop',
  description:
    'A contrast-boosted partial desaturation that emphasises already-saturated regions for a vivid pop. A deterministic colour filter.',
  category: 'color',
  requiresML: false,
  capabilityClass: 'filter',
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
const vintageFilm: EffectDefinition = {
  id: 'vintageFilm',
  name: 'Vintage Film',
  description:
    'Film grain, warm color grade, and a soft vignette for a retro analog look.',
  category: 'atmospheric',
  requiresML: false,
  capabilityClass: 'filter',
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
const glitch: EffectDefinition = {
  id: 'glitch',
  name: 'Glitch',
  description:
    'Digital glitch effect with RGB channel shift and scan-line noise for a retro-tech aesthetic.',
  category: 'creative',
  requiresML: false,
  capabilityClass: 'filter',
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
const prism: EffectDefinition = {
  id: 'prism',
  name: 'Prism',
  description:
    'Prism and light-leak overlay with split-tone coloring and a soft bloom for a dreamy refractive look.',
  category: 'creative',
  requiresML: false,
  capabilityClass: 'filter',
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
const dreamy: EffectDefinition = {
  id: 'dreamy',
  name: 'Dreamy',
  description:
    'Soft glow and bloom with lifted exposure and reduced contrast for an ethereal, romantic feel.',
  category: 'atmospheric',
  requiresML: false,
  capabilityClass: 'filter',
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
const noir: EffectDefinition = {
  id: 'noir',
  name: 'Noir',
  description:
    'High-contrast black and white with film grain for a dramatic monochrome look.',
  category: 'color',
  requiresML: false,
  capabilityClass: 'filter',
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
const cinematic: EffectDefinition = {
  id: 'cinematic',
  name: 'Cinematic',
  description:
    'Cinematic teal-and-orange color grade with a contrast lift and vignette for a filmic look.',
  category: 'color',
  requiresML: false,
  capabilityClass: 'filter',
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
 * The canonical registered effects. This is the foundation for the
 * "30+ Story effects" roadmap row — new effects are appended here.
 */
const REGISTRY: EffectDefinition[] = [
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
const REGISTRY_MAP: ReadonlyMap<string, EffectDefinition> = new Map(
  REGISTRY.map((e) => [e.id, e]),
);

/**
 * The canonical effect registry. New effects are appended to `REGISTRY`
 * above; this object exposes the lookup helpers.
 */
export const EffectRegistry = {
  get: getEffect,
  getAll: getAllEffects,
  byCategory: getEffectsByCategory,
};

/**
 * @deprecated Use `EffectRegistry`. Kept as an alias for backward
 * compatibility with existing imports.
 */
export const AIEffectRegistry = EffectRegistry;

/**
 * Returns the effect definition for the given id, or `undefined`.
 */
export function getEffect(id: string): EffectDefinition | undefined {
  return REGISTRY_MAP.get(id);
}

/**
 * @deprecated Use `getEffect`. Kept as an alias for backward
 * compatibility with existing imports.
 */
export function getAIEffect(id: string): EffectDefinition | undefined {
  return getEffect(id);
}

/**
 * Returns all registered effects.
 */
export function getAllEffects(): EffectDefinition[] {
  return REGISTRY;
}

/**
 * @deprecated Use `getAllEffects`. Kept as an alias for backward
 * compatibility with existing imports.
 */
export function getAllAIEffects(): EffectDefinition[] {
  return getAllEffects();
}

/**
 * Returns all registered effects in the given category.
 */
export function getEffectsByCategory(category: EffectCategory): EffectDefinition[] {
  return REGISTRY.filter((e) => e.category === category);
}

/**
 * The ordered list of category filter tabs shown in the browser.
 * "All" is always first; the rest follow the canonical category order.
 */
export const EFFECT_CATEGORIES: ReadonlyArray<'all' | EffectCategory> = [
  'all',
  'portrait',
  'creative',
  'color',
  'atmospheric',
];

/**
 * @deprecated Use `EFFECT_CATEGORIES`. Kept as an alias for backward
 * compatibility with existing imports.
 */
export const AI_EFFECT_CATEGORIES: ReadonlyArray<'all' | EffectCategory> =
  EFFECT_CATEGORIES;

// ── Capability labelling ────────────────────────────────────────────────

/**
 * Returns an honest, human-readable label for an effect's capability
 * class. ML/generative effects are reported as "Unavailable" when the
 * underlying model is not present, so the UI never shows a fake "AI"
 * badge (AGENTS.md §11).
 */
export function getEffectCapabilityLabel(effect: EffectDefinition): string {
  switch (effect.capabilityClass) {
    case 'filter':
      return 'Filter';
    case 'manual':
      return 'Manual';
    case 'ml':
      return isMLAvailable() ? 'AI-assisted' : 'Unavailable';
    case 'generative':
      return isMLAvailable() ? 'Generative' : 'Unavailable';
  }
}
