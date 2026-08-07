import React from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface BackgroundPickerProps {
  visible: boolean;
  currentColor: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
}

const GRADIENTS = [
  { label: 'Bronze', colors: ['#8A6A3F', '#C9A46A'] },
  { label: 'Ocean', colors: ['#06489A', '#4A7AC4'] },
  { label: 'Berry', colors: ['#6B3245', '#9A6B7A'] },
  { label: 'Midnight', colors: ['#1a1a2e', '#16213e'] },
  { label: 'Coral', colors: ['#7B0E1E', '#9A6B7A'] },
  { label: 'Forest', colors: ['#1C5631', '#215634'] },
];

const SOLIDS = [
  '#1a1a2e', '#16213e', '#0f3460', '#7B0E1E', '#9A6B7A',
  '#C9A46A', '#06489A', '#215634', '#6B3245', '#8A6A3F',
  '#1C5631', '#0A0A0A', '#4A7AC4', '#5F1616',
  '#222f3e', '#576574', '#8395a7', '#c8d6e5', '#dfe6e9',
  '#ffffff', '#000000',
];

export default function BackgroundPicker({ visible, currentColor, onSelect, onClose }: BackgroundPickerProps) {
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <AnimatedPressable
        style={styles.backdrop}
        onPress={onClose}
        activeOpacity={1}
        hapticFeedback="light"
        accessibilityLabel="Close background picker"
        accessibilityRole="button"
      />

      <View style={styles.panel}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Background</Text>

        {/* Solid colors */}
        <Text style={styles.sectionLabel}>Solid Colors</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.colorRow}
          accessibilityRole="list"
          accessibilityLabel="Solid background colors"
        >
          <AnimatedPressable
            style={[styles.colorOrb, { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.3)' }]}
            onPress={() => onSelect(null)}
            scaleValue={0.9}
            activeOpacity={0.85}
            hapticFeedback="selection"
            accessibilityLabel="No background color"
            accessibilityHint="Clears the background color"
            accessibilityRole="button"
            accessibilityState={{ selected: !currentColor }}
          >
            {!currentColor && <Ionicons name="checkmark" size={14} color="#fff" />}
            {currentColor && <Ionicons name="close" size={14} color="rgba(255,255,255,0.5)" />}
          </AnimatedPressable>
          {SOLIDS.map((color) => (
            <AnimatedPressable
              key={color}
              style={[
                styles.colorOrb,
                { backgroundColor: color },
                currentColor === color && styles.colorOrbActive,
              ]}
              onPress={() => onSelect(color)}
              scaleValue={0.9}
              activeOpacity={0.85}
              hapticFeedback="selection"
              accessibilityLabel={`Background color ${color}`}
              accessibilityHint={`Sets the background to ${color}`}
              accessibilityRole="button"
              accessibilityState={{ selected: currentColor === color }}
            >
              {currentColor === color && (
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={color === '#ffffff' || color === '#dfe6e9' || color === '#c8d6e5' ? '#000' : '#fff'}
                />
              )}
            </AnimatedPressable>
          ))}
        </ScrollView>

        {/* Gradients (displayed as two-tone orbs for now) */}
        <Text style={styles.sectionLabel}>Gradients</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gradientRow}
          accessibilityRole="list"
          accessibilityLabel="Gradient backgrounds"
        >
          {GRADIENTS.map((g) => (
            <AnimatedPressable
              key={g.label}
              style={[styles.gradientCard, { backgroundColor: g.colors[0] }]}
              onPress={() => onSelect(g.colors[0])}
              scaleValue={0.94}
              activeOpacity={0.85}
              hapticFeedback="selection"
              accessibilityLabel={`${g.label} gradient`}
              accessibilityHint={`Applies the ${g.label.toLowerCase()} gradient background`}
              accessibilityRole="button"
            >
              <View style={[styles.gradientHalf, { backgroundColor: g.colors[1] }]} />
              <Text style={styles.gradientLabel}>{g.label}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
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
    fontFamily: Typography.family.bold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
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
    fontFamily: Typography.family.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    zIndex: 2,
  },
});