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
  /** Ionicons glyph name. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
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
