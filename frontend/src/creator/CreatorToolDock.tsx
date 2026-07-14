import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { PressScale } from './CreatorAnimations';
import type { CreatorLayer } from './composition';
import type { AssetPickerMode } from './CreatorAssetPicker';

// ── Contextual tool definitions ────────────────────────────────────
// Neutral icons — no rainbow colors. A single accent (brand) marks
// the active/primary state. Every tool has a 44pt minimum hit area.

interface RailTool {
  icon: string;
  label: string;
  action: () => void;
  danger?: boolean;
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
}: CreatorToolDockProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const isLook = document.type === 'look';

  // Build contextual tools based on selection state and mode
  const tools: RailTool[] = selectedLayer
    ? buildSelectionTools(selectedLayer, isLook, onEditLayer, onDeleteLayer, onDuplicateLayer, onReorderLayer)
    : buildDefaultTools(isLook, onToolPress, onAddPage, onLayoutPresets);

  // When floating over canvas: transparent background, white icons
  // When solid (in a sheet): surface background, theme icons
  const iconColor = floating ? '#fff' : (selectedLayer ? colors.textSecondary : colors.textSecondary);
  const labelColor = floating ? 'rgba(255,255,255,0.7)' : colors.textMuted;
  const dangerIconColor = floating ? '#ff6b6b' : colors.danger;
  const dangerLabelColor = floating ? 'rgba(255,107,107,0.8)' : colors.danger;

  return (
    <View style={[styles.container, floating ? styles.containerFloating : { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tools.map((tool, i) => (
          <PressScale
            key={tool.label}
            onPress={tool.action}
            style={styles.toolBtn}
            accessibilityLabel={tool.label}
          >
            <View style={[
              styles.toolIconWrap,
              tool.danger && styles.toolIconWrapDanger,
            ]}>
              <Ionicons
                name={tool.icon as any}
                size={24}
                color={tool.danger ? dangerIconColor : iconColor}
              />
            </View>
            <Text
              style={[styles.toolLabel, { color: tool.danger ? dangerLabelColor : labelColor }]}
              numberOfLines={1}
            >
              {tool.label}
            </Text>
          </PressScale>
        ))}
      </ScrollView>

      {/* Primary action — separated from editing tools */}
      <View style={[styles.actions, { borderLeftColor: floating ? 'rgba(255,255,255,0.15)' : colors.border }]}>
        <PressScale
          onPress={onMore}
          style={styles.actionBtn}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={iconColor} />
        </PressScale>
        {!floating && (
          <PressScale
            onPress={onPublish}
            style={[styles.publishBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Next"
            scale={0.97}
          >
            <Text style={[styles.publishBtnText, { color: colors.textInverse }]}>Next</Text>
          </PressScale>
        )}
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
    // Per audit section 8: cutouts, product objects, layouts, alignment, masks
    return [
      { icon: 'images-outline', label: 'Media', action: () => onToolPress('media') },
      { icon: 'pricetag-outline', label: 'Product', action: () => onToolPress('product') },
      { icon: 'text-outline', label: 'Text', action: () => onToolPress('text') },
      ...(onLayoutPresets ? [{ icon: 'grid-outline' as const, label: 'Layout', action: onLayoutPresets }] : []),
    ];
  }
  // Poster: story-first, interactive stickers, temporal
  // Per audit section 8: duration, sound, text/sticker timing, polls, mentions
  return [
    { icon: 'images-outline', label: 'Media', action: () => onToolPress('media') },
    { icon: 'text-outline', label: 'Text', action: () => onToolPress('text') },
    { icon: 'stats-chart-outline', label: 'Poll', action: () => onToolPress('vote') },
    { icon: 'at-outline', label: 'Mention', action: () => onToolPress('mention') },
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
): RailTool[] {
  const tools: RailTool[] = [];

  // Type-specific primary action — different per mode
  if (layer.type === 'text') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'media') {
    if (isLook) {
      // Look media: crop + cutout (collage-specific)
      tools.push({ icon: 'crop-outline', label: 'Crop', action: () => onEditLayer(layer) });
      tools.push({ icon: 'cut-outline', label: 'Cutout', action: () => onEditLayer(layer) });
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
  scrollContent: {
    gap: Space.sm,
    alignItems: 'center',
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    minHeight: 56,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    gap: 5,
  },
  toolIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  toolIconWrapDanger: {
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
  toolLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
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
