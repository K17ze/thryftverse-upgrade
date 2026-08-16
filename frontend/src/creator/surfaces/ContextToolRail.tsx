/**
 * ContextToolRail — a horizontal, context-sensitive tool rail for the
 * creator department (Poster/Look composers).
 *
 * Replaces the static tool dock pattern with a rail that adapts its visible
 * tool set based on the active {@link ToolContext} (editor mode + selection
 * state). Up to 6 primary actions are always visible; additional tools are
 * revealed under a trailing "More" button.
 *
 * Design requirements (09_VISUAL_SYSTEM spec):
 *   - Maximum 6 primary actions visible; overflow under "More"
 *   - 44pt minimum touch targets (48pt preferred for high-frequency tools)
 *   - Transparent background — no card, no border, no glass container
 *   - Horizontal scroll with hidden scroll indicator
 *   - Tool buttons: 24pt icon + 11pt label (textMuted) below
 *   - Selected/active state: icon turns brand color
 *   - Disabled state: icon at 40% opacity, no press feedback
 *   - Badge: small circle on top-right of icon for counts
 *   - "More" button: always last, ellipsis-horizontal icon
 *   - 4pt spacing between tools, 16pt horizontal padding on rail
 *   - Reduced motion: no entrance animation
 *   - Haptic feedback: light haptic on press (unless overridden)
 *
 * Anatomy:
 *   ┌────────────────────────────────────────────────┐
 *   │  [icon]  [icon]  [icon]  [icon]  [icon]  [⋯]  │
 *   │  Text    Sticker Music  Effects Draw    More   │
 *   └────────────────────────────────────────────────┘
 */

import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Pressable, View, Text, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useHaptic } from '../../hooks/useHaptic';
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

/** Icon size for primary tool glyphs (per spec: 24pt). */
const ICON_SIZE = 24;
/** Icon size for the "More" overflow button. */
const MORE_ICON_SIZE = 24;
/** Minimum touch target (per spec: 44pt minimum). */
const TOUCH_TARGET = 44;
/** Preferred touch target for high-frequency tools (per spec: 48pt). */
const PREFERRED_TARGET = 48;
/** Badge diameter. */
const BADGE_SIZE = 16;
/** Badge text size. */
const BADGE_FONT_SIZE = 10;
/** Maximum primary tools visible before overflow. */
const MAX_PRIMARY = 6;

// ── Single tool button ──────────────────────────────────────────────
// Extracted as its own memo component so each tool owns its own press
// state and haptic without re-rendering siblings.

interface RailToolButtonProps {
  tool: ToolDefinition;
  iconColor: string;
  labelColor: string;
  badgeColor: string;
  badgeTextColor: string;
  preferred?: boolean;
  /** Called after the tool is pressed — used to record usage for personalization. */
  onToolUsed?: (toolId: string) => void;
}

const RailToolButton = React.memo(function RailToolButton({
  tool,
  iconColor,
  labelColor,
  badgeColor,
  badgeTextColor,
  preferred = false,
  onToolUsed,
}: RailToolButtonProps) {
  const haptic = useHaptic();

  const handlePress = useCallback(() => {
    if (tool.disabled) return;
    switch (tool.hapticFeedback) {
      case 'medium':
        haptic.medium();
        break;
      case 'heavy':
        haptic.heavy();
        break;
      case 'light':
      default:
        haptic.light();
        break;
    }
    tool.onPress();
    // Record usage for personalization (pinning / recent tools).
    // Fire-and-forget — the hook persists asynchronously.
    if (onToolUsed) onToolUsed(tool.id);
  }, [tool, haptic, onToolUsed]);

  const targetSize = preferred ? PREFERRED_TARGET : TOUCH_TARGET;

  return (
    <Pressable
      onPress={handlePress}
      disabled={tool.disabled}
      style={[styles.toolBtn, { minWidth: targetSize, minHeight: targetSize }]}
      accessibilityLabel={tool.accessibilityLabel}
      accessibilityHint={tool.accessibilityHint}
      accessibilityRole="button"
      accessibilityState={tool.disabled ? { disabled: true } : undefined}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={tool.icon}
          size={ICON_SIZE}
          color={iconColor}
          style={tool.disabled ? styles.iconDisabled : undefined}
        />
        {tool.badge !== undefined && tool.badge !== null && !tool.disabled && (
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text
              style={[styles.badgeText, { color: badgeTextColor }]}
              numberOfLines={1}
            >
              {tool.badge}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={[styles.toolLabel, { color: labelColor }]}
        numberOfLines={1}
      >
        {tool.label}
      </Text>
    </Pressable>
  );
});

// ── "More" overflow button ──────────────────────────────────────────

interface MoreButtonProps {
  label: string;
  iconColor: string;
  labelColor: string;
  onPress: () => void;
}

const MoreButton = React.memo(function MoreButton({
  label,
  iconColor,
  labelColor,
  onPress,
}: MoreButtonProps) {
  const haptic = useHaptic();

  const handlePress = useCallback(() => {
    haptic.light();
    onPress();
  }, [haptic, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.toolBtn, { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET }]}
      accessibilityLabel={label}
      accessibilityHint="Opens the overflow menu with additional tools"
      accessibilityRole="button"
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="ellipsis-horizontal" size={MORE_ICON_SIZE} color={iconColor} />
      </View>
      <Text style={[styles.toolLabel, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

// ── ContextToolRail ─────────────────────────────────────────────────

export function ContextToolRail({
  context,
  groups,
  onOverflowPress,
  style,
}: ContextToolRailProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const haptic = useHaptic();
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

  // Light haptic when the context changes (tool set swaps) — respects
  // reduced motion via the haptic hook's internal gate.
  const prevContextRef = React.useRef<ToolContext>(context);
  React.useEffect(() => {
    if (prevContextRef.current !== context) {
      prevContextRef.current = context;
      if (!reduceMotion) {
        haptic.light();
      }
    }
  }, [context, reduceMotion, haptic]);

  // Colors — icons default to textSecondary (neutral). The "active/selected"
  // state (icon turns brand color) is driven by the consumer via a future
  // `active` flag on ToolDefinition; the neutral default keeps the rail
  // visually restrained per AGENTS.md §4 (hierarchy over decoration).
  const iconColor = colors.textSecondary;
  const labelColor = colors.textMuted;
  const badgeColor = colors.brand;
  const badgeTextColor = colors.textInverse;

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
          iconColor={iconColor}
          labelColor={labelColor}
          badgeColor={badgeColor}
          badgeTextColor={badgeTextColor}
          onToolUsed={handleToolUsed}
        />
      ))}
      {showMore && (
        <MoreButton
          label="More"
          iconColor={iconColor}
          labelColor={labelColor}
          onPress={handleOverflow}
        />
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
  // ── Tool button ──
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // ── Label (11pt, textMuted) ──
  toolLabel: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size, // 11pt
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xxs, // 2pt gap between icon and label
    textAlign: 'center',
  },
  // ── Disabled state ──
  iconDisabled: {
    opacity: 0.4, // 40% opacity per spec
  },
  // ── Badge ──
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: BADGE_FONT_SIZE,
    fontWeight: '600',
    lineHeight: BADGE_FONT_SIZE + 2,
    textAlign: 'center',
  },
});

export default ContextToolRail;
