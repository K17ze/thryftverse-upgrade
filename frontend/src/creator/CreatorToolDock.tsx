import React, { useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useCreator } from './CreatorContext';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { LiquidGlassBackdrop } from '../components/LiquidGlassBackdrop';
import { ToolButton, type RailTool } from './dock/ToolButton';
import type { CreatorLayer } from './composition';
import type { AssetPickerMode } from './CreatorAssetPicker';

// ── Contextual tool definitions ────────────────────────────────────
// Instagram-grade tool dock: grouped tools with visual hierarchy.
// Primary tools (Media, Text) get filled icon backgrounds.
// Secondary tools (stickers) get outline icons only.
// Groups are separated by subtle dividers, not flat scrolly bars.

interface ToolGroup {
  tools: RailTool[];
}

export interface CreatorToolDockProps {
  selectedLayer: CreatorLayer | null;
  onPublish: () => void;
  onSettings: () => void;
  onToolPress: (mode: AssetPickerMode) => void;
  onEditLayer: (layer: CreatorLayer) => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onReorderLayer: (id: string, direction: 'forward' | 'backward') => void;
  onMore: () => void;
  floating?: boolean;
  /** Page-level actions — Poster: add page, Look: layout presets */
  onAddPage?: () => void;
  onLayoutPresets?: () => void;
  /** Look-specific: crop a media layer */
  onCropLayer?: (layer: CreatorLayer) => void;
  /** Look-specific: cutout a media layer */
  onCutoutLayer?: (layer: CreatorLayer) => void;
  /** Document type — drives Poster-specific Instagram-style tool set.
   *  Falls back to the CreatorContext document type when omitted. */
  documentType?: 'poster' | 'look';
}

export function CreatorToolDock({
  selectedLayer,
  onPublish,
  onToolPress,
  onEditLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onReorderLayer,
  onMore,
  floating = false,
  onAddPage,
  onLayoutPresets,
  onCropLayer,
  onCutoutLayer,
  documentType,
}: CreatorToolDockProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { spring, duration } = useMotionConfig();
  const isLook = (documentType ?? document.type) === 'look';
  const isPoster = (documentType ?? document.type) === 'poster';
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [secondaryWidth, setSecondaryWidth] = useState(0);

  // ── Shared values for animations ──────────────────────────────────
  const dockTranslateY = useSharedValue(reduceMotion ? 0 : 120);
  const dockOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const secondaryExpandSV = useSharedValue(0); // 0 = collapsed, 1 = expanded
  const contextTransitionSV = useSharedValue(0); // 0 = settled, animates on context change
  const prevSelectionModeRef = useRef(false);

  const isSelectionMode = !!selectedLayer;

  // ── Dock slide-in animation on mount ──────────────────────────────
  // Uses the entrance spring token — smooth, confident sheet/modal motion.
  useEffect(() => {
    if (reduceMotion) {
      dockTranslateY.value = 0;
      dockOpacity.value = 1;
    } else {
      dockTranslateY.value = withSpring(0, spring.entrance);
      const fadeMs = (duration as { normal: number }).normal;
      dockOpacity.value = withTiming(1, { duration: fadeMs, easing: Easing.out(Easing.cubic) });
    }
    haptic.light();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Contextual tool switching: spring transition on selection change ──
  // Uses the press spring token — slightly softer, for context transitions.
  useEffect(() => {
    if (prevSelectionModeRef.current !== isSelectionMode) {
      prevSelectionModeRef.current = isSelectionMode;
      if (!reduceMotion) {
        contextTransitionSV.value = 0;
        contextTransitionSV.value = withSpring(1, spring.press);
        haptic.light();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelectionMode]);

  // ── Secondary expand/collapse animation ───────────────────────────
  // Uses the lift spring token — playful but controlled card lift motion.
  const toggleSecondary = useCallback(() => {
    setSecondaryExpanded((prev) => {
      const next = !prev;
      if (reduceMotion) {
        secondaryExpandSV.value = next ? 1 : 0;
      } else {
        secondaryExpandSV.value = withSpring(next ? 1 : 0, spring.lift);
      }
      haptic.light();
      return next;
    });
  }, [reduceMotion, secondaryExpandSV, haptic, spring]);

  // Build contextual tools based on selection state and mode.
  // Poster mode uses an Instagram Stories tool set; Look mode keeps the
  // collage-first editorial tool set.
  const tools: RailTool[] = selectedLayer
    ? buildSelectionTools(selectedLayer, isLook, onEditLayer, onDeleteLayer, onDuplicateLayer, onReorderLayer, onCropLayer, onCutoutLayer)
    : buildDefaultTools(isLook, isPoster, onToolPress, onAddPage, onLayoutPresets);

  // Split into primary / secondary groups so a divider can separate them.
  // In selection mode every tool is secondary (no primary flag), so no divider.
  const primaryTools = tools.filter(t => t.primary);
  const secondaryTools = tools.filter(t => !t.primary);
  const hasDivider = !isSelectionMode && primaryTools.length > 0 && secondaryTools.length > 0;
  // In selection mode, show all tools directly (no expand/collapse needed).
  const showSecondaryToggle = !isSelectionMode && secondaryTools.length > 0;

  const handleToolPress = useCallback((tool: RailTool) => {
    tool.action();
  }, []);

  const handlePublish = useCallback(() => {
    haptic.medium();
    onPublish();
  }, [haptic, onPublish]);

  const handleMore = useCallback(() => {
    haptic.selection();
    onMore();
  }, [haptic, onMore]);

  const handleLongPressTooltip = useCallback((label: string) => {
    setHoveredTool(label);
  }, []);

  // ── Mode-aware visual hierarchy ────────────────────────────────────
  // Instagram-style: primary tools are larger (46pt) with filled backgrounds
  // and gradient rings; secondary tools are smaller (40pt), transparent.
  // Selection mode collapses to a single compact tier (44pt).
  const primarySize = 46;
  const secondarySize = 40;
  const selectionSize = 44;
  const primaryIconSize = 24;
  const secondaryIconSize = 22;
  const selectionIconSize = 22;
  const toolGap = isSelectionMode ? Space.xs : Space.sm;

  const labelColor = colors.textSecondary;
  const dangerIconColor = colors.danger;
  const dangerLabelColor = colors.danger;

  const getToolBg = (tool: RailTool): string => {
    if (tool.danger) return 'transparent';
    if (isSelectionMode) return colors.surface;
    return tool.primary ? colors.brand : 'transparent';
  };

  const getToolIconColor = (tool: RailTool): string => {
    if (tool.danger) return dangerIconColor;
    if (isSelectionMode) return colors.textPrimary;
    return tool.primary ? colors.textInverse : colors.textSecondary;
  };

  const getToolSize = (tool: RailTool): number => {
    if (isSelectionMode) return selectionSize;
    return tool.primary ? primarySize : secondarySize;
  };

  const getToolIconSize = (tool: RailTool): number => {
    if (isSelectionMode) return selectionIconSize;
    return tool.primary ? primaryIconSize : secondaryIconSize;
  };

  // Render a single tool button using the extracted ToolButton component.
  const renderTool = (tool: RailTool) => {
    const isActive = !!tool.primary && !isSelectionMode && !tool.danger;
    return (
      <ToolButton
        key={tool.label}
        tool={tool}
        isActive={isActive}
        size={getToolSize(tool)}
        iconSize={getToolIconSize(tool)}
        iconColor={getToolIconColor(tool)}
        bgColor={getToolBg(tool)}
        labelColor={labelColor}
        floating={floating}
        colors={colors}
        onPress={() => handleToolPress(tool)}
        onLongPressTooltip={handleLongPressTooltip}
      />
    );
  };

  // ── Secondary tools container with spring expand/collapse ─────────
  const secondaryAnimStyle = useAnimatedStyle(() => ({
    maxWidth: secondaryWidth > 0 ? secondaryWidth * secondaryExpandSV.value : 999 * secondaryExpandSV.value,
    opacity: secondaryExpandSV.value,
    transform: [{ translateX: -16 * (1 - secondaryExpandSV.value) }],
    overflow: 'hidden' as const,
  }));

  // ── Context transition: subtle slide + fade on tool set change ─────
  const contextStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 8 * (1 - contextTransitionSV.value) }],
    opacity: contextTransitionSV.value,
  }));

  // ── Dock slide-in style ────────────────────────────────────────────
  const dockStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dockTranslateY.value }],
    opacity: dockOpacity.value,
  }));

  const handleSecondaryLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== secondaryWidth) {
      setSecondaryWidth(w);
    }
  }, [secondaryWidth]);

  // Render the tool list with optional divider and expandable secondary tools.
  const renderToolList = () => {
    if (isSelectionMode || !hasDivider) {
      return (
        <Reanimated.View style={contextStyle}>
          {tools.map(renderTool)}
        </Reanimated.View>
      );
    }
    return (
      <Reanimated.View style={contextStyle}>
        {primaryTools.map(renderTool)}
        {showSecondaryToggle && (
          <>
            {/* Subtle visual separator between primary and secondary groups —
                a short hairline, not a full divider line. */}
            <View style={[styles.groupDivider, { backgroundColor: floating ? colors.glassBorder : colors.border }]} />
            {/* Expand/collapse toggle for secondary tools — refined chevron
                with a generous 44pt hit area showing only a 20pt glyph. */}
            <PressScale
              onPress={toggleSecondary}
              style={styles.expandToggle}
              accessibilityLabel={secondaryExpanded ? 'Show fewer tools' : 'Show more tools'}
              accessibilityHint="Expands or collapses the secondary tool tray"
              accessibilityRole="button"
              accessibilityState={{ expanded: secondaryExpanded }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={secondaryExpanded ? 'chevron-back-outline' : 'chevron-forward-outline'}
                size={20}
                color={floating ? colors.textInverse : colors.textSecondary}
              />
            </PressScale>
            {/* Secondary tools — spring expand/collapse */}
            <Reanimated.View
              style={[styles.secondaryContainer, secondaryAnimStyle]}
              onLayout={handleSecondaryLayout}
              pointerEvents={secondaryExpanded ? 'auto' : 'none'}
            >
              <View style={styles.secondaryInner}>
                {secondaryTools.map(renderTool)}
              </View>
            </Reanimated.View>
          </>
        )}
      </Reanimated.View>
    );
  };

  return (
    <Reanimated.View
      style={[
        styles.container,
        floating
          ? styles.containerFloating
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingTop: Space.md,
              paddingBottom: Math.max(insets.bottom, Space.sm),
            },
        dockStyle,
      ]}
    >
      {floating ? (
        <LiquidGlassBackdrop
          intensity={60}
          tint="dark"
          absoluteFill={false}
          style={[
            styles.blurPill,
            {
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
              shadowColor: colors.shadow,
              shadowOpacity: 0.3,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 },
              elevation: 12,
              minHeight: 64,
              paddingHorizontal: Space.sm,
            },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { gap: toolGap }]}
          >
            {renderToolList()}
          </ScrollView>
        </LiquidGlassBackdrop>
      ) : (
        <View style={styles.scrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { gap: toolGap }]}
          >
            {renderToolList()}
          </ScrollView>
          {/* Subtle right-edge gradient fade indicating horizontal overflow */}
          <LinearGradient
            pointerEvents="none"
            colors={[`${colors.surface}00`, colors.surface]}
            style={styles.fadeRight}
          />
        </View>
      )}

      {/* Primary action — separated from editing tools */}
      <View style={[styles.actions, { borderLeftColor: floating ? colors.glassBorder : colors.border }]}>
        <PressScale
          onPress={handleMore}
          style={styles.actionBtn}
          accessibilityLabel="More options"
          accessibilityHint="Opens the overflow menu with undo, redo, preview and more"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={floating ? colors.textInverse : colors.textSecondary} />
        </PressScale>
        {/* Publish button — always visible, floating or solid */}
        <PressScale
          onPress={handlePublish}
          style={[styles.publishBtn, { backgroundColor: colors.brand }]}
          accessibilityLabel="Next"
          accessibilityHint="Opens the publish sheet to review and publish your creation"
          scale={0.97}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={[styles.publishBtnText, { color: colors.textInverse }]}>Next</Text>
        </PressScale>
      </View>

      {/* Long-press tooltip label — centered below the dock (legacy fallback) */}
      {hoveredTool ? (
        <Text style={[styles.hoverLabel, { color: floating ? colors.textInverse : colors.textSecondary }]} numberOfLines={1}>
          {hoveredTool}
        </Text>
      ) : null}
    </Reanimated.View>
  );
}

// ── Tool builders ──────────────────────────────────────────────────
// Per audit 9.4: 4-5 context-relevant tools, neutral icons, one accent.
// Nothing selected: Media, Text, Product, Elements, More
// Media selected: Replace, Forward, Back, Delete, More
// Text selected: Edit, Forward, Back, Delete, More
// Product selected: Edit, Forward, Back, Delete, More

function buildDefaultTools(
  isLook: boolean,
  isPoster: boolean,
  onToolPress: (mode: AssetPickerMode) => void,
  onAddPage?: () => void,
  onLayoutPresets?: () => void,
): RailTool[] {
  if (isLook) {
    // Look: collage-first tool set. Per audit doc 02/05:
    // Visible by default: add item/media, cutout, text, product, background, more.
    // Primary tools (Media, Text) lead with brand fill; secondary tools
    // (cutout, product, background, layout, draw, gif, music) follow a
    // divider and are revealed via the chevron "more" toggle. Draw, GIF,
    // and Music are preserved behind "more" rather than removed — they
    // are real creator capabilities useful for collage composition.
    return [
      { icon: 'images', label: 'Media', action: () => onToolPress('media'), primary: true },
      { icon: 'text', label: 'Text', action: () => onToolPress('text'), primary: true },
      { icon: 'crop-outline', label: 'Crop', action: () => onToolPress('media') },
      { icon: 'pricetag-outline', label: 'Product', action: () => onToolPress('product') },
      { icon: 'color-fill-outline', label: 'Background', action: () => onToolPress('shape') },
      { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw') },
      { icon: 'image-outline', label: 'GIF', action: () => onToolPress('gif') },
      { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music') },
      ...(onLayoutPresets ? [{ icon: 'grid-outline' as const, label: 'Layout', action: onLayoutPresets }] : []),
    ];
  }
  if (isPoster) {
    // Poster: Instagram Stories pattern.
    // Primary tools (Text, Stickers, Draw, Music) are always visible with
    // filled icon backgrounds. Secondary sticker tools follow a divider and
    // are icon-only, keeping the dock minimal and contextual.
    return [
      // ── Primary (always visible) ──
      { icon: 'text', label: 'Text', action: () => onToolPress('text'), primary: true },
      { icon: 'happy-outline', label: 'Stickers', action: () => onToolPress('stickers'), primary: true },
      { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw'), primary: true },
      { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music'), primary: true },
      // ── Secondary (sticker tray) ──
      { icon: 'at-outline', label: 'Mention', action: () => onToolPress('mention') },
      { icon: 'pricetag-outline', label: 'Item', action: () => onToolPress('product') },
      { icon: 'shirt-outline', label: 'Look', action: () => onToolPress('look') },
      { icon: 'bar-chart-outline', label: 'Vote', action: () => onToolPress('vote') },
      { icon: 'help-circle-outline', label: 'Quiz', action: () => onToolPress('quiz') },
      { icon: 'chatbubble-outline', label: 'Question', action: () => onToolPress('question') },
      { icon: 'location-outline', label: 'Location', action: () => onToolPress('location') },
      { icon: 'pricetags-outline', label: 'Hashtag', action: () => onToolPress('hashtag') },
      { icon: 'link-outline', label: 'Link', action: () => onToolPress('link') },
      { icon: 'time-outline', label: 'Countdown', action: () => onToolPress('countdown') },
      { icon: 'image-outline', label: 'GIF', action: () => onToolPress('gif') },
      // Page management stays accessible at the end of the secondary tray.
      ...(onAddPage ? [{ icon: 'add-circle-outline' as const, label: 'Add Page', action: onAddPage }] : []),
    ];
  }
  // Fallback (no document type resolved) — keep the legacy Poster set.
  return [
    { icon: 'images', label: 'Media', action: () => onToolPress('media'), primary: true },
    { icon: 'text', label: 'Text', action: () => onToolPress('text'), primary: true },
    { icon: 'happy-outline', label: 'Stickers', action: () => onToolPress('stickers'), primary: true },
    { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw') },
    { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music') },
    ...(onAddPage ? [{ icon: 'add-circle-outline' as const, label: 'Add Page', action: onAddPage }] : []),
  ];
}

function buildSelectionTools(
  layer: CreatorLayer,
  isLook: boolean,
  onEditLayer: (layer: CreatorLayer) => void,
  onDeleteLayer: (id: string) => void,
  onDuplicateLayer: (id: string) => void,
  onReorderLayer: (id: string, direction: 'forward' | 'backward') => void,
  onCropLayer?: (layer: CreatorLayer) => void,
  onCutoutLayer?: (layer: CreatorLayer) => void,
): RailTool[] {
  const tools: RailTool[] = [];

  // Type-specific primary action — different per mode
  if (layer.type === 'text') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'media') {
    if (isLook) {
      // Look media selection: swap, remove background/refine cutout, flip.
      // Per Phase D spec: swap, remove background/refine cutout,
      // duplicate, forward/back, flip.
      tools.push({
        icon: 'swap-horizontal-outline',
        label: 'Swap',
        action: () => onEditLayer(layer),
      });
      tools.push({
        icon: 'crop-outline',
        label: 'Crop',
        action: () => (onCutoutLayer ? onCutoutLayer(layer) : onEditLayer(layer)),
      });
      tools.push({
        icon: 'crop-outline',
        label: 'Refine',
        action: () => (onCropLayer ? onCropLayer(layer) : onEditLayer(layer)),
      });
    } else {
      // Poster media: replace + trim (story-specific)
      tools.push({ icon: 'swap-horizontal-outline', label: 'Replace', action: () => onEditLayer(layer) });
      if (layer.payload && 'mediaType' in layer.payload && layer.payload.mediaType === 'video') {
        tools.push({ icon: 'cut-outline', label: 'Trim', action: () => onEditLayer(layer) });
      }
    }
  } else if (layer.type === 'product') {
    tools.push({ icon: 'pricetag-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'mention') {
    tools.push({ icon: 'person-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'vote') {
    tools.push({ icon: 'stats-chart-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'quiz') {
    tools.push({ icon: 'help-circle-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'question') {
    tools.push({ icon: 'chatbubble-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'emojiSlider') {
    tools.push({ icon: 'happy-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'countdown') {
    tools.push({ icon: 'time-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'draw') {
    tools.push({ icon: 'brush-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'gif') {
    tools.push({ icon: 'swap-horizontal-outline', label: 'Replace', action: () => onEditLayer(layer) });
  } else if (layer.type === 'music') {
    tools.push({ icon: 'swap-horizontal-outline', label: 'Replace', action: () => onEditLayer(layer) });
  } else if (layer.type === 'link') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'location') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'hashtag') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'time') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'weather') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  }

  // Layer ordering
  tools.push({ icon: 'arrow-up', label: 'Forward', action: () => onReorderLayer(layer.id, 'forward') });
  tools.push({ icon: 'arrow-down', label: 'Back', action: () => onReorderLayer(layer.id, 'backward') });

  // Flip (Look only — collage direct manipulation)
  if (isLook && layer.type === 'media') {
    tools.push({ icon: 'swap-horizontal', label: 'Flip', action: () => onEditLayer(layer) });
  }

  // Duplicate
  tools.push({ icon: 'copy-outline', label: 'Copy', action: () => onDuplicateLayer(layer.id) });

  // Delete (danger, separated)
  tools.push({ icon: 'trash-outline', label: 'Delete', action: () => onDeleteLayer(layer.id), danger: true });

  return tools;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  containerFloating: {
    borderTopWidth: 0,
    backgroundColor: 'transparent',
  },
  blurPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginHorizontal: Space.xs,
  },
  // Wraps the horizontal ScrollView so a right-edge fade can overlay it.
  scrollWrap: {
    flex: 1,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Subtle gradient fade on the right edge signalling horizontal overflow.
  fadeRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 28,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Space.xs,
  },
  // ── Expand/collapse toggle for secondary tools ──
  // 44pt hit target showing only a 20pt chevron — transparent by default
  // per the containment rule (ordinary controls default to transparent).
  expandToggle: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  // ── Secondary tools container ──
  // Wraps secondary tools with animated maxWidth + opacity for spring expand.
  secondaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  secondaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  // Subtle vertical separator between primary and secondary tool groups —
  // a short hairline (20pt tall) rather than a full-height divider line.
  groupDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    marginHorizontal: Space.xs,
  },
  // Long-press tooltip label — centered below the dock (legacy fallback).
  hoverLabel: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginLeft: 'auto',
    paddingLeft: Space.sm,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  publishBtn: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
});
