/**
 * ContextToolRail — a horizontal, context-sensitive tool rail for the
 * creator department (Poster/Look composers).
 *
 * Replaces the static tool dock pattern with a rail that adapts its visible
 * tool set based on the active {@link ToolContext} (editor mode + selection
 * state). Up to 4 primary actions are always visible; additional tools are
 * revealed under a trailing "More" button.
 *
 * Design requirements (2026 flagship creator UX research, AGENTS.md §4):
 *   - Maximum 4 primary actions visible — the Meta Edits / Instagram / CapCut
 *     pattern. The primary layer (canvas + preview) is ruthlessly guarded
 *     against feature creep. More tools ≠ better; ≤4 immediately relevant
 *     actions is the cognitive-fluency sweet spot.
 *   - Overflow under "More" with specific grouping labels (not a flat list)
 *   - 44pt minimum touch targets (48pt preferred for high-frequency tools)
 *   - Transparent background — no card, no border, no glass container
 *   - Horizontal scroll with hidden scroll indicator
 *   - Tool buttons: 24pt icon + 11pt label (textMuted) below
 *   - Selected/active state: icon turns brand color
 *   - Disabled state: icon at 40% opacity, no press feedback
 *   - Badge: small circle on top-right of icon for counts
 *   - "More" button: always last, ellipsis-horizontal icon
 *   - 4pt spacing between tools, 16pt horizontal padding on rail
 *   - Haptic feedback has one owner: CreatorToolButton
 *
 * Anatomy:
 *   ┌────────────────────────────────────────┐
 *   │  [icon]  [icon]  [icon]  [icon]  [⋯]  │
 *   │  Text    Sticker Music  Effects More   │
 *   └────────────────────────────────────────┘
 */

import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View, Text, type ViewStyle } from 'react-native';

import { Space } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  CreatorToolButton,
  type SelectedStyle,
} from '../controls/CreatorToolButton';
import {
  getPrimaryTools,
  getOverflowTools,
  hasOverflow,
  type ToolContext,
  type ToolDefinition,
  type ToolGroup,
} from '../core/toolRegistry';
import { usePinnedTools } from '../core/personalization/usePinnedTools';

// ── Props ───────────────────────────────────────────────────────────

export interface ContextToolRailProps {
  /** The active context — determines which tool group is rendered. */
  context: ToolContext;
  /** Registered tool groups. The rail resolves the active context from here. */
  groups: ToolGroup[];
  /** Called when the "More" overflow button is pressed. */
  onOverflowPress?: () => void;
  /** Optional style override for the rail container. */
  style?: ViewStyle;
}

// ── Constants ───────────────────────────────────────────────────────

/** Maximum primary tools visible before overflow. The 2026 flagship creator
 *  UX research (Meta Edits, Instagram, CapCut) converges on ≤4 immediately
 *  relevant actions — the primary layer is ruthlessly guarded against
 *  feature creep. More tools ≠ better; cognitive fluency peaks at 4. */
const MAX_PRIMARY = 4;
/** Badge diameter. */
const BADGE_SIZE = 16;
/** Badge text size. */
const BADGE_FONT_SIZE = 10;

/**
 * Tools that use universally understood Ionicons and should NOT show a
 * permanent label — icon-only is clearer for these familiar actions.
 */
const ICON_ONLY_TOOLS = new Set<string>([
  'close',
  'back',
  'play',
  'pause',
  'search',
  'undo',
  'redo',
  'more',
  'settings',
  'share',
  'delete',
]);

// ── Single tool button ──────────────────────────────────────────────
// Wraps CreatorToolButton, wiring the tool definition's active state,
// selectedStyle, glyph/icon, and label. Extracted as a memo component so
// each tool owns its own press state without re-rendering siblings.

interface RailToolButtonProps {
  tool: ToolDefinition;
  /** Called after the tool is pressed — used to record usage for personalization. */
  onToolUsed?: (toolId: string) => void;
}

const RailToolButton = React.memo(function RailToolButton({
  tool,
  onToolUsed,
}: RailToolButtonProps) {
  const handlePress = useCallback(() => {
    if (tool.disabled) return;
    tool.onPress();
    // Record usage for personalization (pinning / recent tools).
    // Fire-and-forget — the hook persists asynchronously.
    if (onToolUsed) onToolUsed(tool.id);
  }, [tool, onToolUsed]);

  // Determine whether to show the label. Universally familiar tools
  // (close, back, play, etc.) are icon-only; ambiguous creative tools
  // (trim, split, cutout, keyframe, speed-curve) keep their label.
  const showLabel = !ICON_ONLY_TOOLS.has(tool.id) && tool.label.length > 0;

  // Resolve the selected style — default to 'fill' (backplate) per spec.
  const selectedStyle: SelectedStyle = tool.selectedStyle ?? 'fill';

  return (
    <View style={styles.toolBtnWrap}>
      <CreatorToolButton
        glyph={tool.glyph}
        icon={tool.glyph ? undefined : tool.icon}
        label={showLabel ? tool.label : undefined}
        active={tool.active}
        selectedStyle={selectedStyle}
        disabled={tool.disabled}
        onPress={handlePress}
        accessibilityLabel={tool.accessibilityLabel}
        accessibilityHint={tool.accessibilityHint}
      />
      {/* Badge — rendered as an overlay since CreatorToolButton doesn't
          include badge support (badges are rail-specific). */}
      {tool.badge !== undefined && tool.badge !== null && !tool.disabled && (
        <View style={styles.badgeOverlay}>
          <Badge badge={tool.badge} />
        </View>
      )}
    </View>
  );
});

// ── Badge (small count overlay) ─────────────────────────────────────

interface BadgeProps {
  badge: number | string;
}

function Badge({ badge }: BadgeProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.brand }]}>
      <Text
        style={[styles.badgeText, { color: colors.textInverse }]}
        numberOfLines={1}
      >
        {badge}
      </Text>
    </View>
  );
}

// ── "More" overflow button ──────────────────────────────────────────

interface MoreButtonProps {
  onPress: () => void;
}

const MoreButton = React.memo(function MoreButton({
  onPress,
}: MoreButtonProps) {
  return (
    <CreatorToolButton
      icon="ellipsis-horizontal"
      label="More"
      onPress={onPress}
      accessibilityLabel="More tools"
      accessibilityHint="Opens additional creative tools — layers, transitions, templates, and advanced editing"
    />
  );
});

// ── ContextToolRail ─────────────────────────────────────────────────

export function ContextToolRail({
  context,
  groups,
  onOverflowPress,
  style,
}: ContextToolRailProps) {
  const { pinned, recordUse } = usePinnedTools();

  // Resolve the active tool set from the registry.
  const contextPrimaryTools = useMemo(
    () => getPrimaryTools(context, groups).slice(0, MAX_PRIMARY),
    [context, groups],
  );
  const overflowTools = useMemo(
    () => getOverflowTools(context, groups),
    [context, groups],
  );
  const showMore = useMemo(
    () => overflowTools.length > 0 || hasOverflow(context, groups),
    [overflowTools.length, context, groups],
  );

  // ── Pinned tools personalization (Phase 9) ────────────────────────
  // Pinned tools from the personalization store are surfaced at the front
  // of the rail, ahead of the context-default tools. Only pinned tools
  // that exist in the current context (primary or overflow) are shown —
  // we never surface a pinned tool that isn't available in this context.
  const pinnedTools = useMemo(() => {
    if (pinned.length === 0) return [];
    // Resolve pinned tool ids to their ToolDefinitions from the current
    // context. A pinned tool that isn't available in this context is
    // skipped (it remains pinned for contexts where it is available).
    const resolved: ToolDefinition[] = [];
    for (const p of pinned) {
      const tool = contextPrimaryTools.find((t) => t.id === p.toolId)
        ?? overflowTools.find((t) => t.id === p.toolId);
      if (tool) resolved.push(tool);
    }
    return resolved;
  }, [pinned, contextPrimaryTools, overflowTools]);

  // De-duplicate: pinned tools appear at the front, then context tools
  // that aren't already pinned fill the remaining slots up to MAX_PRIMARY.
  const primaryTools = useMemo(() => {
    const pinnedIds = new Set(pinnedTools.map((t) => t.id));
    const remaining = contextPrimaryTools.filter((t) => !pinnedIds.has(t.id));
    const combined = [...pinnedTools, ...remaining];
    return combined.slice(0, MAX_PRIMARY);
  }, [pinnedTools, contextPrimaryTools]);

  // Record tool usage for personalization. Fire-and-forget — the hook
  // persists to AsyncStorage asynchronously.
  const handleToolUsed = useCallback((toolId: string) => {
    void recordUse(toolId);
  }, [recordUse]);

  // Colors are now resolved inside CreatorToolButton (theme-aware).
  // The neutral default keeps the rail visually restrained per AGENTS.md §4
  // (hierarchy over decoration). Active state is driven by `tool.active`
  // and `tool.selectedStyle` on the ToolDefinition.

  const handleOverflow = useCallback(() => {
    if (onOverflowPress) {
      onOverflowPress();
    }
  }, [onOverflowPress]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.rail, style]}
      contentContainerStyle={styles.railContent}
    >
      {primaryTools.map((tool) => (
        <RailToolButton
          key={tool.id}
          tool={tool}
          onToolUsed={handleToolUsed}
        />
      ))}
      {showMore && (
        <MoreButton onPress={handleOverflow} />
      )}
    </ScrollView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Rail container ──
  // Transparent background — no card, no border, no glass (per spec).
  rail: {
    // Transparent by default; callers may override via `style` prop.
  },
  railContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md, // 16pt horizontal padding
    gap: Space.xs, // 4pt between tools
    paddingVertical: Space.xs,
  },
  // ── Tool button wrapper ──
  // CreatorToolButton provides its own 48pt hit target; this wrapper
  // positions the optional badge overlay relative to the button.
  toolBtnWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Badge overlay ──
  // Positioned at the top-right corner of the tool button.
  badgeOverlay: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 1,
  },
  // ── Badge ──
  badge: {
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: BADGE_FONT_SIZE,
    fontWeight: '600',
    lineHeight: BADGE_FONT_SIZE + 2,
    textAlign: 'center',
  },
});

export default ContextToolRail;
