import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type CreativeTool =
  | 'text'
  | 'layout'
  | 'background'
  | 'stickers'
  | 'draw'
  | null;

interface CreativeToolbarProps {
  activeTool: CreativeTool;
  onToolSelect: (tool: CreativeTool) => void;
  visible: boolean;
}

const TOOLS: { key: CreativeTool; icon: string; label: string }[] = [
  { key: 'text', icon: 'text-outline', label: 'Aa' },
  { key: 'layout', icon: 'grid-outline', label: 'Layout' },
  { key: 'background', icon: 'ellipse-outline', label: 'BG' },
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
              <Text
                style={[
                  styles.toolLabel,
                  isActive && styles.toolLabelActive,
                ]}
              >
                {tool.label === 'Aa' ? 'Aa' : undefined}
              </Text>
              {tool.label !== 'Aa' && (
                <Ionicons
                  name={tool.icon as any}
                  size={22}
                  color={isActive ? '#fff' : 'rgba(255,255,255,0.85)'}
                />
              )}
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
    left: 12,
    top: 110,
    bottom: 200,
    justifyContent: 'center',
    zIndex: 10,
  },
  toolbar: {
    gap: 14,
    alignItems: 'center',
  },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: {
    backgroundColor: '#fff',
  },
  toolLabel: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.85)',
    includeFontPadding: false,
  },
  toolLabelActive: {
    color: '#000',
  },

});
