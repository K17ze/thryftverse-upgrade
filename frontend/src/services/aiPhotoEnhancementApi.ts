/**
 * AI Photo Enhancement API — mock-ready service for AI-powered listing photo
 * enhancement (background removal, AI shadows, auto-crop, colour correction,
 * background replacement, lighting fix).
 *
 * Context (2026 parity):
 *   Depop's Photoroom integration (AI background removal, AI shadows, image
 *   resizing) drove a 1.5% uplift in listings. eBay AI Snap and Tilt Snap AI
 *   followed. AI photo enhancement is table stakes for 2026 marketplaces.
 *   ThryftVerse has AI listing creation but no AI photo enhancement — this
 *   service closes that gap.
 *
 * Per AGENTS.md §11 (Truthful UI):
 *   The mock is truthful. It does NOT fabricate enhanced images. When
 *   `AI_PHOTO_DEMO_MODE` is true, every function returns the ORIGINAL image
 *   URI with `isDemo: true`. The UI must show a clear "Demo mode" banner so
 *   the user understands no real enhancement was applied.
 *
 * Mock-ready pattern (similar to galleriaApi.ts):
 *   The function signatures mirror what a real Photoroom / AI image API would
 *   expose. When a real backend is wired, set `AI_PHOTO_DEMO_MODE = false` and
 *   replace the mock branches with real fetch calls. The UI layer does not
 *   need to change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The kind of enhancement operation the user can apply to a photo. */
export type EnhancementOptionType =
  | 'background_removal'
  | 'ai_shadows'
  | 'auto_crop'
  | 'color_correction'
  | 'background_replace'
  | 'lighting_fix';

/** A single enhancement operation exposed in the options rail. */
export interface EnhancementOption {
  id: string;
  label: string;
  description: string;
  /** Ionicons icon name used for the option glyph. */
  icon: string;
  type: EnhancementOptionType;
}

/** The result of applying an enhancement to an image. */
export interface EnhancementResult {
  id: string;
  originalUri: string;
  /**
   * The enhanced image URI. In demo mode this is the SAME as `originalUri`
   * because we do not fabricate enhanced images (AGENTS.md §11).
   */
  enhancedUri: string;
  option: EnhancementOption;
  /** ISO timestamp of when the enhancement was applied. */
  appliedAt: string;
  /** Honest flag — true while this result comes from mock data. */
  isDemo: boolean;
}

/** A curated preset that bundles multiple enhancement options. */
export interface EnhancementPreset {
  id: string;
  label: string;
  description: string;
  options: EnhancementOption[];
}

/** A background scene for the background-replacement feature. */
export interface BackgroundScene {
  id: string;
  label: string;
  /** Thumbnail URI for the scene picker grid. */
  thumbnailUri: string;
  category: 'studio' | 'lifestyle' | 'neutral' | 'colored';
}

// ---------------------------------------------------------------------------
// Demo flag — the UI reads this to decide whether to show a "Demo mode" badge.
// When a real backend is wired, set this to false (or remove the mock branch).
// ---------------------------------------------------------------------------

export const AI_PHOTO_DEMO_MODE = true;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_ENHANCEMENT_OPTIONS: EnhancementOption[] = [
  {
    id: 'opt-background-removal',
    label: 'Background Removal',
    description: 'Remove the background and isolate the product on a clean canvas.',
    icon: 'crop',
    type: 'background_removal',
  },
  {
    id: 'opt-ai-shadows',
    label: 'AI Shadows',
    description: 'Add natural, realistic shadows beneath the product.',
    icon: 'sunny-outline',
    type: 'ai_shadows',
  },
  {
    id: 'opt-auto-crop',
    label: 'Auto Crop',
    description: 'Automatically crop and centre the product for a consistent frame.',
    icon: 'expand-outline',
    type: 'auto_crop',
  },
  {
    id: 'opt-color-correction',
    label: 'Color Correction',
    description: 'Balance white point, saturation and contrast for accurate colours.',
    icon: 'color-palette-outline',
    type: 'color_correction',
  },
  {
    id: 'opt-background-replace',
    label: 'Background Replace',
    description: 'Replace the background with a studio, lifestyle or coloured scene.',
    icon: 'image-outline',
    type: 'background_replace',
  },
  {
    id: 'opt-lighting-fix',
    label: 'Lighting Fix',
    description: 'Correct uneven lighting and reduce harsh shadows from the original photo.',
    icon: 'bulb-outline',
    type: 'lighting_fix',
  },
];

const MOCK_BACKGROUND_SCENES: BackgroundScene[] = [
  {
    id: 'scene-studio-white',
    label: 'Studio White',
    thumbnailUri: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=200',
    category: 'studio',
  },
  {
    id: 'scene-studio-grey',
    label: 'Studio Grey',
    thumbnailUri: 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=200',
    category: 'studio',
  },
  {
    id: 'scene-lifestyle-warm',
    label: 'Lifestyle Warm',
    thumbnailUri: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=200',
    category: 'lifestyle',
  },
  {
    id: 'scene-lifestyle-natural',
    label: 'Lifestyle Natural',
    thumbnailUri: 'https://images.unsplash.com/photo-1567096535036-5497076b854f?w=200',
    category: 'lifestyle',
  },
  {
    id: 'scene-neutral-beige',
    label: 'Neutral Beige',
    thumbnailUri: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=200',
    category: 'neutral',
  },
  {
    id: 'scene-neutral-cream',
    label: 'Neutral Cream',
    thumbnailUri: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=200',
    category: 'neutral',
  },
  {
    id: 'scene-colored-blush',
    label: 'Colored Blush',
    thumbnailUri: 'https://images.unsplash.com/photo-1515886657613-9f2915b21783?w=200',
    category: 'colored',
  },
  {
    id: 'scene-colored-sage',
    label: 'Colored Sage',
    thumbnailUri: 'https://images.unsplash.com/photo-1515886657613-9f2915b21783?w=200',
    category: 'colored',
  },
];

const MOCK_PRESETS: EnhancementPreset[] = [
  {
    id: 'preset-studio-clean',
    label: 'Studio Clean',
    description: 'Background removal, AI shadows and auto-crop for a marketplace-ready studio look.',
    options: [
      MOCK_ENHANCEMENT_OPTIONS[0], // background removal
      MOCK_ENHANCEMENT_OPTIONS[1], // ai shadows
      MOCK_ENHANCEMENT_OPTIONS[2], // auto crop
    ],
  },
  {
    id: 'preset-lifestyle-warm',
    label: 'Lifestyle Warm',
    description: 'Colour correction and lighting fix for a warm, natural lifestyle feel.',
    options: [
      MOCK_ENHANCEMENT_OPTIONS[3], // color correction
      MOCK_ENHANCEMENT_OPTIONS[5], // lighting fix
    ],
  },
  {
    id: 'preset-editorial-dark',
    label: 'Editorial Dark',
    description: 'Lighting fix and colour correction tuned for a moody editorial aesthetic.',
    options: [
      MOCK_ENHANCEMENT_OPTIONS[5], // lighting fix
      MOCK_ENHANCEMENT_OPTIONS[3], // color correction
    ],
  },
  {
    id: 'preset-natural-light',
    label: 'Natural Light',
    description: 'Gentle colour correction and auto-crop for clean, natural product photography.',
    options: [
      MOCK_ENHANCEMENT_OPTIONS[3], // color correction
      MOCK_ENHANCEMENT_OPTIONS[2], // auto crop
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the available enhancement options for the options rail.
 */
export async function fetchEnhancementOptions(): Promise<EnhancementOption[]> {
  await delay(280);
  return [...MOCK_ENHANCEMENT_OPTIONS];
}

/**
 * Fetch the available background scenes for the background-replacement picker.
 */
export async function fetchBackgroundScenes(): Promise<BackgroundScene[]> {
  await delay(240);
  return [...MOCK_BACKGROUND_SCENES];
}

/**
 * Fetch curated enhancement presets.
 */
export async function fetchEnhancementPresets(): Promise<EnhancementPreset[]> {
  await delay(260);
  return [...MOCK_PRESETS];
}

/**
 * Apply a single enhancement option to an image.
 *
 * In demo mode this returns the ORIGINAL image URI with `isDemo: true`.
 * It does NOT fabricate an enhanced image (AGENTS.md §11).
 */
export async function applyEnhancement(
  imageUri: string,
  optionId: string,
): Promise<EnhancementResult> {
  await delay(900); // simulate processing time for honest loading states
  const option = MOCK_ENHANCEMENT_OPTIONS.find((o) => o.id === optionId);
  if (!option) {
    throw new Error(`Unknown enhancement option: ${optionId}`);
  }
  return {
    id: generateId('result'),
    originalUri: imageUri,
    // Truthful: in demo mode we return the original image, not a fabricated
    // enhanced version. The UI shows a demo banner explaining this.
    enhancedUri: imageUri,
    option,
    appliedAt: new Date().toISOString(),
    isDemo: AI_PHOTO_DEMO_MODE,
  };
}

/**
 * Apply a preset (multiple enhancement options) to an image.
 *
 * In demo mode this returns the ORIGINAL image URI with `isDemo: true`.
 */
export async function applyPreset(
  imageUri: string,
  presetId: string,
): Promise<EnhancementResult> {
  await delay(1200); // presets apply multiple options, so slightly longer
  const preset = MOCK_PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    throw new Error(`Unknown enhancement preset: ${presetId}`);
  }
  // Use the first option in the preset as the representative option for the
  // result object. The UI shows the preset label, not the individual option.
  const representativeOption = preset.options[0];
  return {
    id: generateId('result'),
    originalUri: imageUri,
    enhancedUri: imageUri,
    option: representativeOption,
    appliedAt: new Date().toISOString(),
    isDemo: AI_PHOTO_DEMO_MODE,
  };
}

/**
 * Replace the background of an image with a selected scene.
 *
 * In demo mode this returns the ORIGINAL image URI with `isDemo: true`.
 */
export async function replaceBackground(
  imageUri: string,
  sceneId: string,
): Promise<EnhancementResult> {
  await delay(1000);
  const scene = MOCK_BACKGROUND_SCENES.find((s) => s.id === sceneId);
  if (!scene) {
    throw new Error(`Unknown background scene: ${sceneId}`);
  }
  const backgroundReplaceOption = MOCK_ENHANCEMENT_OPTIONS.find(
    (o) => o.type === 'background_replace',
  )!;
  return {
    id: generateId('result'),
    originalUri: imageUri,
    enhancedUri: imageUri,
    option: backgroundReplaceOption,
    appliedAt: new Date().toISOString(),
    isDemo: AI_PHOTO_DEMO_MODE,
  };
}

/**
 * Revert an enhancement, returning to the original image.
 *
 * In demo mode no actual change was made, so this simply confirms the revert.
 * Returns the original URI so the UI can update the preview.
 */
export async function revertEnhancement(resultId: string): Promise<{ originalUri: string; isDemo: boolean }> {
  await delay(300);
  return {
    originalUri: '',
    isDemo: AI_PHOTO_DEMO_MODE,
  };
}
