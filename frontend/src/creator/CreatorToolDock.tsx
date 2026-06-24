import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Colors } from '../constants/colors';
import { useCreator } from './CreatorContext';
import type { AssetPickerMode } from './CreatorAssetPicker';

export interface CreatorToolDockProps {
  onPublish: () => void;
  onSettings: () => void;
  onToolPress: (mode: AssetPickerMode) => void;
}

interface ToolDef {
  icon: string;
  label: string;
  color: string;
  mode: AssetPickerMode;
}

const LOOK_TOOLS: ToolDef[] = [
  { icon: 'images-outline', label: 'Photo', color: '#5ac8fa', mode: 'media' },
  { icon: 'pricetag-outline', label: 'Tag', color: '#ff9500', mode: 'product' },
  { icon: 'text-outline', label: 'Text', color: '#ffcc00', mode: 'text' },
  { icon: 'shirt-outline', label: 'Look', color: '#5856d6', mode: 'look' },
  { icon: 'at-outline', label: 'Mention', color: '#ff2d55', mode: 'mention' },
  { icon: 'happy-outline', label: 'Shape', color: '#4cd964', mode: 'shape' },
];

const POSTER_TOOLS: ToolDef[] = [
  { icon: 'images-outline', label: 'Media', color: '#5ac8fa', mode: 'media' },
  { icon: 'text-outline', label: 'Text', color: '#ffcc00', mode: 'text' },
  { icon: 'pricetag-outline', label: 'Product', color: '#ff9500', mode: 'product' },
  { icon: 'at-outline', label: 'Mention', color: '#ff2d55', mode: 'mention' },
  { icon: 'shirt-outline', label: 'Look', color: '#5856d6', mode: 'look' },
  { icon: 'stats-chart-outline', label: 'Vote', color: '#34c759', mode: 'vote' },
  { icon: 'happy-outline', label: 'Shape', color: '#4cd964', mode: 'shape' },
];

export function CreatorToolDock({ onPublish, onSettings, onToolPress }: CreatorToolDockProps) {
  const { document } = useCreator();
  const tools = document.type === 'poster' ? POSTER_TOOLS : LOOK_TOOLS;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tools.map((tool) => (
          <Pressable
            key={tool.label}
            onPress={() => onToolPress(tool.mode)}
            style={styles.toolBtn}
            accessibilityLabel={`Add ${tool.label}`}
            accessibilityRole="button"
          >
            <View style={[styles.toolIcon, { backgroundColor: `${tool.color}20` }]}>
              <Ionicons name={tool.icon as any} size={20} color={tool.color} />
            </View>
            <Text style={styles.toolLabel}>{tool.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          onPress={onSettings}
          style={styles.actionBtn}
          accessibilityLabel="Settings"
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={onPublish}
          style={styles.publishBtn}
          accessibilityLabel="Publish"
          accessibilityRole="button"
        >
          <Text style={styles.publishBtnText}>Publish</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: Space.sm,
  },
  scrollContent: {
    gap: Space.sm,
    alignItems: 'center',
  },
  toolBtn: {
    alignItems: 'center',
    gap: 4,
    minWidth: 52,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginLeft: 'auto',
  },
  actionBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  publishBtn: {
    paddingHorizontal: Space.md + 4,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
});
