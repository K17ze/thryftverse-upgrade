// ── Render Profiles ─────────────────────────────────────────────────
//
// A render profile declares which capability columns are active for a given
// rendering context. The scene evaluator and renderer consume a profile to
// decide which features are live — e.g. whether video frames are decoded
// through Skia (skiaVideoFrames) or fall back to a native VideoView without
// per-pixel effects.
//
// Profiles derive from the single CAPABILITY_REGISTRY truth (§6.4). A profile
// never re-declares support for a capability; it selects which column of the
// registry to consult. This keeps the registry the single source of truth for
// what the creator department can actually do.
//
// (AGENTS.md §6.3 — Renderer(scene, renderProfile) → edit / preview / viewer
// / thumbnail / export)

import { Platform } from 'react-native';
import {
  CAPABILITY_REGISTRY,
  getCapability,
  meetsPlatformRequirement,
  type CapabilitySupport,
} from '../capabilities/registry';

// ── Profile identifiers ─────────────────────────────────────────────

/**
 * The five rendering contexts defined in §6.3. Each maps to a capability
 * column in the registry, except `thumbnail` which reuses the `viewer`
 * column with a stricter feature set (no video effects, no audio).
 */
export type RenderProfileId = 'edit' | 'preview' | 'viewer' | 'thumbnail' | 'export';

// ── Profile shape ───────────────────────────────────────────────────

/**
 * A resolved render profile. The scene evaluator reads `activeCapabilities`
 * to decide which features are live; the renderer reads the same set to
 * decide which code path to take.
 *
 * `skiaVideoFrames` is the pivotal Phase 2 gate: when false, video layers
 * render through the native VideoView and the evaluator returns no effect
 * graph for them (the effect graph is stored but not rendered).
 */
export interface RenderProfile {
  id: RenderProfileId;
  /** Which registry column this profile consults for support. */
  column: 'editor' | 'viewer' | 'export';
  /**
   * The set of capability IDs that are fully supported (column ===
   * 'supported' AND platform requirements met) for this profile. The
   * evaluator and renderer gate every feature on this set.
   */
  activeCapabilities: ReadonlySet<string>;
  /** Whether Skia video frame rendering is live for this profile. */
  skiaVideoFrames: boolean;
  /** Whether any video per-pixel effects (color matrix / shader) are live. */
  videoEffects: boolean;
  /** Whether audio playback is live (false for thumbnail / export-still). */
  audio: boolean;
  /** Whether interactive sticker hit-testing is live (false for thumbnail). */
  interactive: boolean;
}

// ── Resolution ──────────────────────────────────────────────────────

/**
 * Returns the registry column a profile consults. `preview` shares the
 * editor column (it is the editor's own playback preview); `thumbnail`
 * shares the viewer column but with a stricter feature set applied
 * afterwards.
 */
function columnForProfile(id: RenderProfileId): 'editor' | 'viewer' | 'export' {
  switch (id) {
    case 'edit':
    case 'preview':
      return 'editor';
    case 'viewer':
    case 'thumbnail':
      return 'viewer';
    case 'export':
      return 'export';
  }
}

/**
 * Resolve the set of capability IDs whose declared column for this profile
 * is 'supported' AND whose platform requirements are met. This is the
 * authoritative active-feature set — the evaluator and renderer never
 * re-check the registry.
 */
function resolveActiveCapabilities(column: 'editor' | 'viewer' | 'export'): Set<string> {
  const active = new Set<string>();
  for (const [id, cap] of Object.entries(CAPABILITY_REGISTRY)) {
    if (cap[column] !== 'supported') continue;
    if (!meetsPlatformRequirement(cap)) continue;
    active.add(id);
  }
  return active;
}

/**
 * Resolve a full render profile from the capability registry.
 *
 * Pure function — no side effects, no React, no state. Safe to call inside
 * useMemo at the top of a renderer.
 */
export function resolveRenderProfile(id: RenderProfileId): RenderProfile {
  const column = columnForProfile(id);
  const activeCapabilities = resolveActiveCapabilities(column);

  // skiaVideoFrames gates the Skia video decode path. It is only live when
  // the capability is supported for this profile's column AND the platform
  // meets the Android API 26+ requirement (already checked in
  // resolveActiveCapabilities, so membership is sufficient).
  const skiaVideoFrames = activeCapabilities.has('skiaVideoFrames');

  // videoEffect gates per-pixel video effects (color matrix / shader /
  // mask). It requires skiaVideoFrames — without Skia frame access there is
  // no surface to apply effects to. The registry models them as separate
  // capabilities so a future platform could support Skia frames without
  // advertising the effect tooling, but the evaluator treats the effect
  // graph as live only when both are supported.
  const videoEffectCap = getCapability('videoEffect');
  const videoEffects =
    skiaVideoFrames &&
    videoEffectCap !== null &&
    videoEffectCap[column] === 'supported' &&
    meetsPlatformRequirement(videoEffectCap);

  // Thumbnail is a still image export of the first frame — no audio, no
  // interactive hit-testing, and never Skia video frames (a still frame is
  // captured via the thumbnail URI, not live decode).
  const audio = id !== 'thumbnail';
  const interactive = id !== 'thumbnail' && id !== 'export';

  return {
    id,
    column,
    activeCapabilities,
    skiaVideoFrames: skiaVideoFrames && id !== 'thumbnail',
    videoEffects,
    audio,
    interactive,
  };
}

// ── Convenience: is a capability active for a profile? ──────────────

/**
 * Returns true if the given capability ID is active (fully supported) for
 * this profile. This is the single gate the evaluator and renderer use —
 * they never read the registry directly.
 */
export function isCapabilityActive(profile: RenderProfile, capabilityId: string): boolean {
  return profile.activeCapabilities.has(capabilityId);
}

// ── Cached profile singletons ───────────────────────────────────────
//
// Profiles are pure and platform-stable for a process lifetime, so they are
// resolved once and shared. Callers may also call resolveRenderProfile
// directly when they need a fresh resolution (e.g. after a platform
// capability change in tests).

let _edit: RenderProfile | null = null;
let _preview: RenderProfile | null = null;
let _viewer: RenderProfile | null = null;
let _thumbnail: RenderProfile | null = null;
let _export: RenderProfile | null = null;

export function editProfile(): RenderProfile {
  return (_edit ??= resolveRenderProfile('edit'));
}
export function previewProfile(): RenderProfile {
  return (_preview ??= resolveRenderProfile('preview'));
}
export function viewerProfile(): RenderProfile {
  return (_viewer ??= resolveRenderProfile('viewer'));
}
export function thumbnailProfile(): RenderProfile {
  return (_thumbnail ??= resolveRenderProfile('thumbnail'));
}
export function exportProfile(): RenderProfile {
  return (_export ??= resolveRenderProfile('export'));
}

/**
 * Returns the cached profile for an id. Convenience for callers that have
 * a RenderProfileId but not a typed selector.
 */
export function getRenderProfile(id: RenderProfileId): RenderProfile {
  switch (id) {
    case 'edit': return editProfile();
    case 'preview': return previewProfile();
    case 'viewer': return viewerProfile();
    case 'thumbnail': return thumbnailProfile();
    case 'export': return exportProfile();
  }
}

// ── CapabilitySupport re-export for callers that import from here ───
// Kept as a type-only re-export so there is one logical import surface for
// render-time capability questions.
export type { CapabilitySupport };
