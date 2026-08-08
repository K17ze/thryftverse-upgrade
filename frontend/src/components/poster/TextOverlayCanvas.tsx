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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Stroke, Typography } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';

const { width: SCREEN_W } = Dimensions.get('window');

export type TextAlignment = 'left' | 'center' | 'right';
export type FontFamily = 'bold' | 'classic' | 'modern' | 'typewriter';
export type TextAnimation = 'none' | 'fade' | 'slide' | 'typewriter';

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
  animation?: TextAnimation;
  shadow?: boolean;
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

const ANIMATION_OPTIONS: { key: TextAnimation; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'none', label: 'None', icon: 'remove-outline' },
  { key: 'fade', label: 'Fade', icon: 'eye-outline' },
  { key: 'slide', label: 'Slide', icon: 'arrow-up-outline' },
  { key: 'typewriter', label: 'Type', icon: 'create-outline' },
];

const PASTEL_OPTIONS = ['#e2d5c2', '#d4b896', '#b8d4c0', '#d4b8c0'];

function isLightColor(hex: string): boolean {
  if (!hex || hex.startsWith('rgba')) return false;
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

export default function TextOverlayCanvas({ layers, onLayersChange, canvasSize, isActive }: TextOverlayCanvasProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const inputRef = React.useRef<TextInput>(null);
  const dragLayerIdRef = React.useRef<string | null>(null);
  const layerStartRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = React.useRef<number>(0);

  const activeLayer = layers.find((l) => l.id === editingId);

  const COLOR_OPTIONS = React.useMemo(
    () => [
      colors.textPrimary, colors.textInverse, colors.danger, colors.bronze, colors.antiqueGold,
      colors.success, colors.commerceTrust, colors.social, colors.discovery, colors.coownDown,
      ...PASTEL_OPTIONS, colors.textMuted,
    ],
    [colors]
  );

  const BG_OPTIONS = React.useMemo<(string | undefined)[]>(
    () => [
      undefined,
      'rgba(0,0,0,0.6)',
      'rgba(255,255,255,0.8)',
      colors.danger,
      colors.commerceTrust,
      colors.success,
      colors.bronze,
      colors.social,
      colors.discovery,
    ],
    [colors]
  );

  const updateLayer = (id: string, patch: Partial<TextLayer>) => {
    onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const findLayerAtPoint = (px: number, py: number): string | null => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const w = Math.min(l.text.length * l.fontSize * 0.6 + 24, SCREEN_W - 40);
      const h = l.fontSize + 24;
      if (px >= l.x && px <= l.x + w && py >= l.y && py <= l.y + h) {
        return l.id;
      }
    }
    return null;
  };

  const handleTapLayer = (layerId: string) => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 350;
    lastTapRef.current = now;

    if (isDoubleTap) {
      setEditingId(layerId);
      setSelectedId(layerId);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSelectedId(layerId);
    }
  };

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          return Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2;
        },
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const { pageX, pageY } = evt.nativeEvent;
          const hitLayerId = findLayerAtPoint(pageX, pageY);

          if (hitLayerId) {
            dragLayerIdRef.current = hitLayerId;
            const layer = layers.find((l) => l.id === hitLayerId);
            if (layer) {
              layerStartRef.current = { x: layer.x, y: layer.y };
              setSelectedId(hitLayerId);
            }
          } else {
            dragLayerIdRef.current = null;
            setSelectedId(null);
            setEditingId(null);
          }
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const layerId = dragLayerIdRef.current;
          if (!layerId) return;

          const maxX = Math.max(0, canvasSize.width - 80);
          const maxY = Math.max(0, canvasSize.height - 40);
          const nextX = Math.min(Math.max(layerStartRef.current.x + gesture.dx, 0), maxX);
          const nextY = Math.min(Math.max(layerStartRef.current.y + gesture.dy, 0), maxY);
          updateLayer(layerId, { x: nextX, y: nextY });
        },
        onPanResponderRelease: (_evt: GestureResponderEvent) => {
          const layerId = dragLayerIdRef.current;
          if (layerId) {
            handleTapLayer(layerId);
          }
          dragLayerIdRef.current = null;
        },
        onPanResponderTerminate: () => {
          dragLayerIdRef.current = null;
        },
      }),
    [layers, canvasSize.width, canvasSize.height]
  );

  const addLayer = () => {
    const newLayer: TextLayer = {
      id: `text_${Date.now()}`,
      text: 'Tap twice to edit',
      color: colors.textPrimary,
      fontFamily: 'bold',
      fontSize: 24,
      x: Math.max(0, canvasSize.width / 2 - 80),
      y: Math.max(0, canvasSize.height / 2 - 20),
      alignment: 'center',
      rotation: 0,
      animation: 'none',
      shadow: true,
    };
    onLayersChange([...layers, newLayer]);
    setSelectedId(newLayer.id);
    haptic.light();
  };

  const removeLayer = (id: string) => {
    onLayersChange(layers.filter((l) => l.id !== id));
    if (editingId === id) setEditingId(null);
    if (selectedId === id) setSelectedId(null);
  };

  const adjustFontSize = (delta: number) => {
    if (!activeLayer) return;
    updateLayer(activeLayer.id, {
      fontSize: Math.min(Math.max(activeLayer.fontSize + delta, 12), 72),
    });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Touch capture surface for dragging */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} pointerEvents="auto" />

      {/* Rendered text layers */}
      {layers.map((layer) => {
        const isEditing = editingId === layer.id;
        const isSelected = selectedId === layer.id;
        return (
          <View
            key={layer.id}
            style={[
              styles.textBubble,
              {
                left: layer.x,
                top: layer.y,
                backgroundColor: layer.backgroundColor,
                borderColor: isEditing ? colors.textPrimary : isSelected ? colors.borderSubtle : 'transparent',
                borderWidth: isEditing ? Stroke.emphasis : isSelected ? Stroke.standard : 0,
                borderStyle: isSelected && !isEditing ? 'dashed' : 'solid',
                transform: [{ rotate: `${layer.rotation}deg` }],
              },
            ]}
            pointerEvents="none"
          >
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
                  layer.shadow !== false && styles.textShadow,
                ]}
                value={layer.text}
                onChangeText={(t) => updateLayer(layer.id, { text: t })}
                maxLength={120}
                multiline
                autoFocus
                scrollEnabled={false}
              />
            ) : (
              <AnimatedTextDisplay
                layer={layer}
                reducedMotion={reducedMotion || !isEnabled}
                colors={colors}
                styles={styles}
              />
            )}

            {(isSelected || isEditing) && (
              <Pressable
                style={styles.deleteLayerBtn}
                onPress={() => removeLayer(layer.id)}
                hitSlop={8}
                accessibilityLabel="Delete text layer"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={14} color={colors.textInverse} />
              </Pressable>
            )}
          </View>
        );
      })}

      {/* Add text button (only when text tool active) */}
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

      {/* Controls panel (only when text tool active + editing) */}
      {isActive && editingId && activeLayer && (
        <KeyboardStickyView
          style={styles.controlsWrap}
          pointerEvents="box-none"
        >
          <View style={styles.controlsPanel}>
            {/* Font family — horizontal scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontRow}>
              {FONT_OPTIONS.map((f) => (
                <AnimatedPressable
                  key={f.key}
                  style={[styles.fontPill, activeLayer.fontFamily === f.key && styles.fontPillActive]}
                  onPress={() => updateLayer(activeLayer.id, { fontFamily: f.key })}
                  scaleValue={0.94}
                  activeOpacity={0.8}
                  hapticFeedback="selection"
                  accessibilityLabel={`${f.label} font`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeLayer.fontFamily === f.key }}
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
                </AnimatedPressable>
              ))}
            </ScrollView>

            {/* Text colors — row of color dots */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
              {COLOR_OPTIONS.map((c) => (
                <AnimatedPressable
                  key={c}
                  style={[styles.colorOrb, { backgroundColor: c }, activeLayer.color === c && styles.colorOrbActive]}
                  onPress={() => updateLayer(activeLayer.id, { color: c })}
                  scaleValue={0.88}
                  activeOpacity={0.7}
                  hapticFeedback="selection"
                  accessibilityLabel={`Text color ${c}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeLayer.color === c }}
                >
                  {activeLayer.color === c && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={isLightColor(c) ? '#000' : '#fff'}
                    />
                  )}
                </AnimatedPressable>
              ))}
            </ScrollView>

            {/* Background colors — row of bg dots */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
              {BG_OPTIONS.map((c, i) => (
                <AnimatedPressable
                  key={i}
                  style={[
                    styles.bgOrb,
                    { backgroundColor: c || 'transparent', borderColor: c ? 'transparent' : colors.borderSubtle },
                    activeLayer.backgroundColor === c && styles.bgOrbActive,
                  ]}
                  onPress={() => updateLayer(activeLayer.id, { backgroundColor: c })}
                  scaleValue={0.88}
                  activeOpacity={0.7}
                  hapticFeedback="selection"
                  accessibilityLabel={c ? `Background color ${c}` : 'No background'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeLayer.backgroundColor === c }}
                >
                  {!c && <Ionicons name="close" size={12} color={colors.textSecondary} />}
                </AnimatedPressable>
              ))}
            </ScrollView>

            {/* Animation effects — row of animation pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontRow}>
              {ANIMATION_OPTIONS.map((a) => (
                <AnimatedPressable
                  key={a.key}
                  style={[styles.fontPill, (activeLayer.animation ?? 'none') === a.key && styles.fontPillActive]}
                  onPress={() => {
                    updateLayer(activeLayer.id, { animation: a.key });
                    haptic.selection();
                  }}
                  scaleValue={0.94}
                  activeOpacity={0.8}
                  hapticFeedback="selection"
                  accessibilityLabel={`${a.label} animation`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: (activeLayer.animation ?? 'none') === a.key }}
                >
                  <Ionicons
                    name={a.icon}
                    size={14}
                    color={(activeLayer.animation ?? 'none') === a.key ? colors.textPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.fontPillText,
                      (activeLayer.animation ?? 'none') === a.key && styles.fontPillTextActive,
                    ]}
                  >
                    {a.label}
                  </Text>
                </AnimatedPressable>
              ))}
            </ScrollView>

            {/* Shadow toggle */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Text Shadow</Text>
              <AnimatedPressable
                style={[styles.toggleBtn, (activeLayer.shadow ?? true) && styles.toggleBtnActive]}
                onPress={() => {
                  updateLayer(activeLayer.id, { shadow: !(activeLayer.shadow ?? true) });
                  haptic.selection();
                }}
                scaleValue={0.92}
                activeOpacity={0.8}
                hapticFeedback="selection"
                accessibilityLabel="Toggle text shadow"
                accessibilityRole="switch"
                accessibilityState={{ checked: activeLayer.shadow ?? true }}
              >
                <Ionicons
                  name={(activeLayer.shadow ?? true) ? 'checkmark' : 'close'}
                  size={16}
                  color={(activeLayer.shadow ?? true) ? colors.textPrimary : colors.textSecondary}
                />
              </AnimatedPressable>
            </View>

            {/* Size + Alignment — combined row */}
            <View style={styles.toolRow}>
              {/* Alignment controls */}
              <View style={styles.alignGroup}>
                {(['left', 'center', 'right'] as TextAlignment[]).map((a) => (
                  <AnimatedPressable
                    key={a}
                    style={[styles.alignBtn, activeLayer.alignment === a && styles.alignBtnActive]}
                    onPress={() => updateLayer(activeLayer.id, { alignment: a })}
                    scaleValue={0.9}
                    activeOpacity={0.7}
                    hapticFeedback="selection"
                    accessibilityLabel={`Align ${a}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeLayer.alignment === a }}
                  >
                    <Text
                      style={[
                        styles.alignBtnText,
                        activeLayer.alignment === a && styles.alignBtnTextActive,
                      ]}
                    >
                      {a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>

              {/* Divider */}
              <View style={styles.toolDivider} />

              {/* Size controls */}
              <View style={styles.sizeGroup}>
                <AnimatedPressable
                  style={styles.sizeBtn}
                  onPress={() => adjustFontSize(-2)}
                  scaleValue={0.9}
                  activeOpacity={0.7}
                  hapticFeedback="light"
                  accessibilityLabel="Decrease font size"
                  accessibilityRole="button"
                >
                  <Text style={styles.sizeBtnTextSmall}>A</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.sizeBtn}
                  onPress={() => adjustFontSize(2)}
                  scaleValue={0.9}
                  activeOpacity={0.7}
                  hapticFeedback="light"
                  accessibilityLabel="Increase font size"
                  accessibilityRole="button"
                >
                  <Text style={styles.sizeBtnTextLarge}>A</Text>
                </AnimatedPressable>
              </View>
            </View>

            {/* Done — primary action */}
            <AnimatedPressable
              style={styles.doneBtn}
              onPress={() => setEditingId(null)}
              scaleValue={0.96}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel="Done editing text"
              accessibilityRole="button"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </AnimatedPressable>
          </View>
        </KeyboardStickyView>
      )}
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
  textBubble: {
    position: 'absolute',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: SCREEN_W - 40,
    alignItems: 'center',
  },
  textShadow: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  layerText: {},
  layerInput: {
    minWidth: 80,
    minHeight: 28,
    padding: 0,
  },
  deleteLayerBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  controlsWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  controlsPanel: {
    backgroundColor: colors.overlay,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glassBorder,
  },
  fontRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 2,
  },
  fontPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: colors.glassBg,
  },
  fontPillActive: {
    backgroundColor: colors.surfaceAlt,
  },
  fontPillText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  fontPillTextActive: {
    color: colors.textPrimary,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 2,
    paddingTop: 2,
  },
  colorOrb: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOrbActive: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ scale: 1.08 }],
  },
  bgOrb: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgOrbActive: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ scale: 1.08 }],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  toggleLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: colors.glassBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.surfaceAlt,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 2,
  },
  alignGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  alignBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: colors.glassBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alignBtnActive: {
    backgroundColor: colors.surfaceAlt,
  },
  alignBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontFamily: Typography.family.bold,
  },
  alignBtnTextActive: {
    color: colors.textPrimary,
  },
  toolDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderSubtle,
  },
  sizeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  sizeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: colors.glassBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtnTextSmall: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  sizeBtnTextLarge: {
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: Typography.family.bold,
  },
  doneBtn: {
    alignSelf: 'center',
    backgroundColor: colors.brand,
    borderRadius: Radius.full,
    paddingHorizontal: 40,
    paddingVertical: 12,
    marginTop: 2,
  },
  doneBtnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontFamily: Typography.family.bold,
  },
});
}

interface AnimatedTextDisplayProps {
  layer: TextLayer;
  reducedMotion: boolean;
  colors: any;
  styles: ReturnType<typeof createStyles>;
}

function AnimatedTextDisplay({ layer, reducedMotion, colors, styles }: AnimatedTextDisplayProps) {
  const animation = layer.animation ?? 'none';
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const [visibleCount, setVisibleCount] = React.useState(layer.text.length);

  React.useEffect(() => {
    if (animation !== 'typewriter' || reducedMotion) {
      setVisibleCount(layer.text.length);
      return;
    }
    setVisibleCount(0);
    let i = 0;
    const full = layer.text;
    const interval = setInterval(() => {
      i += 1;
      setVisibleCount(i);
      if (i >= full.length) {
        clearInterval(interval);
        setTimeout(() => {
          i = 0;
          setVisibleCount(0);
        }, 1400);
      }
    }, 90);
    return () => clearInterval(interval);
  }, [animation, layer.text, reducedMotion]);

  React.useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    if (animation === 'fade') {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: Motion.duration.slow }),
          withTiming(1, { duration: Motion.duration.slow })
        ),
        -1,
        false
      );
    } else {
      opacity.value = 1;
    }
    if (animation === 'slide') {
      translateY.value = withRepeat(
        withSequence(
          withTiming(20, { duration: Motion.duration.slow }),
          withTiming(0, { duration: Motion.duration.slow })
        ),
        -1,
        false
      );
    } else {
      translateY.value = 0;
    }
  }, [animation, reducedMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const textContent =
    animation === 'typewriter' && !reducedMotion ? layer.text.slice(0, visibleCount) || ' ' : layer.text || ' ';

  return (
    <Reanimated.View style={animatedStyle}>
      <Text
        style={[
          styles.layerText,
          {
            color: layer.color,
            fontFamily: FONT_MAP[layer.fontFamily],
            fontSize: layer.fontSize,
            textAlign: layer.alignment,
          },
          layer.shadow !== false && styles.textShadow,
        ]}
      >
        {textContent}
      </Text>
    </Reanimated.View>
  );
}