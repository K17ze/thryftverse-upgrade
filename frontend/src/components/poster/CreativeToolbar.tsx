import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Radius, Space, Control } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export type CreativeTool = 'text' | 'stickers' | 'draw' | 'filter' | 'preview' | null;

interface CreativeToolbarProps {
  activeTool: CreativeTool;
  onToolSelect: (tool: CreativeTool) => void;
  visible: boolean;
}

const TOOLS: { key: CreativeTool; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { key: 'text', icon: 'text-outline', label: 'Text' },
  { key: 'stickers', icon: 'happy-outline', label: 'Stickers' },
  { key: 'draw', icon: 'pencil-outline', label: 'Draw' },
  { key: 'filter', icon: 'color-filter-outline', label: 'Filter' },
  { key: 'preview', icon: 'eye-outline', label: 'Preview' },
];

export default function CreativeToolbar({ activeTool, onToolSelect, visible }: CreativeToolbarProps) {
  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.toolbar}>
        {TOOLS.map((tool) => {
          const isActive = activeTool === tool.key;
          return (
            <AnimatedPressable
              key={tool.key}
              style={[styles.toolBtn, isActive && styles.toolBtnActive]}
              onPress={() => onToolSelect(isActive ? null : tool.key)}
              scaleValue={0.95}
              activeOpacity={0.85}
              hapticFeedback="selection"
              accessibilityLabel={`${tool.label} tool${isActive ? ', active' : ''}`}
              accessibilityHint={`Toggles the ${tool.label.toLowerCase()} creative tool`}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={tool.icon}
                size={20}
                color={isActive ? '#000' : 'rgba(255,255,255,0.9)'}
              />
              <Text style={[styles.toolLabel, isActive && styles.toolLabelActive]}>
                {tool.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Space.lg,
    paddingHorizontal: 12,
    zIndex: 15,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.xxl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 52,
    paddingHorizontal: 6,
    paddingVertical: Space.xs,
    borderRadius: Radius.lg,
  },
  toolBtnActive: {
    backgroundColor: '#fff',
  },
  toolLabel: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.75)',
  },
  toolLabelActive: {
    color: '#000',
    fontFamily: Typography.family.bold,
  },
});