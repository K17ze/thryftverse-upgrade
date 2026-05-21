import React from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Text,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');

export type TextAlignment = 'left' | 'center' | 'right';
export type FontFamily = 'bold' | 'classic' | 'modern' | 'typewriter';

export interface TextLayer {
  id: string;
  text: string;
  color: string;
  fontFamily: FontFamily;
  fontSize: number;
  x: number;
  y: number;
  backgroundColor?: string;
  alignment: TextAlignment;
  rotation: number;
}

interface TextOverlayCanvasProps {
  layers: TextLayer[];
  onLayersChange: (layers: TextLayer[]) => void;
  canvasSize: { width: number; height: number };
  isActive: boolean;
}

const FONT_MAP: Record<FontFamily, string> = {
  bold: 'Inter_700Bold',
  classic: 'Inter_600SemiBold',
  modern: 'Inter_500Medium',
  typewriter: 'Inter_400Regular',
};

const FONT_OPTIONS: { key: FontFamily; label: string }[] = [
  { key: 'bold', label: 'Strong' },
  { key: 'classic', label: 'Classic' },
  { key: 'modern', label: 'Modern' },
  { key: 'typewriter', label: 'Mono' },
];

const COLOR_OPTIONS = [
  '#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00',
  '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55',
  '#e2d5c2', '#ffd9b5', '#d6f5de', '#ffccda', '#c7c7cc',
];

const BG_OPTIONS = [
  undefined,
  'rgba(0,0,0,0.6)',
  'rgba(255,255,255,0.8)',
  '#ff3b30',
  '#007aff',
  '#4cd964',
  '#ff9500',
  '#5856d6',
  '#ff2d55',
];

export default function TextOverlayCanvas({ layers, onLayersChange, canvasSize, isActive }: TextOverlayCanvasProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showControls, setShowControls] = React.useState(true);
  const inputRef = React.useRef<TextInput>(null);
  const dragStartRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const layerStartRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeLayer = layers.find((l) => l.id === editingId);

  const updateLayer = (id: string, patch: Partial<TextLayer>) => {
    onLayersChange(
      layers.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  };

  const createPanResponder = (layerId: string) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const layer = layers.find((l) => l.id === layerId);
        if (layer) {
          dragStartRef.current = { x: 0, y: 0 };
          layerStartRef.current = { x: layer.x, y: layer.y };
          setEditingId(layerId);
        }
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const layer = layers.find((l) => l.id === layerId);
        if (!layer) return;
        const maxX = Math.max(0, canvasSize.width - 120);
        const maxY = Math.max(0, canvasSize.height - 48);
        const nextX = Math.min(Math.max(layerStartRef.current.x + gesture.dx, 0), maxX);
        const nextY = Math.min(Math.max(layerStartRef.current.y + gesture.dy, 0), maxY);
        updateLayer(layerId, { x: nextX, y: nextY });
      },
      onPanResponderRelease: () => {
        // done dragging
      },
    });
  };

  const addLayer = () => {
    const newLayer: TextLayer = {
      id: `text_${Date.now()}`,
      text: 'Tap to edit',
      color: '#ffffff',
      fontFamily: 'bold',
      fontSize: 24,
      x: Math.max(0, canvasSize.width / 2 - 80),
      y: Math.max(0, canvasSize.height / 2 - 20),
      alignment: 'center',
      rotation: 0,
    };
    onLayersChange([...layers, newLayer]);
    setEditingId(newLayer.id);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const removeLayer = (id: string) => {
    onLayersChange(layers.filter((l) => l.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const adjustFontSize = (delta: number) => {
    if (!activeLayer) return;
    updateLayer(activeLayer.id, {
      fontSize: Math.min(Math.max(activeLayer.fontSize + delta, 12), 72),
    });
  };

  if (!isActive) {
    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {layers.map((layer) => (
          <View
            key={layer.id}
            style={[
              styles.textBubble,
              {
                left: layer.x,
                top: layer.y,
                backgroundColor: layer.backgroundColor,
                transform: [{ rotate: `${layer.rotation}deg` }],
              },
            ]}
            pointerEvents="none"
          >
            <Text
              style={[
                styles.layerText,
                {
                  color: layer.color,
                  fontFamily: FONT_MAP[layer.fontFamily],
                  fontSize: layer.fontSize,
                  textAlign: layer.alignment,
                },
              ]}
            >
              {layer.text}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Rendered text layers */}
      {layers.map((layer) => {
        const pan = createPanResponder(layer.id);
        const isEditing = editingId === layer.id;
        return (
          <View
            key={layer.id}
            style={[
              styles.textBubble,
              {
                left: layer.x,
                top: layer.y,
                backgroundColor: layer.backgroundColor,
                borderColor: isEditing ? '#fff' : 'transparent',
                borderWidth: isEditing ? 1.5 : 0,
                transform: [{ rotate: `${layer.rotation}deg` }],
              },
            ]}
            pointerEvents="box-none"
          >
            <View {...pan.panHandlers} pointerEvents="auto" style={styles.dragArea}>
              {isEditing ? (
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.layerInput,
                    {
                      color: layer.color,
                      fontFamily: FONT_MAP[layer.fontFamily],
                      fontSize: layer.fontSize,
                      textAlign: layer.alignment,
                    },
                  ]}
                  value={layer.text}
                  onChangeText={(t) => updateLayer(layer.id, { text: t })}
                  maxLength={120}
                  multiline
                  autoFocus
                  scrollEnabled={false}
                />
              ) : (
                <Text
                  style={[
                    styles.layerText,
                    {
                      color: layer.color,
                      fontFamily: FONT_MAP[layer.fontFamily],
                      fontSize: layer.fontSize,
                      textAlign: layer.alignment,
                    },
                  ]}
                >
                  {layer.text || ' '}
                </Text>
              )}
            </View>

            {isEditing && (
              <Pressable
                style={styles.deleteLayerBtn}
                onPress={() => removeLayer(layer.id)}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={20} color="#ff3b30" />
              </Pressable>
            )}
          </View>
        );
      })}

      {/* Add text button */}
      {!editingId && (
        <Pressable style={styles.addTextBtn} onPress={addLayer} hitSlop={12}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addTextLabel}>Add Text</Text>
        </Pressable>
      )}

      {/* Controls panel */}
      {showControls && editingId && activeLayer && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.controlsWrap}
          pointerEvents="box-none"
        >
          <View style={styles.controlsPanel}>
            {/* Font family */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontRow}>
              {FONT_OPTIONS.map((f) => (
                <Pressable
                  key={f.key}
                  style={[
                    styles.fontPill,
                    activeLayer.fontFamily === f.key && styles.fontPillActive,
                  ]}
                  onPress={() => updateLayer(activeLayer.id, { fontFamily: f.key })}
                >
                  <Text
                    style={[
                      styles.fontPillText,
                      { fontFamily: FONT_MAP[f.key] },
                      activeLayer.fontFamily === f.key && styles.fontPillTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Size controls */}
            <View style={styles.sizeRow}>
              <Pressable style={styles.sizeBtn} onPress={() => adjustFontSize(-2)}>
                <Text style={styles.sizeBtnText}>A-</Text>
              </Pressable>
              <Text style={styles.sizeValue}>{activeLayer.fontSize}px</Text>
              <Pressable style={styles.sizeBtn} onPress={() => adjustFontSize(2)}>
                <Text style={styles.sizeBtnText}>A+</Text>
              </Pressable>
            </View>

            {/* Alignment */}
            <View style={styles.alignRow}>
              {(['left', 'center', 'right'] as TextAlignment[]).map((a) => (
                <Pressable
                  key={a}
                  style={[styles.alignBtn, activeLayer.alignment === a && styles.alignBtnActive]}
                  onPress={() => updateLayer(activeLayer.id, { alignment: a })}
                >
                  <Text style={{ fontSize: 16, color: activeLayer.alignment === a ? Colors.brand : Colors.textMuted, fontFamily: 'Inter_700Bold' }}>
                    {a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Text colors */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
              {COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorOrb,
                    { backgroundColor: c },
                    activeLayer.color === c && styles.colorOrbActive,
                  ]}
                  onPress={() => updateLayer(activeLayer.id, { color: c })}
                >
                  {activeLayer.color === c && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={c === '#ffffff' || c === '#c7c7cc' || c === '#e2d5c2' || c === '#ffd9b5' || c === '#d6f5de' || c === '#ffccda' ? '#000' : '#fff'}
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>

            {/* Background colors */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
              {BG_OPTIONS.map((c, i) => (
                <Pressable
                  key={i}
                  style={[
                    styles.bgOrb,
                    { backgroundColor: c || 'transparent', borderColor: c ? 'transparent' : Colors.border },
                    activeLayer.backgroundColor === c && styles.bgOrbActive,
                  ]}
                  onPress={() => updateLayer(activeLayer.id, { backgroundColor: c })}
                >
                  {!c && <Ionicons name="close" size={12} color={Colors.textMuted} />}
                </Pressable>
              ))}
            </ScrollView>

            {/* Done */}
            <Pressable style={styles.doneBtn} onPress={() => setEditingId(null)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  textBubble: {
    position: 'absolute',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: SCREEN_W - 40,
    alignItems: 'center',
  },
  dragArea: {
    minWidth: 40,
    minHeight: 24,
  },
  layerText: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  layerInput: {
    minWidth: 80,
    minHeight: 28,
    padding: 0,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  deleteLayerBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  addTextBtn: {
    position: 'absolute',
    top: 140,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addTextLabel: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  controlsWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  controlsPanel: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  fontRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
  },
  fontPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fontPillActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  fontPillText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  fontPillTextActive: {
    color: '#fff',
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  sizeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  sizeValue: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    minWidth: 48,
    textAlign: 'center',
  },
  alignRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  alignBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alignBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
  },
  colorOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOrbActive: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  bgOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgOrbActive: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  doneBtn: {
    alignSelf: 'center',
    backgroundColor: Colors.brand,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
});
