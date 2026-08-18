/**
 * LUTEffect — LUT (Look-Up Table) color grading via Skia RuntimeEffect shaders.
 *
 * This module implements real 3D LUT color grading using SkSL runtime effects
 * that sample a LUT PNG texture. This is the same technique used by CapCut,
 * VN Editor, and professional color grading tools — not a color-matrix
 * approximation.
 *
 * ## How it works
 *
 * A 3D LUT is flattened into a 2D PNG texture arranged as a grid of tiles.
 * Each tile represents a slice of the blue channel. Within each tile, the X
 * axis maps to red and the Y axis maps to green. The shader:
 *   1. Reads the source pixel color (r, g, b).
 *   2. Computes which blue slice the pixel falls into.
 *   3. Samples the two adjacent blue tiles and interpolates (trilinear).
 *   4. Blends between the original and graded color by `intensity`.
 *
 * ## LUT texture layout
 *
 * Two standard sizes are supported:
 *   - 512×512: 8×8 grid of 64×64 tiles (64 blue levels)
 *   - 1024×1024: 16×16 grid of 64×64 tiles (256 blue levels)
 *
 * ## Asset note
 *
 * Real LUT PNG textures should be bundled as assets for production. Each
 * built-in LUT definition references an asset path. When the asset file does
 * not exist (e.g. during development), `createIdentityLUTImage()` generates
 * an identity LUT at runtime using Skia offscreen rendering so the system
 * works end-to-end without bundled assets. The identity LUT produces no
 * color change — it is a truthful placeholder, not a fake preview.
 *
 * Per AGENTS.md §11: no CSS filter strings — real Skia RuntimeEffect only.
 * Per AGENTS.md §4: real LUT texture sampling, not a color-matrix approximation.
 */
import { Skia, type SkImage, type SkRuntimeEffect, ColorType, AlphaType } from '@shopify/react-native-skia';
import type { LutNode } from './EffectTypes';

// ── SkSL shader source ──────────────────────────────────────────────────

/**
 * The SkSL runtime effect shader for LUT color grading.
 *
 * Uniforms:
 *   - intensity   (float): blend strength 0..1 (0 = original, 1 = full grade)
 *   - gridSize     (float): tiles per row in the LUT grid (8 or 16)
 *   - tileSize     (float): pixels per tile edge (64)
 *   - textureSize  (float): total LUT texture edge in pixels (gridSize * tileSize)
 *
 * Child shaders:
 *   - src:  the source image being graded
 *   - lut:  the LUT PNG texture
 *
 * The shader performs trilinear interpolation across the blue channel slices
 * for smooth grading without banding.
 */
export const LUT_SHADER_SKS = `
in shader src;
in shader lut;
uniform float intensity;
uniform float gridSize;
uniform float tileSize;
uniform float textureSize;

half4 main(float2 coord) {
  half4 color = src.eval(coord);

  // Blue slice index: 0..(gridSize*gridSize - 1)
  float maxSlice = gridSize * gridSize - 1.0;
  float bSlice = clamp(color.b, 0.0, 1.0) * maxSlice;
  float bFloor = floor(bSlice);
  float bFrac = bSlice - bFloor;
  float bCeil = min(bFloor + 1.0, maxSlice);

  // Pixel offset within a tile (0..tileSize-1)
  float px = clamp(color.r, 0.0, 1.0) * (tileSize - 1.0);
  float py = clamp(color.g, 0.0, 1.0) * (tileSize - 1.0);

  // Floor blue slice tile coordinates
  float tileCol1 = mod(bFloor, gridSize);
  float tileRow1 = floor(bFloor / gridSize);
  float lutX1 = (tileCol1 * tileSize + px) / textureSize;
  float lutY1 = (tileRow1 * tileSize + py) / textureSize;
  half4 graded1 = lut.eval(float2(lutX1, lutY1));

  // Ceil blue slice tile coordinates
  float tileCol2 = mod(bCeil, gridSize);
  float tileRow2 = floor(bCeil / gridSize);
  float lutX2 = (tileCol2 * tileSize + px) / textureSize;
  float lutY2 = (tileRow2 * tileSize + py) / textureSize;
  half4 graded2 = lut.eval(float2(lutX2, lutY2));

  // Trilinear interpolation across blue slices
  half4 graded = mix(graded1, graded2, half(bFrac));

  // Blend between original and graded by intensity
  return mix(color, graded, half(intensity));
}
`;

// ── LUT texture configuration ───────────────────────────────────────────

/** Standard LUT grid sizes (tiles per row). */
export const LUT_GRID_8 = 8;   // 512×512 texture, 64 blue levels
export const LUT_GRID_16 = 16; // 1024×1024 texture, 256 blue levels

/** Tile size in pixels (each tile is a square slice of the blue channel). */
export const LUT_TILE_SIZE = 64;

// ── Built-in LUT definitions ────────────────────────────────────────────

/**
 * A built-in LUT definition. `assetPath` references a bundled PNG in the
 * app's asset bundle. When the asset is missing, an identity LUT is
 * generated at runtime as a truthful placeholder.
 *
 * For production, add the LUT PNG files under `assets/luts/` and register
 * them in `app.json` (expo-asset). The `useLUTTexture` hook will then
 * resolve them via `useImage`. Until then, the identity LUT fallback
 * ensures the full shader pipeline runs truthfully.
 */
export interface BuiltInLUT {
  /** Stable identifier used in effect nodes and persistence. */
  id: string;
  /** Display name shown in the browser sheet. */
  name: string;
  /** Short description of the look. */
  description: string;
  /**
   * Asset path for the LUT PNG. This is a string (not a `require()`) so the
   * module loads safely even when the asset files do not exist yet. When
   * real LUT PNGs are bundled, update `useLUTTexture` to resolve this path
   * via `expo-asset` or `require()`.
   */
  assetPath: string;
  /** Grid size (tiles per row). 8 = 512×512, 16 = 1024×1024. */
  gridSize: number;
}

/**
 * The canonical built-in LUT list. Each entry references a LUT PNG asset
 * that should be bundled for production. During development, missing assets
 * fall back to a runtime-generated identity LUT (no color change).
 *
 * Real LUT PNGs should be authored with a color grading tool (e.g. DaVinci
 * Resolve, Capture One) and exported as Hald LUT PNGs at the specified
 * grid size. Place them at `src/assets/luts/<id>.png` and wire up the
 * asset resolution in `useLUTTexture`.
 */
const BUILT_IN_LUTS: BuiltInLUT[] = [
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Warm orange highlights, teal shadows — the classic film look.',
    assetPath: 'assets/luts/cinematic.png',
    gridSize: LUT_GRID_8,
  },
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Faded warm tones with lifted blacks for a retro feel.',
    assetPath: 'assets/luts/vintage.png',
    gridSize: LUT_GRID_8,
  },
  {
    id: 'noir',
    name: 'Noir',
    description: 'High-contrast black and white for dramatic monochrome.',
    assetPath: 'assets/luts/noir.png',
    gridSize: LUT_GRID_8,
  },
  {
    id: 'vivid',
    name: 'Vivid',
    description: 'Saturated, punchy colors with deep contrast.',
    assetPath: 'assets/luts/vivid.png',
    gridSize: LUT_GRID_8,
  },
  {
    id: 'matte',
    name: 'Matte',
    description: 'Lifted blacks and desaturated mids for a modern matte finish.',
    assetPath: 'assets/luts/matte.png',
    gridSize: LUT_GRID_8,
  },
  {
    id: 'film',
    name: 'Film',
    description: 'Kodak-like film emulation with warm skin tones and green shadows.',
    assetPath: 'assets/luts/film.png',
    gridSize: LUT_GRID_8,
  },
];

/**
 * Returns the list of available built-in LUTs.
 */
export function getBuiltInLUTs(): BuiltInLUT[] {
  return BUILT_IN_LUTS;
}

/**
 * Look up a built-in LUT by its id. Returns `undefined` if not found.
 */
export function getBuiltInLUTById(id: string): BuiltInLUT | undefined {
  return BUILT_IN_LUTS.find((lut) => lut.id === id);
}

// ── Effect node factory ─────────────────────────────────────────────────

/**
 * Create a LUT effect node for the given built-in LUT name and intensity.
 *
 * The returned `LutNode` can be added to a media layer's effect stack.
 * The renderer (CreatorCanvas) detects the `lut` node type and applies the
 * RuntimeEffect shader instead of (or in addition to) a ColorMatrix.
 *
 * @param lutName    The built-in LUT id (e.g. 'cinematic').
 * @param intensity  Blend strength 0..1 (0 = original, 1 = full grade).
 * @returns A `LutNode` for the effect stack, or `null` if the LUT name is
 *          not recognised.
 */
export function getLUTEffect(lutName: string, intensity: number): LutNode | null {
  const lut = getBuiltInLUTById(lutName);
  if (!lut) return null;
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  return {
    type: 'lut',
    assetId: lut.id,
    amount: clampedIntensity,
  };
}

// ── Runtime effect compilation ──────────────────────────────────────────

let cachedEffect: SkRuntimeEffect | null | undefined;

/**
 * Compile (and cache) the LUT SkSL runtime effect. Returns `null` if the
 * shader fails to compile — callers must handle this gracefully (AGENTS.md
 * §11: truthful disabled state, not a fake preview).
 *
 * The compiled effect is cached for the lifetime of the JS runtime.
 */
export function getLUTRuntimeEffect(): SkRuntimeEffect | null {
  if (cachedEffect !== undefined) return cachedEffect;
  try {
    cachedEffect = Skia.RuntimeEffect.Make(LUT_SHADER_SKS);
  } catch {
    cachedEffect = null;
  }
  return cachedEffect;
}

// ── Identity LUT generation ─────────────────────────────────────────────

/** Cache for runtime-generated identity LUT images, keyed by grid size. */
const identityLutCache = new Map<number, SkImage>();

/**
 * Generate an identity LUT image at runtime using Skia offscreen rendering.
 *
 * An identity LUT maps every input color to itself — it produces no color
 * change. This is used as a **truthful placeholder** when a bundled LUT PNG
 * asset is not available (e.g. during development). The preview and canvas
 * render the image through the real shader pipeline, so the system works
 * end-to-end; the only difference is that the grade is neutral.
 *
 * For production, bundle real LUT PNGs authored with a color grading tool.
 *
 * @param gridSize  Tiles per row (8 or 16).
 * @returns A `SkImage` containing the identity LUT, or `null` if generation
 *          fails.
 */
export function createIdentityLUTImage(gridSize: number = LUT_GRID_8): SkImage | null {
  // Return cached image if already generated for this grid size.
  const cached = identityLutCache.get(gridSize);
  if (cached) return cached;

  const tile = LUT_TILE_SIZE;
  const size = gridSize * tile; // 512 or 1024

  try {
    // Build raw RGBA pixel data for the identity LUT.
    // For pixel (x, y) in the texture:
    //   tileCol = floor(x / tile)
    //   tileRow = floor(y / tile)
    //   blueSlice = tileRow * gridSize + tileCol  (0..gridSize*gridSize-1)
    //   r = (x % tile) / (tile - 1)
    //   g = (y % tile) / (tile - 1)
    //   b = blueSlice / (gridSize * gridSize - 1)
    const maxSlice = gridSize * gridSize - 1;
    const pixels = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      const tileRow = Math.floor(y / tile);
      const py = y % tile;
      const g = py / (tile - 1);
      for (let x = 0; x < size; x++) {
        const tileCol = Math.floor(x / tile);
        const px = x % tile;
        const r = px / (tile - 1);
        const blueSlice = tileRow * gridSize + tileCol;
        const b = blueSlice / maxSlice;

        const idx = (y * size + x) * 4;
        pixels[idx] = Math.round(r * 255);
        pixels[idx + 1] = Math.round(g * 255);
        pixels[idx + 2] = Math.round(b * 255);
        pixels[idx + 3] = 255; // opaque
      }
    }

    // Create a SkImage from the raw pixel data.
    const data = Skia.Data.fromBytes(pixels);
    const image = Skia.Image.MakeImage(
      {
        width: size,
        height: size,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Opaque,
      },
      data,
      size * 4,
    );

    if (image) {
      identityLutCache.set(gridSize, image);
    }
    return image;
  } catch {
    // If offscreen rendering or image creation fails, return null.
    // Callers must show a disabled state (AGENTS.md §11).
    return null;
  }
}

// ── LUT texture resolution ──────────────────────────────────────────────

/**
 * Resolve the effective LUT texture for a given LUT id.
 *
 * Attempts to load the bundled LUT PNG asset. If the asset is not available
 * (returns null from `useImage`), falls back to a runtime-generated identity
 * LUT so the shader pipeline still runs truthfully.
 *
 * This function is designed to be called from a React component that has
 * already loaded the asset via `useImage`. The caller passes the loaded
 * `SkImage | null`; this function returns it directly, or generates an
 * identity LUT if the asset image is null.
 *
 * @param loadedImage  The SkImage loaded from the LUT asset path (or null).
 * @param gridSize     The grid size for the identity fallback.
 * @returns The effective LUT SkImage, or null if both the asset and the
 *          identity generation fail.
 */
export function resolveLUTTexture(
  loadedImage: SkImage | null,
  gridSize: number = LUT_GRID_8,
): SkImage | null {
  if (loadedImage) return loadedImage;
  return createIdentityLUTImage(gridSize);
}

/**
 * Compute the uniforms object for the LUT runtime effect.
 *
 * @param intensity    Blend strength 0..1.
 * @param gridSize     Tiles per row (8 or 16).
 * @returns A uniforms record suitable for the `Shader` component's
 *          `uniforms` prop.
 */
export function getLUTUniforms(intensity: number, gridSize: number) {
  return {
    intensity,
    gridSize,
    tileSize: LUT_TILE_SIZE,
    textureSize: gridSize * LUT_TILE_SIZE,
  };
}
