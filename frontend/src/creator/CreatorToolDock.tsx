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
}: CreatorToolDockProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const isLook = document.type === 'look';

  // Build contextual tools based on selection state
  const tools: RailTool[] = selectedLayer
    ? buildSelectionTools(selectedLayer, onEditLayer, onDeleteLayer, onDuplicateLayer, onReorderLayer)
    : buildDefaultTools(isLook, onToolPress);

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
        {tools.map((tool) => (
          <PressScale
            key={tool.label}
            onPress={tool.action}
            style={styles.toolBtn}
            accessibilityLabel={tool.label}
          >
            <Ionicons
              name={tool.icon as any}
              size={24}
              color={tool.danger ? dangerIconColor : iconColor}
            />
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
): RailTool[] {
  // 4 primary tools + secondary tools moved to More/overflow
  const tools: RailTool[] = [
    { icon: 'images-outline', label: 'Media', action: () => onToolPress('media') },
    { icon: 'text-outline', label: 'Text', action: () => onToolPress('text') },
    { icon: 'pricetag-outline', label: 'Product', action: () => onToolPress('product') },
    { icon: 'shapes-outline', label: 'Stickers', action: () => onToolPress('shape') },
  ];
  return tools;
}

function buildSelectionTools(
  layer: CreatorLayer,
  onEditLayer: (layer: CreatorLayer) => void,
  onDeleteLayer: (id: string) => void,
  onDuplicateLayer: (id: string) => void,
  onReorderLayer: (id: string, direction: 'forward' | 'backward') => void,
): RailTool[] {
  const tools: RailTool[] = [];

  // Type-specific primary action
  if (layer.type === 'text') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'media') {
    tools.push({ icon: 'swap-horizontal-outline', label: 'Replace', action: () => onEditLayer(layer) });
  } else if (layer.type === 'product') {
    tools.push({ icon: 'pricetag-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else if (layer.type === 'mention') {
    tools.push({ icon: 'person-outline', label: 'Edit', action: () => onEditLayer(layer) });
  } else {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer) });
  }

  // Layer ordering (audit: "Layer" in product context)
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
    minHeight: 52,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    gap: 4,
  },
  toolLabel: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
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
