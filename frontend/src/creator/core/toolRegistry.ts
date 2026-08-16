/**
 * Tool Registry — Context-sensitive tool definitions for the creator department.
 *
 * The creator department (Poster/Look composers) previously used static tool
 * docks that showed the same tools regardless of context. This registry
 * provides a context-sensitive system that adapts the visible tool set based
 * on:
 *
 *   1. What's selected (no selection = default tools, media selected = media
 *      tools, text selected = text tools, etc.)
 *   2. The editor mode (Poster photo vs Poster video vs Look)
 *
 * Each {@link ToolContext} maps to a {@link ToolGroup} containing up to 6
 * primary actions (always visible on the rail) and an overflow list (revealed
 * under the "More" button). The {@link ContextToolRail} surface consumes
 * these groups to render the appropriate tool set.
 *
 * Design references:
 *   - 09_VISUAL_SYSTEM spec: max 6 primary actions, overflow under "More"
 *   - AGENTS.md §4: composition and hierarchy over decoration
 *   - AGENTS.md §11: every visible control must perform a truthful action
 */

import type React from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { CreatorGlyphName } from '../controls/CreatorGlyph';

// ── Context identifiers ─────────────────────────────────────────────
// A ToolContext encodes both the editor mode and the current selection
// state. The rail resolves the active context to a ToolGroup and renders
// its primary + overflow tools.

export type ToolContext =
  | 'poster-photo-default'
  | 'poster-video-default'
  | 'poster-media-selected'
  | 'poster-text-selected'
  | 'poster-sticker-selected'
  | 'poster-product-selected'
  | 'look-default'
  | 'look-media-selected'
  | 'look-text-selected'
  | 'look-product-selected'
  | 'look-multi-select';

// ── Tool definition ─────────────────────────────────────────────────
// A single tool action rendered as an icon + label inside the rail.

export interface ToolDefinition {
  /** Stable unique id used for React keys and analytics. */
  id: string;
  /** Human-readable label shown beneath the icon. */
  label: string;
  /** Ionicons glyph name (for universally understood actions). */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /**
   * Optional creator-specific glyph (custom SVG from CreatorGlyph).
   * When provided, the rail renders this glyph instead of the Ionicons icon.
   * Use for ambiguous creative tools (trim, split, cutout, keyframe, etc.).
   */
  glyph?: CreatorGlyphName;
  /** Press handler — must perform a truthful action (AGENTS.md §11). */
  onPress: () => void;
  /** VoiceOver / TalkBack label. */
  accessibilityLabel: string;
  /** Optional accessibility hint describing the outcome. */
  accessibilityHint?: string;
  /** Haptic intensity fired on press. Defaults to 'light' at the rail level. */
  hapticFeedback?: 'light' | 'medium' | 'heavy';
  /** Optional badge — a small count or short string on the icon corner. */
  badge?: number | string;
  /** When true, the tool renders at 40% opacity and ignores presses. */
  disabled?: boolean;
  /**
   * NEW: whether the tool is currently active/selected in the composition.
   * Drives the selected-state visual treatment via `selectedStyle`.
   */
  active?: boolean;
  /**
   * NEW: how to visually represent the active/selected state.
   * - 'fill': filled backplate with accent (default)
   * - 'accent': accent-colored glyph, no backplate
   * - 'indicator': small dot indicator below the glyph
   */
  selectedStyle?: 'fill' | 'accent' | 'indicator';
}

// ── Tool group ──────────────────────────────────────────────────────
// A context maps to one group. Primary tools are always visible on the
// rail (max 6); overflow tools are revealed under the "More" button.

export type ToolGroup = {
  /** The context this group serves. */
  context: ToolContext;
  /** Primary actions — always visible. Capped at 6 by the rail. */
  primary: ToolDefinition[];
  /** Overflow actions — revealed under "More". */
  overflow: ToolDefinition[];
};

// ── Selectors ───────────────────────────────────────────────────────
// Pure helpers that resolve a context to its tool set. The rail calls
// these to split primary vs overflow rendering.

/**
 * Returns the full tool list (primary + overflow) for a context.
 * Returns an empty array when no group is registered for the context.
 */
export function getToolsForContext(
  context: ToolContext,
  groups: ToolGroup[],
): ToolDefinition[] {
  const group = groups.find((g) => g.context === context);
  if (!group) return [];
  return [...group.primary, ...group.overflow];
}

/**
 * Returns the primary tools for a context, capped at 6.
 * The rail renders these as always-visible icon+label buttons.
 */
export function getPrimaryTools(
  context: ToolContext,
  groups: ToolGroup[],
): ToolDefinition[] {
  const group = groups.find((g) => g.context === context);
  return group?.primary.slice(0, 6) ?? [];
}

/**
 * Returns the overflow tools for a context.
 * The rail reveals these under the "More" button.
 */
export function getOverflowTools(
  context: ToolContext,
  groups: ToolGroup[],
): ToolDefinition[] {
  const group = groups.find((g) => g.context === context);
  return group?.overflow ?? [];
}

/**
 * Returns true when a context has any overflow tools registered.
 * Used by the rail to decide whether to render the "More" button.
 */
export function hasOverflow(
  context: ToolContext,
  groups: ToolGroup[],
): boolean {
  return getOverflowTools(context, groups).length > 0;
}

// ── Active-state derivation ──────────────────────────────────────────
// Determines whether a tool should show its active/selected state based on
// the current composition context. This is a pure function — the rail calls
// it to resolve `active` for each tool before rendering.

/**
 * A snapshot of the current composition state used to derive tool active
 * states. All fields are optional; missing fields default to inactive.
 */
export interface CompositionContext {
  /** Whether any effect is applied to the current composition (effect stack non-empty). */
  hasEffects?: boolean;
  /** Whether a mask/cutout is attached to the current layer. */
  hasMask?: boolean;
  /** Current audio volume (0 = muted). */
  volume?: number;
  /** Whether the safe-zone overlay is visible. */
  safeZoneVisible?: boolean;
  /** Whether the grid overlay is visible. */
  gridVisible?: boolean;
  /** Whether the flash/torch is on. */
  flashOn?: boolean;
  /** The id of the currently active tool (if any tool is explicitly active). */
  activeToolId?: string;
}

/**
 * Derives whether a tool should show its active/selected state from the
 * current composition context.
 *
 * Mapping:
 *   - effects  → active when effect stack is non-empty
 *   - cutout   → active when a mask is attached
 *   - mute     → active when volume is 0
 *   - safe-zone → active while visible
 *   - grid     → active while visible
 *   - flash    → active while on
 *   - any tool → active when its id matches `activeToolId`
 *
 * Tools that don't match any of the above default to inactive.
 */
export function deriveToolActiveState(
  toolId: string,
  ctx: CompositionContext,
): boolean {
  // Explicit active tool id takes precedence.
  if (ctx.activeToolId !== undefined && toolId === ctx.activeToolId) {
    return true;
  }

  switch (toolId) {
    case 'effects':
    case 'effect':
      return ctx.hasEffects === true;
    case 'cutout':
    case 'mask':
      return ctx.hasMask === true;
    case 'mute':
    case 'audio-mute':
      return ctx.volume === 0;
    case 'safe-zone':
      return ctx.safeZoneVisible === true;
    case 'grid':
      return ctx.gridVisible === true;
    case 'flash':
    case 'torch':
      return ctx.flashOn === true;
    default:
      return false;
  }
}
