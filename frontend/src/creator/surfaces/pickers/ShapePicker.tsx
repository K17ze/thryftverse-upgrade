import React, {
  useState,
  useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Radius,
  IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles, SHAPE_COLORS } from './pickerShared';

// ── Shape Picker ───────────────────────────────────────────────────

const SHAPES: Array<{ shape: 'circle' | 'square' | 'line' | 'arrow' | 'star' | 'heart'; icon: string; label: string }> = [
  { shape: 'circle', icon: 'ellipse-outline', label: 'Circle' },
  { shape: 'square', icon: 'square-outline', label: 'Square' },
  { shape: 'line', icon: 'remove', label: 'Line' },
  { shape: 'arrow', icon: 'arrow-up', label: 'Arrow' },
  { shape: 'star', icon: 'star', label: 'Star' },
  { shape: 'heart', icon: 'heart', label: 'Heart' },
];


export const ShapePicker = React.memo(function ShapePicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [activeColor, setActiveColor] = useState(SHAPE_COLORS[0]);
  const handleSelect = useCallback((shape: typeof SHAPES[0]) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('shape'), 5),
      type: 'decorative',
      width: 0.15,
      height: 0.15,
      payload: { shape: shape.shape, color: activeColor, opacity: 1 } });
    onClose();
  }, [onAddLayer, onClose, activeColor, haptic]);

  const renderShapePreview = (shape: string) => {
    switch (shape) {
      case 'circle':
        return <View style={{ width: 32, height: 32, borderRadius: Radius.full, backgroundColor: activeColor }} />;
      case 'square':
        return <View style={{ width: 32, height: 32, borderRadius: Radius.sm, backgroundColor: activeColor }} />;
      case 'line':
        return <View style={{ width: 32, height: 4, backgroundColor: activeColor }} />;
      case 'arrow':
        return (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: activeColor }} />
          </View>
        );
      case 'star':
        return <Ionicons name="star" size={IconGrammar.hero} color={activeColor} aria-hidden={true} />;
      case 'heart':
        return <Ionicons name="heart" size={IconGrammar.hero} color={activeColor} aria-hidden={true} />;
      default:
        return null;
    }
  };

  return (
    <PickerShell title="Add Shape" onClose={onClose} compact>
      <View style={styles.shapeGrid}>
        {SHAPES.map((s) => (
          <Pressable
            key={s.shape}
            onPress={() => handleSelect(s)}
            style={({ pressed }) => [styles.shapeOption, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
            accessibilityLabel={`Add ${s.label}`}
            accessibilityHint="Adds this shape to the canvas"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.shapePreviewBox}>
              {renderShapePreview(s.shape)}
            </View>
            <Text style={styles.shapeLabel}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.pickerSectionLabel}>Color</Text>
      <View style={styles.colorRow}>
        {SHAPE_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => { haptic.selection(); setActiveColor(c); }}
            style={[styles.colorOption, { backgroundColor: c }, activeColor === c && styles.colorOptionActive]}
            accessibilityLabel={`Shape color ${c}`}
            accessibilityHint="Sets the shape color"
            accessibilityRole="button"
            accessibilityState={{ selected: activeColor === c }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          />
        ))}
      </View>
    </PickerShell>
  );
});
