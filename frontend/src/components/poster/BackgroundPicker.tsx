import React from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BackgroundPickerProps {
  visible: boolean;
  currentColor: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
}

const GRADIENTS = [
  { label: 'Sunset', colors: ['#ff6b6b', '#feca57'] },
  { label: 'Ocean', colors: ['#48dbfb', '#1dd1a1'] },
  { label: 'Berry', colors: ['#5f27cd', '#ff9f43'] },
  { label: 'Midnight', colors: ['#1a1a2e', '#16213e'] },
  { label: 'Coral', colors: ['#ff9f43', '#ff6b6b'] },
  { label: 'Forest', colors: ['#10ac84', '#1dd1a1'] },
];

const SOLIDS = [
  '#1a1a2e', '#16213e', '#0f3460', '#e94560', '#ff6b6b',
  '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd', '#ff9f43',
  '#10ac84', '#00d2d3', '#54a0ff', '#341f97',
  '#222f3e', '#576574', '#8395a7', '#c8d6e5', '#dfe6e9',
  '#ffffff', '#000000',
];

export default function BackgroundPicker({ visible, currentColor, onSelect, onClose }: BackgroundPickerProps) {
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="auto">
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.panel}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Background</Text>

        {/* Solid colors */}
        <Text style={styles.sectionLabel}>Solid Colors</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
          <Pressable
            style={[styles.colorOrb, { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.3)' }]}
            onPress={() => onSelect(null)}
          >
            {!currentColor && <Ionicons name="checkmark" size={14} color="#fff" />}
            {currentColor && <Ionicons name="close" size={14} color="rgba(255,255,255,0.5)" />}
          </Pressable>
          {SOLIDS.map((color) => (
            <Pressable
              key={color}
              style={[
                styles.colorOrb,
                { backgroundColor: color },
                currentColor === color && styles.colorOrbActive,
              ]}
              onPress={() => onSelect(color)}
            >
              {currentColor === color && (
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={color === '#ffffff' || color === '#dfe6e9' || color === '#c8d6e5' ? '#000' : '#fff'}
                />
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Gradients (displayed as two-tone orbs for now) */}
        <Text style={styles.sectionLabel}>Gradients</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gradientRow}>
          {GRADIENTS.map((g) => (
            <Pressable
              key={g.label}
              style={[styles.gradientCard, { backgroundColor: g.colors[0] }]}
              onPress={() => onSelect(g.colors[0])}
            >
              <View style={[styles.gradientHalf, { backgroundColor: g.colors[1] }]} />
              <Text style={styles.gradientLabel}>{g.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(20,20,25,0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
    gap: 12,
  },
  handleRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 8,
    paddingTop: 4,
  },
  colorOrb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOrbActive: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  gradientRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 8,
    paddingTop: 4,
  },
  gradientCard: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  gradientHalf: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  gradientLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    zIndex: 2,
  },
});
