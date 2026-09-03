/**
 * TextOverlayCanvas — orchestrates text layers on the poster canvas.
 *
 * Refactored to use extracted, shared components:
 *  - DraggableText (./text/DraggableText) — gesture-driven text layer with
 *    stroke support, long-press/double-tap to edit.
 *  - FontColorPicker (./text/FontColorPicker) — 17-font picker with
 *    categories, HSL sliders, and eyedropper.
 *  - TextEditSheet (./text/TextEditSheet) — bottom editing panel (bg color,
 *    animation, outline, shadow, alignment, font size, done).
 *  - fontRegistry (./text/fontRegistry) — FONT_MAP, FONT_OPTIONS, size/stroke
 *    constants.
 *  - types (./text/types) — TextLayer with stroke properties, TextAlignment,
 *    TextAnimation.
 *  - colorUtils (./shared/colorUtils) — isLightColor and HSL helpers.
 *
 * Re-exports TextLayer, TextAlignment, TextAnimation, and FontFamily for
 * backward compatibility with any external consumers.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import { useHaptic } from '../../hooks/useHaptic';

// ── Extracted shared modules ────────────────────────────────────────────────
import { DraggableText } from './text/DraggableText';
import { TextEditSheet } from './text/TextEditSheet';
import {
  FONT_SIZE_DEFAULT,
  STROKE_WIDTH_DEFAULT,
  type FontFamily,
} from './text/fontRegistry';
import type {
  TextAlignment,
  TextAnimation,
  TextLayer,
} from './text/types';

// ── Re-exports for backward compatibility ───────────────────────────────────
export type { TextAlignment, TextAnimation, TextLayer, FontFamily };

// ── Props ───────────────────────────────────────────────────────────────────

interface TextOverlayCanvasProps {
  layers: TextLayer[];
  onLayersChange: (layers: TextLayer[]) => void;
  canvasSize: { width: number; height: number };
  isActive: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TextOverlayCanvas({ layers, onLayersChange, canvasSize, isActive }: TextOverlayCanvasProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const knownIdsRef = React.useRef<Set<string>>(new Set());
  const mountedRef = React.useRef(false);

  const isFirstRender = !mountedRef.current;
  const spawnSet = useMemo(() => {
    const set = new Set<string>();
    if (isFirstRender) return set;
    for (const l of layers) {
      if (!knownIdsRef.current.has(l.id)) set.add(l.id);
    }
    return set;
  }, [layers, isFirstRender]);

  useEffect(() => {
    layers.forEach((l) => knownIdsRef.current.add(l.id));
    mountedRef.current = true;
  }, [layers]);

  const activeLayer = layers.find((l) => l.id === editingId);

  const updateLayer = useCallback(
    (id: string, patch: Partial<TextLayer>) => {
      onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [layers, onLayersChange]
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      AccessibilityInfo.announceForAccessibility('Text layer selected');
    },
    []
  );

  const handleEdit = useCallback(
    (id: string) => {
      setEditingId(id);
      setSelectedId(id);
    },
    []
  );

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
    setEditingId(null);
  }, []);

  const handlePositionChange = useCallback(
    (id: string, x: number, y: number) => {
      updateLayer(id, { x, y });
    },
    [updateLayer]
  );

  const handleFontSizeChange = useCallback(
    (id: string, fontSize: number) => {
      updateLayer(id, { fontSize });
    },
    [updateLayer]
  );

  const handleRotationChange = useCallback(
    (id: string, rotation: number) => {
      updateLayer(id, { rotation });
    },
    [updateLayer]
  );

  const handleTextChange = useCallback(
    (id: string, text: string) => {
      updateLayer(id, { text });
    },
    [updateLayer]
  );

  const handleDelete = useCallback(
    (id: string) => {
      onLayersChange(layers.filter((l) => l.id !== id));
      if (editingId === id) setEditingId(null);
      if (selectedId === id) setSelectedId(null);
      haptic.medium();
      AccessibilityInfo.announceForAccessibility('Text layer deleted');
    },
    [layers, onLayersChange, editingId, selectedId, haptic]
  );

  const addLayer = () => {
    const newLayer: TextLayer = {
      id: `text_${Date.now()}`,
      text: 'Long-press to edit',
      color: colors.textPrimary,
      fontFamily: 'bold',
      fontSize: FONT_SIZE_DEFAULT,
      x: Math.max(0, canvasSize.width / 2 - 80),
      y: Math.max(0, canvasSize.height / 2 - 20),
      alignment: 'center',
      rotation: 0,
      animation: 'none',
      shadow: true,
      strokeEnabled: false,
      strokeWidth: STROKE_WIDTH_DEFAULT,
      strokeColor: '#000000',
    };
    onLayersChange([...layers, newLayer]);
    setSelectedId(newLayer.id);
    haptic.light();
  };

  const backgroundTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(isActive)
        .onEnd(() => {
          runOnJS(handleDeselect)();
        }),
    [isActive, handleDeselect]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {isActive && (
        <GestureDetector gesture={backgroundTap}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      )}

      {layers.map((layer) => (
        <DraggableText
          key={layer.id}
          layer={layer}
          isSelected={selectedId === layer.id}
          isEditing={editingId === layer.id}
          isActive={isActive}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          shouldSpawn={spawnSet.has(layer.id)}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onPositionChange={handlePositionChange}
          onFontSizeChange={handleFontSizeChange}
          onRotationChange={handleRotationChange}
          onTextChange={handleTextChange}
          onDelete={handleDelete}
        />
      ))}

      {isActive && (
        <AnimatedPressable
          style={styles.addTextBtn}
          onPress={addLayer}
          scaleValue={0.94}
          activeOpacity={0.8}
          hapticFeedback="light"
          hitSlop={12}
          accessibilityLabel="Add text layer"
          accessibilityHint="Adds a new text overlay to the poster"
        >
          <Ionicons name="add" size={18} color={colors.textPrimary} />
          <Text style={styles.addTextLabel}>Add Text</Text>
        </AnimatedPressable>
      )}

      {isActive && editingId && activeLayer && (
        <KeyboardStickyView
          style={styles.controlsWrap}
          pointerEvents="box-none"
        >
          <TextEditSheet
            layer={activeLayer}
            allLayers={layers}
            canvasSize={canvasSize}
            onUpdateLayer={updateLayer}
            onDone={() => setEditingId(null)}
          />
        </KeyboardStickyView>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

function createStyles(colors: any) {
  return StyleSheet.create({
    addTextBtn: {
      position: 'absolute',
      top: 140,
      left: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.overlay,
      borderRadius: Radius.full,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    addTextLabel: {
      color: colors.textPrimary,
      fontSize: TypographyV2.captionElevated.size,
      fontFamily: Typography.family.semibold,
    },
    controlsWrap: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
  });
}
