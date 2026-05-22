import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../../constants/typography';

export type CreativeTool = 'text' | 'stickers' | 'draw' | null;

interface CreativeToolbarProps {
  activeTool: CreativeTool;
  onToolSelect: (tool: CreativeTool) => void;
  visible: boolean;
}

const TOOLS: { key: CreativeTool; icon: string; label: string }[] = [
  { key: 'text', icon: 'text-outline', label: 'Text' },
  { key: 'stickers', icon: 'happy-outline', label: 'Stickers' },
  { key: 'draw', icon: 'pencil-outline', label: 'Draw' },
];

export default function CreativeToolbar({ activeTool, onToolSelect, visible }: CreativeToolbarProps) {
  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.toolbar}>
        {TOOLS.map((tool) => {
          const isActive = activeTool === tool.key;
          return (
            <Pressable
              key={tool.key}
              style={[styles.toolBtn, isActive && styles.toolBtnActive]}
              onPress={() => onToolSelect(isActive ? null : tool.key)}
              hitSlop={8}
            >
              <Ionicons
                name={tool.icon as any}
                size={20}
                color={isActive ? '#000' : 'rgba(255,255,255,0.9)'}
              />
              <Text style={[styles.toolLabel, isActive && styles.toolLabelActive]}>
                {tool.label}
              </Text>
            </Pressable>
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
    paddingBottom: 24,
    paddingHorizontal: 12,
    zIndex: 15,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
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
    paddingVertical: 4,
    borderRadius: 12,
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
