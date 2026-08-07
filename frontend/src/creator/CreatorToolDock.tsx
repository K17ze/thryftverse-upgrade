import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { LiquidGlassBackdrop } from '../components/LiquidGlassBackdrop';
import type { CreatorLayer } from './composition';
import type { AssetPickerMode } from './CreatorAssetPicker';

// ── Contextual tool definitions ────────────────────────────────────
// Instagram-grade tool dock: grouped tools with visual hierarchy.
// Primary tools (Media, Text) get filled icon backgrounds.
// Secondary tools (stickers) get outline icons only.
// Groups are separated by subtle dividers, not flat scrolly bars.

interface RailTool {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  action: () => void;
  danger?: boolean;
  /** Primary tools get a filled icon background — visual weight */
  primary?: boolean;
}

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
  const isLook = (documentType ?? document.type) === 'look';
  const isPoster = (documentType ?? document.type) === 'poster';
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  const isSelectionMode = !!selectedLayer;

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

  const handleToolPress = useCallback((tool: RailTool) => {
    if (tool.danger) {
      haptic.medium();
    } else {
      haptic.selection();
    }
    tool.action();
  }, [haptic]);

  const handlePublish = useCallback(() => {
    haptic.medium();
    onPublish();
  }, [haptic, onPublish]);

  const handleMore = useCallback(() => {
    haptic.selection();
    onMore();
  }, [haptic, onMore]);

  // ── Mode-aware visual hierarchy ────────────────────────────────────
  // Instagram-style: primary tools are larger pill buttons with filled
  // backgrounds; secondary tools are smaller, transparent, label-less.
  // Selection mode collapses to a single compact tier.
  const primarySize = 48;
  const secondarySize = 44;
  const toolSize = isSelectionMode
    ? 44
    : (tool: RailTool) => (tool.primary ? primarySize : secondarySize);
  const toolRadius = Radius.full;
  const primaryIconSize = 24;
  const secondaryIconSize = 22;
  const toolGap = isSelectionMode ? Space.xs : Space.sm;

  // Floating (glass) dock keeps its own translucent palette.
  const labelColor = floating ? 'rgba(255,255,255,0.7)' : colors.textMuted;
  const dangerIconColor = floating ? '#E06666' : colors.danger;
  const dangerLabelColor = floating ? 'rgba(224,102,102,0.85)' : colors.danger;

  const getToolBg = (tool: RailTool): string => {
    if (floating) {
      if (tool.danger) return 'transparent';
      // Active (primary) tools get a filled white tint; secondary tools stay transparent.
      return tool.primary ? 'rgba(255,255,255,0.18)' : 'transparent';
    }
    if (tool.danger) return 'transparent';
    if (isSelectionMode) return colors.surface;
    return tool.primary ? colors.brand : colors.surfaceAlt;
  };

  const getToolIconColor = (tool: RailTool): string => {
    if (tool.danger) return dangerIconColor;
    if (floating) {
      // Primary (active) tools render solid white; secondary tools render at 85%.
      return tool.primary ? '#fff' : 'rgba(255,255,255,0.85)';
    }
    if (isSelectionMode) return colors.textPrimary;
    return tool.primary ? colors.textInverse : colors.textPrimary;
  };

  const getToolIconSize = (tool: RailTool): number => {
    if (isSelectionMode) return 22;
    return tool.primary ? primaryIconSize : secondaryIconSize;
  };

  // Render a single tool button — shared by both dock variants.
  const renderTool = (tool: RailTool) => {
    const size = typeof toolSize === 'function' ? toolSize(tool) : toolSize;
    // Only primary tools show a caption label (Instagram pattern); secondary
    // tools are icon-only to keep the dock minimal and contextual.
    const showLabel = tool.primary || isSelectionMode;
    return (
      <PressScale
        key={tool.label}
        onPress={() => handleToolPress(tool)}
        onLongPress={() => setHoveredTool(tool.label)}
        onPressOut={() => setHoveredTool(null)}
        style={styles.toolBtn}
        accessibilityLabel={tool.label}
        hitSlop={8}
      >
        <View
          style={[
            styles.toolIconWrap,
            {
              width: size,
              height: size,
              borderRadius: toolRadius,
              backgroundColor: getToolBg(tool),
            },
          ]}
        >
          <Ionicons
            name={tool.icon}
            size={getToolIconSize(tool)}
            color={getToolIconColor(tool)}
          />
        </View>
        {showLabel ? (
          <Text
            style={[
              styles.toolLabel,
              { color: tool.danger ? dangerLabelColor : labelColor },
              tool.primary && styles.toolLabelPrimary,
            ]}
            numberOfLines={1}
          >
            {tool.label}
          </Text>
        ) : null}
      </PressScale>
    );
  };

  // Render the tool list with an optional divider between primary/secondary.
  const renderToolList = () => {
    if (!hasDivider) {
      return tools.map(renderTool);
    }
    return [
      ...primaryTools.map(renderTool),
      <View key="__divider" style={[styles.groupDivider, { backgroundColor: colors.border }]} />,
      ...secondaryTools.map(renderTool),
    ];
  };

  return (
    <View
      style={[
        styles.container,
        floating
          ? styles.containerFloating
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingTop: Space.sm,
              paddingBottom: Math.max(insets.bottom, Space.sm),
            },
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
              borderColor: 'rgba(255,255,255,0.15)',
              shadowColor: '#000',
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
      <View style={[styles.actions, { borderLeftColor: floating ? 'rgba(255,255,255,0.15)' : colors.border }]}>
        <PressScale
          onPress={handleMore}
          style={styles.actionBtn}
          accessibilityLabel="More options"
          hitSlop={12}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={floating ? '#fff' : colors.textSecondary} />
        </PressScale>
        {/* Publish button — always visible, floating or solid */}
        <PressScale
          onPress={handlePublish}
          style={[styles.publishBtn, { backgroundColor: colors.brand }]}
          accessibilityLabel="Next"
          scale={0.97}
          hitSlop={16}
        >
          <Text style={[styles.publishBtnText, { color: colors.textInverse }]}>Next</Text>
        </PressScale>
      </View>

      {/* Long-press tooltip label — centered below the dock */}
      {hoveredTool ? (
        <Text style={[styles.hoverLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {hoveredTool}
        </Text>
      ) : null}
    </View>
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
    // Look: collage-first, product-tagging, editorial layouts.
    // Primary tools (Media, Text) lead with brand fill; secondary tools follow.
    return [
      { icon: 'images', label: 'Media', action: () => onToolPress('media'), primary: true },
      { icon: 'text', label: 'Text', action: () => onToolPress('text'), primary: true },
      { icon: 'pricetag-outline', label: 'Product', action: () => onToolPress('product') },
      { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw') },
      { icon: 'image-outline', label: 'GIF', action: () => onToolPress('gif') },
      { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music') },
      { icon: 'shapes-outline', label: 'Elements', action: () => onToolPress('shape') },
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
      // Look media: crop + cutout (collage-specific)
      // Use dedicated crop/cutout handlers when available; fall back to edit
      tools.push({
        icon: 'crop-outline',
        label: 'Crop',
        action: () => (onCropLayer ? onCropLayer(layer) : onEditLayer(layer)),
      });
      tools.push({
        icon: 'cut-outline',
        label: 'Cutout',
        action: () => (onCutoutLayer ? onCutoutLayer(layer) : onEditLayer(layer)),
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
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    minHeight: 56,
    paddingHorizontal: Space.xs + 2,
    borderRadius: Radius.full,
    gap: 4,
  },
  toolIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Thin vertical divider between primary and secondary tool groups.
  groupDivider: {
    width: 1,
    height: 24,
    marginHorizontal: Space.xs,
  },
  toolLabel: {
    fontSize: 9,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
    marginTop: 2,
    color: 'rgba(255,255,255,0.7)',
  },
  toolLabelPrimary: {
    fontFamily: Typography.family.semibold,
    fontSize: 9.5,
  },
  // Long-press tooltip label — centered below the dock.
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
