// ── Creator Capability Registry ─────────────────────────────────────
// Single source of truth for what the creator department can actually
// do across the full stack: editor preview, in-app viewer, file export,
// and backend persistence.
//
// A tool is visible ONLY when every required column is 'supported':
//   advertised tool = editor supported
//                     ∧ viewer supported for the publish destination
//                     ∧ exact serialization supported
//                     ∧ required permissions granted/requestable
//                     ∧ output path supported when "export" is promised
//
// This prevents feature drift more reliably than comments such as
// "hidden until export supports it." The registry is consumed by tool
// rails, validation, viewer adapters, and publication.
//
// (AGENTS.md §6.4 — executable capability registry)

import { Platform } from 'react-native';

// ── Capability support levels ───────────────────────────────────────

export type CapabilitySupport = 'supported' | 'preview-only' | 'hidden' | 'blocked';

// ── Capability definition ───────────────────────────────────────────

export interface CreatorCapability {
  /** Stable identifier consumed by tool rails and validation. */
  id: string;
  /** Which media kinds this capability applies to. */
  mediaKinds: Array<'image' | 'video'>;
  /** Editor preview support. */
  editor: CapabilitySupport;
  /** In-app viewer support for published content. */
  viewer: CapabilitySupport;
  /** Authored file export support. */
  export: CapabilitySupport;
  /** Backend persistence / serialization support. */
  backend: CapabilitySupport;
  /** Other capabilities that must be supported for this one to be visible. */
  requires?: string[];
  /** Minimum platform requirements. */
  minimumPlatform?: { ios?: number; androidApi?: number };
}

// ── Capability registry ─────────────────────────────────────────────
//
// Every entry is a deliberate product decision, not a guess.  When a
// capability moves from 'hidden' to 'supported', every column must be
// green — not just the editor.

export const CAPABILITY_REGISTRY: Record<string, CreatorCapability> = {
  // ── Capture ──
  photoCapture: {
    id: 'photoCapture',
    mediaKinds: ['image'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden', // no authored render export yet
    backend: 'supported',
  },
  videoCapture: {
    id: 'videoCapture',
    mediaKinds: ['video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden', // no authored render export yet
    backend: 'supported',
  },
  videoAudio: {
    id: 'videoAudio',
    mediaKinds: ['video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden',
    backend: 'supported',
    requires: ['videoCapture'],
  },
  tapToFocus: {
    id: 'tapToFocus',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'supported',
    backend: 'supported',
  },

  // ── Camera tools (currently dormant — output path incomplete) ──
  greenScreen: {
    id: 'greenScreen',
    mediaKinds: ['image', 'video'],
    editor: 'preview-only',
    viewer: 'hidden', // native video path does not render chroma key
    export: 'hidden',
    backend: 'hidden', // no authoritative result
  },
  speedControl: {
    id: 'speedControl',
    mediaKinds: ['video'],
    editor: 'preview-only',
    viewer: 'hidden', // unverified end-to-end
    export: 'hidden',
    backend: 'hidden', // metadata only
  },

  // ── Image effects ──
  imageFilter: {
    id: 'imageFilter',
    mediaKinds: ['image'],
    editor: 'supported', // Skia
    viewer: 'supported', // shared canvas
    export: 'hidden', // no authored render export
    backend: 'supported', // stored in composition
  },
  videoEffect: {
    id: 'videoEffect',
    mediaKinds: ['video'],
    editor: 'hidden', // native video path does not fully render Skia effects
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // stored only, not rendered
  },

  // ── Skia video frame rendering ──
  skiaVideoFrames: {
    id: 'skiaVideoFrames',
    mediaKinds: ['video'],
    editor: 'hidden', // gate until parity passes
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden',
    minimumPlatform: { androidApi: 26 },
  },

  // ── Poster interactive stickers ──
  stickerText: {
    id: 'stickerText',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'supported',
    backend: 'supported', // 'text' type
  },
  stickerMention: {
    id: 'stickerMention',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'supported',
    backend: 'supported', // 'mention' type
  },
  stickerProduct: {
    id: 'stickerProduct',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'supported',
    backend: 'supported', // 'listing' type
  },
  stickerLook: {
    id: 'stickerLook',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'supported',
    backend: 'supported', // 'look' type
  },
  stickerVote: {
    id: 'stickerVote',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'supported',
    backend: 'supported', // 'style_vote' type
  },
  // Interactive stickers with NO backend type — must be hidden
  stickerQuiz: {
    id: 'stickerQuiz',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'quiz' backend type
  },
  stickerQuestion: {
    id: 'stickerQuestion',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'question' backend type
  },
  stickerEmojiSlider: {
    id: 'stickerEmojiSlider',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'emoji_slider' backend type — do NOT coerce to poll
  },
  stickerCountdown: {
    id: 'stickerCountdown',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'countdown' backend type
  },
  stickerLink: {
    id: 'stickerLink',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'link' backend type
  },
  stickerLocation: {
    id: 'stickerLocation',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'location' backend type
  },
  stickerHashtag: {
    id: 'stickerHashtag',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'hashtag' backend type
  },
  stickerMusic: {
    id: 'stickerMusic',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'hidden',
    export: 'hidden',
    backend: 'hidden', // no 'music' backend type
  },

  // ── Decorative / visual layers (no backend sticker projection) ──
  // These live ONLY in the composition document — they do NOT produce
  // poster_stickers rows. They are 'supported' in editor/viewer because
  // the shared canvas renders them, but 'hidden' in backend because
  // there is no narrowed sticker type (and that is correct — they are
  // visual-only, not interactive).
  layerDecorative: {
    id: 'layerDecorative',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden',
    backend: 'hidden', // composition-document only, no sticker row
  },
  layerDraw: {
    id: 'layerDraw',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden',
    backend: 'hidden', // composition-document only
  },
  layerGif: {
    id: 'layerGif',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden',
    backend: 'hidden', // composition-document only
  },
  layerTime: {
    id: 'layerTime',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden',
    backend: 'hidden', // composition-document only
  },
  layerWeather: {
    id: 'layerWeather',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden',
    backend: 'hidden', // composition-document only
  },
  layerAdjustment: {
    id: 'layerAdjustment',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'hidden',
    backend: 'hidden', // composition-document only
  },

  // ── Keyframes ──
  keyframes: {
    id: 'keyframes',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported', // shared evaluator
    export: 'hidden', // no authored render export
    backend: 'supported', // metadata only
  },

  // ── Cutout / mask ──
  cutout: {
    id: 'cutout',
    mediaKinds: ['image'],
    editor: 'preview-only', // local preview only
    viewer: 'hidden', // viewer fallback to original crop
    export: 'hidden',
    backend: 'hidden', // mask asset upload not implemented
  },

  // ── Draft crash recovery ──
  draftRecovery: {
    id: 'draftRecovery',
    mediaKinds: ['image', 'video'],
    editor: 'supported',
    viewer: 'supported',
    export: 'supported',
    backend: 'supported', // local journal
  },
};

// ── Platform gating ─────────────────────────────────────────────────

export function meetsPlatformRequirement(cap: CreatorCapability): boolean {
  if (!cap.minimumPlatform) return true;
  const { ios, androidApi } = cap.minimumPlatform;
  if (Platform.OS === 'ios' && ios !== undefined) {
    // Platform.Version on iOS is a string like "17.0" in some RN versions;
    // parse defensively. If we can't determine, allow it.
    const v = typeof Platform.Version === 'string'
      ? parseFloat(Platform.Version)
      : Platform.Version;
    return v >= ios;
  }
  if (Platform.OS === 'android' && androidApi !== undefined) {
    const api = typeof Platform.Version === 'number' ? Platform.Version : 0;
    return api >= androidApi;
  }
  return true;
}

// ── Resolution helpers ──────────────────────────────────────────────

/**
 * Returns the capability record for the given ID, or null if not found.
 */
export function getCapability(id: string): CreatorCapability | null {
  return CAPABILITY_REGISTRY[id] ?? null;
}

/**
 * Returns true if a capability is supported and should be advertised
 * (visible in the tool rail).
 *
 * A capability is 'advertised' only when:
 *   - editor is 'supported'
 *   - viewer is 'supported'
 *   - backend is 'supported', OR the capability is visual-only
 *     (editor + viewer 'supported', backend 'hidden' — the layer renders
 *     from the composition document and needs no sticker row projection)
 *   - export is not 'blocked' ('hidden' export is OK — the tool just
 *     doesn't promise file export)
 *   - all required capabilities are also supported
 *   - platform requirements are met
 *
 * Visual-only capabilities (layerDraw, layerGif, layerDecorative, etc.)
 * are 'supported' because they render identically in the editor and the
 * in-app viewer from the persisted composition document. They have no
 * backend sticker projection by design — that is correct, not a gap.
 */
export function isCapabilitySupported(id: string): boolean {
  const cap = getCapability(id);
  if (!cap) return false;
  if (!meetsPlatformRequirement(cap)) return false;
  if (cap.editor !== 'supported') return false;
  if (cap.viewer !== 'supported') return false;
  // Visual-only capabilities (editor + viewer 'supported', backend 'hidden')
  // are advertised — they render from the composition document and need no
  // backend sticker projection. Interactive capabilities with backend
  // 'hidden' (quiz, question, music, etc.) are NOT advertised because
  // their viewer support is also 'hidden'.
  if (cap.backend === 'blocked' || cap.backend === 'hidden') {
    // isVisualOnlyCapability checks backend='hidden' + editor='supported' +
    // viewer='supported'. If that's true, the capability renders from the
    // composition document and is advertised despite no sticker projection.
    if (!isVisualOnlyCapability(id)) return false;
  }
  // Export can be 'hidden' — the tool just doesn't promise file export.
  // 'blocked' means the export path is known-broken and the tool should
  // not be advertised.
  if (cap.export === 'blocked') return false;
  // Check required capabilities
  if (cap.requires) {
    for (const reqId of cap.requires) {
      if (!isCapabilitySupported(reqId)) return false;
    }
  }
  return true;
}

/**
 * Returns true if a capability is purely visual (no backend sticker
 * projection needed). These layers live only in the composition document.
 */
export function isVisualOnlyCapability(id: string): boolean {
  const cap = getCapability(id);
  if (!cap) return false;
  return cap.backend === 'hidden' && cap.editor === 'supported' && cap.viewer === 'supported';
}

/**
 * Returns true if a capability is interactive but has no backend support.
 * These must be hidden from the tool rail — they promise an interaction
 * the backend cannot persist or serve.
 */
export function isUnsupportedInteractive(id: string): boolean {
  const cap = getCapability(id);
  if (!cap) return false;
  return cap.editor === 'supported' && cap.backend === 'hidden' && !isVisualOnlyCapability(id);
}

/**
 * Returns the list of all capability IDs that are currently supported
 * and should be visible in the tool rail.
 */
export function getSupportedCapabilities(): string[] {
  return Object.keys(CAPABILITY_REGISTRY).filter(isCapabilitySupported);
}

/**
 * Returns the list of all capability IDs that are currently hidden or
 * blocked — useful for debugging and auditing.
 */
export function getHiddenCapabilities(): string[] {
  return Object.keys(CAPABILITY_REGISTRY).filter((id) => !isCapabilitySupported(id));
}

// ── Explicit image / video capability matrices ──────────────────────
//
// Render Fidelity Gate 1: "Image and video capability matrices are
// explicit." These matrices enumerate, per media kind, which capabilities
// are supported (advertised), preview-only, or hidden. They are derived
// from the single CAPABILITY_REGISTRY truth — never hand-maintained — so
// adding or gating a capability automatically updates both matrices.

export interface CapabilityMatrixEntry {
  id: string;
  status: CapabilitySupport;
}

export interface CapabilityMatrix {
  supported: CapabilityMatrixEntry[];
  previewOnly: CapabilityMatrixEntry[];
  hidden: CapabilityMatrixEntry[];
}

/**
 * Returns the explicit capability matrix for a given media kind.
 * Every capability whose `mediaKinds` includes the kind is classified
 * into supported / preview-only / hidden based on `isCapabilitySupported`
 * and the editor column.
 */
export function getCapabilityMatrix(mediaKind: 'image' | 'video'): CapabilityMatrix {
  const supported: CapabilityMatrixEntry[] = [];
  const previewOnly: CapabilityMatrixEntry[] = [];
  const hidden: CapabilityMatrixEntry[] = [];

  for (const [id, cap] of Object.entries(CAPABILITY_REGISTRY)) {
    if (!cap.mediaKinds.includes(mediaKind)) continue;
    if (isCapabilitySupported(id)) {
      supported.push({ id, status: 'supported' });
    } else if (cap.editor === 'preview-only') {
      previewOnly.push({ id, status: 'preview-only' });
    } else {
      hidden.push({ id, status: cap.editor === 'hidden' ? 'hidden' : 'hidden' });
    }
  }
  return { supported, previewOnly, hidden };
}

/**
 * Returns the image capability matrix (shorthand).
 */
export function getImageCapabilityMatrix(): CapabilityMatrix {
  return getCapabilityMatrix('image');
}

/**
 * Returns the video capability matrix (shorthand).
 */
export function getVideoCapabilityMatrix(): CapabilityMatrix {
  return getCapabilityMatrix('video');
}

// ── Layer-type → capability mapping ─────────────────────────────────
//
// Maps the composition layer types to their capability IDs so the
// validation and tool rail can check support.

export const LAYER_TYPE_TO_CAPABILITY: Record<string, string> = {
  media: 'photoCapture', // media layers use photo/video capture caps
  text: 'stickerText',
  mention: 'stickerMention',
  product: 'stickerProduct',
  look: 'stickerLook',
  vote: 'stickerVote',
  quiz: 'stickerQuiz',
  question: 'stickerQuestion',
  emojiSlider: 'stickerEmojiSlider',
  countdown: 'stickerCountdown',
  link: 'stickerLink',
  location: 'stickerLocation',
  hashtag: 'stickerHashtag',
  music: 'stickerMusic',
  decorative: 'layerDecorative',
  draw: 'layerDraw',
  gif: 'layerGif',
  time: 'layerTime',
  weather: 'layerWeather',
  adjustment: 'layerAdjustment',
};

/**
 * Returns the capability ID for a layer type, or null if unmapped.
 */
export function getCapabilityForLayerType(layerType: string): string | null {
  return LAYER_TYPE_TO_CAPABILITY[layerType] ?? null;
}

/**
 * Returns true if the layer type is interactive (requires backend support
 * for its interaction to work in the published viewer). This includes both
 * supported interactive stickers (vote, mention, product, look) and
 * unsupported ones (quiz, question, emojiSlider, countdown, link, location,
 * hashtag, music). Use `isCapabilitySupported()` to determine whether an
 * interactive layer type is actually advertisable.
 */
const INTERACTIVE_LAYER_TYPES = new Set([
  'vote', 'mention', 'product', 'look',
  'quiz', 'question', 'emojiSlider', 'countdown',
  'link', 'location', 'hashtag', 'music',
]);

export function isInteractiveLayer(layerType: string): boolean {
  return INTERACTIVE_LAYER_TYPES.has(layerType);
}

/**
 * Returns true if the layer type is purely visual (no interaction,
 * no backend sticker projection needed).
 */
const VISUAL_LAYER_TYPES = new Set([
  'decorative', 'draw', 'gif', 'time', 'weather', 'adjustment',
]);

export function isVisualLayer(layerType: string): boolean {
  return VISUAL_LAYER_TYPES.has(layerType);
}
