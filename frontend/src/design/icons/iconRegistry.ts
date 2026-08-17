import type { ComponentType } from 'react';

// BANNED ICON METAPHORS (per audit spec):
// - Flash/lightning: ONLY camera flash hardware. NOT urgency, boost, live, quality, automation.
// - Shield: ONLY named protection program opening exact terms. NOT generic trust/safety/verified.
// - Sparkles: BANNED entirely. Do not use for AI, new, magic, enhance, recommended.
// - Robot/brain: BANNED. Do not use for automation.
// - Check badge: Separate into identity verification, item provenance, and task completion.

export type IconSource = 'system' | 'authored' | 'licensed';
export type IconVariant = 'regular' | 'selected' | 'filled';

export interface IconDefinition {
  semanticName: string;
  source: IconSource;
  /** Ionicons name for system icons, or a custom SVG component for authored icons */
  systemName?: string;
  customComponent?: ComponentType<{ size?: number; color?: string }>;
  variants?: IconVariant[];
  /** Allowed contexts to prevent metaphor drift */
  allowedContexts: string[];
  /** Accessibility: is this icon decorative or does it need a label? */
  decorative: boolean;
  /** Default size band */
  defaultSize: 16 | 20 | 24 | 28;
  /** Color role token name */
  colorRole?: string;
  /** Deprecation info for migrated icons */
  deprecated?: { reason: string; replacement: string };
}

export const ICON_REGISTRY: Record<string, IconDefinition> = {
  // ── System icons (keep using Ionicons) ──
  back: { semanticName: 'back', source: 'system', systemName: 'chevron-back', allowedContexts: ['navigation'], decorative: false, defaultSize: 24 },
  close: { semanticName: 'close', source: 'system', systemName: 'close', allowedContexts: ['navigation', 'sheets'], decorative: false, defaultSize: 24 },
  search: { semanticName: 'search', source: 'system', systemName: 'search', allowedContexts: ['search'], decorative: false, defaultSize: 20 },
  camera: { semanticName: 'camera', source: 'system', systemName: 'camera-outline', allowedContexts: ['creator', 'capture'], decorative: false, defaultSize: 24 },
  share: { semanticName: 'share', source: 'system', systemName: 'share-outline', allowedContexts: ['actions'], decorative: false, defaultSize: 20 },
  more: { semanticName: 'more', source: 'system', systemName: 'ellipsis-horizontal', allowedContexts: ['actions'], decorative: false, defaultSize: 20 },
  play: { semanticName: 'play', source: 'system', systemName: 'play', allowedContexts: ['media'], decorative: false, defaultSize: 20 },
  pause: { semanticName: 'pause', source: 'system', systemName: 'pause', allowedContexts: ['media'], decorative: false, defaultSize: 20 },
  mute: { semanticName: 'mute', source: 'system', systemName: 'volume-mute-outline', allowedContexts: ['media'], decorative: false, defaultSize: 20 },

  // ── Authored domain icons (use system for now, mark for replacement) ──
  coOwn: { semanticName: 'coOwn', source: 'system', systemName: 'pie-chart-outline', allowedContexts: ['co-own', 'trading'], decorative: false, defaultSize: 20, deprecated: { reason: 'Stock pie-chart is generic; commission authored co-own fraction mark', replacement: 'authored co-own icon' } },
  marketDepth: { semanticName: 'marketDepth', source: 'system', systemName: 'bar-chart-outline', allowedContexts: ['co-own', 'trading'], decorative: false, defaultSize: 20 },
  provenance: { semanticName: 'provenance', source: 'system', systemName: 'document-text-outline', allowedContexts: ['co-own', 'verification'], decorative: false, defaultSize: 20 },
  lookCompose: { semanticName: 'lookCompose', source: 'system', systemName: 'grid-outline', allowedContexts: ['creator', 'looks'], decorative: false, defaultSize: 20 },
  hotspot: { semanticName: 'hotspot', source: 'system', systemName: 'pricetag-outline', allowedContexts: ['looks', 'commerce'], decorative: false, defaultSize: 16 },
  creatorLayer: { semanticName: 'creatorLayer', source: 'system', systemName: 'layers-outline', allowedContexts: ['creator'], decorative: false, defaultSize: 20 },
  conditionEvidence: { semanticName: 'conditionEvidence', source: 'system', systemName: 'checkmark-circle-outline', allowedContexts: ['commerce', 'listing'], decorative: false, defaultSize: 16 },
  galleria: { semanticName: 'galleria', source: 'system', systemName: 'albums-outline', allowedContexts: ['galleria'], decorative: false, defaultSize: 24 },
  thryftSave: { semanticName: 'thryftSave', source: 'system', systemName: 'bookmark-outline', allowedContexts: ['commerce', 'collections'], decorative: false, defaultSize: 20, variants: ['regular', 'filled'] },

  // ── BANNED metaphors — these have one meaning each or are removed ──
  // Flash/lightning: ONLY for flash/lighting hardware on camera. NOT for urgency, boost, live, quality, automation.
  flash: { semanticName: 'flash', source: 'system', systemName: 'flash-outline', allowedContexts: ['camera', 'capture'], decorative: false, defaultSize: 20 },
  // Shield: ONLY for a named protection program that opens exact terms. NOT for generic trust/safety/verified.
  shieldProtection: { semanticName: 'shieldProtection', source: 'system', systemName: 'shield-checkmark-outline', allowedContexts: ['protection-program'], decorative: false, defaultSize: 20 },
  // Sparkle: BANNED. Do not use for AI, new, magic, enhance, recommended.
  // Robot/brain: BANNED. Do not use for automation.
};

export function getIconDefinition(semanticName: string): IconDefinition | undefined {
  return ICON_REGISTRY[semanticName];
}

export function isIconAllowedInContext(semanticName: string, context: string): boolean {
  const def = ICON_REGISTRY[semanticName];
  if (!def) return false;
  return def.allowedContexts.includes(context);
}
