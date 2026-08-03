import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import type { CreatorLayer } from './composition';
import type { AssetPickerMode } from './CreatorAssetPicker';

// ── Contextual tool definitions ────────────────────────────────────
// Instagram-grade tool dock: grouped tools with visual hierarchy.
// Primary tools (Media, Text) get filled icon backgrounds.
// Secondary tools (stickers) get outline icons only.
// Groups are separated by subtle dividers, not flat scrolly bars.

interface RailTool {
  icon: string;
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
}: CreatorToolDockProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const isLook = document.type === 'look';

  // Build contextual tools based on selection state and mode
  const tools: RailTool[] = selectedLayer
    ? buildSelectionTools(selectedLayer, isLook, onEditLayer, onDeleteLayer, onDuplicateLayer, onReorderLayer, onCropLayer, onCutoutLayer)
    : buildDefaultTools(isLook, onToolPress, onAddPage, onLayoutPresets);

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

  // When floating over canvas: blurred glass dock (Instagram pattern)
  // When solid (in a sheet): surface background, theme icons
  const iconColor = floating ? '#fff' : colors.textSecondary;
  const labelColor = floating ? 'rgba(255,255,255,0.75)' : colors.textMuted;
  const dangerIconColor = floating ? '#E06666' : colors.danger;
  const dangerLabelColor = floating ? 'rgba(224,102,102,0.85)' : colors.danger;
  const primaryIconColor = floating ? '#fff' : colors.textInverse;
  const primaryIconBg = floating ? 'rgba(255,255,255,0.18)' : colors.brand;
  const secondaryIconBg = floating ? 'rgba(255,255,255,0.08)' : 'transparent';

  return (
    <View style={[styles.container, floating ? styles.containerFloating : { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {floating ? (
        <BlurView intensity={60} tint="dark" style={styles.blurPill}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {tools.map((tool, i) => (
              <PressScale
                key={tool.label}
                onPress={() => handleToolPress(tool)}
                style={styles.toolBtn}
                accessibilityLabel={tool.label}
                hitSlop={8}
              >
                <View style={[
                  styles.toolIconWrap,
                  { backgroundColor: tool.primary ? primaryIconBg : (tool.danger ? 'transparent' : secondaryIconBg) },
                  tool.danger && styles.toolIconWrapDanger,
                ]}>
                  <Ionicons
                    name={tool.icon as any}
                    size={tool.primary ? 22 : 20}
                    color={tool.danger ? dangerIconColor : (tool.primary ? primaryIconColor : iconColor)}
                  />
                </View>
                <Text
                  style={[styles.toolLabel, { color: tool.danger ? dangerLabelColor : labelColor }, tool.primary && styles.toolLabelPrimary]}
                  numberOfLines={1}
                >
                  {tool.label}
                </Text>
              </PressScale>
            ))}
          </ScrollView>
        </BlurView>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {tools.map((tool, i) => (
            <PressScale
              key={tool.label}
              onPress={() => handleToolPress(tool)}
              style={styles.toolBtn}
              accessibilityLabel={tool.label}
              hitSlop={8}
            >
              <View style={[
                styles.toolIconWrap,
                { backgroundColor: tool.primary ? primaryIconBg : (tool.danger ? 'transparent' : secondaryIconBg) },
                tool.danger && styles.toolIconWrapDanger,
              ]}>
                <Ionicons
                  name={tool.icon as any}
                  size={tool.primary ? 22 : 20}
                  color={tool.danger ? dangerIconColor : (tool.primary ? primaryIconColor : iconColor)}
                />
              </View>
              <Text
                style={[styles.toolLabel, { color: tool.danger ? dangerLabelColor : labelColor }, tool.primary && styles.toolLabelPrimary]}
                numberOfLines={1}
              >
                {tool.label}
              </Text>
            </PressScale>
          ))}
        </ScrollView>
      )}

      {/* Primary action — separated from editing tools */}
      <View style={[styles.actions, { borderLeftColor: floating ? 'rgba(255,255,255,0.15)' : colors.border }]}>
        <PressScale
          onPress={handleMore}
          style={styles.actionBtn}
          accessibilityLabel="More options"
          hitSlop={12}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={iconColor} />
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
  onToolPress: (mode: AssetPickerMode) => void,
  onAddPage?: () => void,
  onLayoutPresets?: () => void,
): RailTool[] {
  if (isLook) {
    // Look: collage-first, product-tagging, editorial layouts
    return [
      { icon: 'images', label: 'Media', action: () => onToolPress('media'), primary: true },
      { icon: 'pricetag-outline', label: 'Product', action: () => onToolPress('product') },
      { icon: 'text', label: 'Text', action: () => onToolPress('text'), primary: true },
      { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw') },
      { icon: 'image-outline', label: 'GIF', action: () => onToolPress('gif') },
      { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music') },
      { icon: 'shapes-outline', label: 'Elements', action: () => onToolPress('shape') },
      ...(onLayoutPresets ? [{ icon: 'grid-outline' as const, label: 'Layout', action: onLayoutPresets }] : []),
    ];
  }
  // Poster: story-first, unified sticker tray (Instagram pattern)
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
    paddingVertical: Space.xs,
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
  scrollContent: {
    gap: Space.xs,
    alignItems: 'center',
    paddingHorizontal: Space.xs,
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    minHeight: 56,
    paddingHorizontal: Space.xs + 2,
    borderRadius: Radius.md,
    gap: 4,
  },
  toolIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconWrapDanger: {
    // No fill — danger is communicated via icon color, not background
  },
  toolLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
  toolLabelPrimary: {
    fontFamily: Typography.family.semibold,
    fontSize: 10.5,
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
