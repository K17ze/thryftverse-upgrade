/**
 * DraggableText — text layer with drag/pinch/rotate gestures.
 *
 * Extracted from TextOverlayCanvas.tsx and refactored to use the shared
 * DraggableLayer component for pan/pinch/rotation/tap/double-tap gestures.
 * Keeps text-specific rendering: AnimatedTextDisplay with enter/loop
 * animations, TextInput for inline editing, edit/delete selection buttons,
 * and text stroke effect.
 *
 * Key adaptations from the original inline component:
 *  - Pinch-to-resize maps DraggableLayer's scale to font size (scale resets
 *    to 1 after commit; font size absorbs the delta for visual continuity).
 *  - Double-tap triggers edit mode (via DraggableLayer.onDoubleTap).
 *  - Long-press also triggers edit mode (wrapped gesture for backward compat).
 *  - Text stroke rendered via stacked Text layers (stroke color at N offsets
 *    + fill color on top) when layer.strokeEnabled is true.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Radius, Stroke } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { AnimatedPressable } from '../../AnimatedPressable';
import { DraggableLayer } from '../shared/DraggableLayer';
import { isLightColor } from '../shared/colorUtils';
import {
  FONT_MAP,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_DEFAULT,
  type FontFamily,
} from './fontRegistry';
import type { TextAlignment, TextAnimation, TextLayer } from './types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DraggableTextProps {
  layer: TextLayer;
  isSelected: boolean;
  isEditing: boolean;
  isActive: boolean;
  canvasWidth: number;
  canvasHeight: number;
  shouldSpawn: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onPositionChange: (id: string, x: number, y: number) => void;
  onFontSizeChange: (id: string, fontSize: number) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onTextChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function DraggableText({
  layer,
  isSelected,
  isEditing,
  isActive,
  canvasWidth,
  canvasHeight,
  shouldSpawn,
  onSelect,
  onEdit,
  onPositionChange,
  onFontSizeChange,
  onRotationChange,
  onTextChange,
  onDelete,
}: DraggableTextProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring, isEnabled: motionEnabled } = useMotionConfig();
  const styles = useMemo(() => createTextStyles(colors), [colors]);
  const inputRef = React.useRef<TextInput>(null);

  // Track committed scale — always resets to 1 after pinch so font size
  // absorbs the visual delta.
  const [committedScale, setCommittedScale] = useState(1);

  // Display font size shared value for animated transitions
  const displayFontSize = useSharedValue(layer.fontSize);

  useEffect(() => {
    if (reducedMotion) {
      displayFontSize.value = layer.fontSize;
    } else {
      displayFontSize.value = withSpring(layer.fontSize, spring.tap);
    }
  }, [layer.fontSize, reducedMotion, spring, displayFontSize]);

  useEffect(() => {
    if (isEditing) {
      const timeout = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timeout);
    }
  }, [isEditing]);

  // ── Scale → font size mapping for pinch ──────────────────────────────
  const handleScaleChange = useCallback(
    (id: string, scale: number) => {
      const newFontSize = Math.min(
        Math.max(Math.round(layer.fontSize * scale), FONT_SIZE_MIN),
        FONT_SIZE_MAX
      );
      onFontSizeChange(id, newFontSize);
      // Reset committed scale so DraggableLayer's internal scale springs
      // back to 1 — the font size change compensates visually.
      setCommittedScale(1);
    },
    [layer.fontSize, onFontSizeChange]
  );

  // ── Long-press to edit (backward-compatible with original UX) ────────
  const hapticMedium = useCallback(() => haptic.medium(), [haptic]);
  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(isActive && !isEditing)
        .minDuration(400)
        .onStart(() => {
          runOnJS(hapticMedium)();
          runOnJS(onEdit)(layer.id);
        }),
    [isActive, isEditing, hapticMedium, onEdit, layer.id]
  );

  // ── Double-tap to edit (via DraggableLayer) ──────────────────────────
  const handleDoubleTap = useCallback(
    (id: string) => {
      onEdit(id);
    },
    [onEdit]
  );

  // ── Bubble style ─────────────────────────────────────────────────────
  const bubbleStyle: View['props']['style'] = [
    styles.textBubble,
    {
      left: 0,
      top: 0,
      backgroundColor: layer.backgroundColor,
      borderColor: isEditing
        ? colors.textPrimary
        : isSelected
          ? colors.borderSubtle
          : 'transparent',
      borderWidth: isEditing ? Stroke.emphasis : isSelected ? Stroke.standard : 0,
      borderStyle: isSelected && !isEditing ? 'dashed' : 'solid',
    },
  ];

  // ── Text content for DraggableLayer children ─────────────────────────
  const textContent = (
    <>
      <AnimatedTextDisplay
        layer={layer}
        displayFontSize={displayFontSize}
        reducedMotion={reducedMotion}
        motionEnabled={motionEnabled}
        spring={spring}
        styles={styles}
      />
      {isSelected && !isEditing && (
        <>
          <View style={styles.editLayerBtn} pointerEvents="none">
            <View style={styles.editLayerBtnInner}>
              <Ionicons name="create" size={12} color={colors.textInverse} />
            </View>
          </View>
          <AnimatedPressable
            style={styles.deleteLayerBtn}
            onPress={() => onDelete(layer.id)}
            scaleValue={0.88}
            activeOpacity={0.85}
            hapticFeedback="medium"
            hitSlop={11}
            accessibilityLabel="Delete text layer"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={14} color={colors.textInverse} />
          </AnimatedPressable>
        </>
      )}
    </>
  );

  // ── Editing mode: TextInput, no gestures ─────────────────────────────
  if (isEditing) {
    const editTransform = [
      { translateX: layer.x },
      { translateY: layer.y },
      { rotate: `${layer.rotation}deg` },
    ];
    return (
      <Reanimated.View style={[bubbleStyle, { transform: editTransform }]} pointerEvents="auto">
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
          onChangeText={(t) => onTextChange(layer.id, t)}
          maxLength={120}
          multiline
          autoFocus
          scrollEnabled={false}
        />
        <AnimatedPressable
          style={styles.deleteLayerBtn}
          onPress={() => onDelete(layer.id)}
          scaleValue={0.88}
          activeOpacity={0.85}
          hapticFeedback="medium"
          hitSlop={11}
          accessibilityLabel="Delete text layer"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={14} color={colors.textInverse} />
        </AnimatedPressable>
      </Reanimated.View>
    );
  }

  // ── Active mode: DraggableLayer with long-press wrapper ──────────────
  if (isActive) {
    return (
      <GestureDetector gesture={longPressGesture}>
        <DraggableLayer
          id={layer.id}
          x={layer.x}
          y={layer.y}
          scale={committedScale}
          rotation={layer.rotation}
          isActive={isActive}
          isSelected={isSelected}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          accentColor={colors.textPrimary}
          onPositionChange={onPositionChange}
          onScaleChange={handleScaleChange}
          onRotationChange={onRotationChange}
          onSelect={onSelect}
          onDeselect={() => {}}
          onDoubleTap={handleDoubleTap}
          shouldSpawn={shouldSpawn}
        >
          {textContent}
        </DraggableLayer>
      </GestureDetector>
    );
  }

  // ── View-only mode: DraggableLayer with isActive=false ───────────────
  return (
    <DraggableLayer
      id={layer.id}
      x={layer.x}
      y={layer.y}
      scale={1}
      rotation={layer.rotation}
      isActive={false}
      isSelected={false}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      accentColor={colors.textPrimary}
      onPositionChange={onPositionChange}
      onScaleChange={handleScaleChange}
      onRotationChange={onRotationChange}
      onSelect={onSelect}
      onDeselect={() => {}}
      shouldSpawn={false}
    >
      <AnimatedTextDisplay
        layer={layer}
        displayFontSize={displayFontSize}
        reducedMotion={reducedMotion}
        motionEnabled={motionEnabled}
        spring={spring}
        styles={styles}
      />
    </DraggableLayer>
  );
}

// ── AnimatedTextDisplay ─────────────────────────────────────────────────────

interface AnimatedTextDisplayProps {
  layer: TextLayer;
  displayFontSize: SharedValue<number>;
  reducedMotion: boolean;
  motionEnabled: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  styles: ReturnType<typeof createTextStyles>;
}

function AnimatedTextDisplay({
  layer,
  displayFontSize,
  reducedMotion,
  motionEnabled,
  spring,
  styles,
}: AnimatedTextDisplayProps) {
  const animation = layer.animation ?? 'none';
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const [visibleCount, setVisibleCount] = useState(layer.text.length);

  useEffect(() => {
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

  useEffect(() => {
    if (reducedMotion || !motionEnabled) {
      opacity.value = 1;
      translateY.value = 0;
      scale.value = 1;
      return;
    }

    opacity.value = 1;
    translateY.value = 0;
    scale.value = 1;

    if (animation === 'fade') {
      opacity.value = withRepeat(
        withSequence(
          withSpring(0, spring.entrance),
          withSpring(1, spring.entrance)
        ),
        -1,
        false
      );
    }

    if (animation === 'slide') {
      translateY.value = withRepeat(
        withSequence(
          withSpring(20, spring.entrance),
          withSpring(0, spring.entrance)
        ),
        -1,
        false
      );
    }

    if (animation === 'bounce') {
      translateY.value = withRepeat(
        withSequence(
          withSpring(-15, spring.success),
          withSpring(0, spring.success)
        ),
        -1,
        false
      );
    }

    if (animation === 'pop') {
      scale.value = withRepeat(
        withSequence(
          withSpring(0.8, spring.lift),
          withSpring(1.0, spring.lift)
        ),
        -1,
        false
      );
    }

    if (animation === 'slideDown') {
      translateY.value = withRepeat(
        withSequence(
          withSpring(-20, spring.entrance),
          withSpring(0, spring.entrance)
        ),
        -1,
        false
      );
    }
  }, [animation, reducedMotion, motionEnabled, opacity, translateY, scale, spring]);

  const animatedStyle = useAnimatedStyle(() => ({
    fontSize: displayFontSize.value,
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const textContent =
    animation === 'typewriter' && !reducedMotion
      ? layer.text.slice(0, visibleCount) || ' '
      : layer.text || ' ';

  const fontFamily = FONT_MAP[layer.fontFamily];
  const strokeEnabled = layer.strokeEnabled ?? false;
  const strokeWidth = layer.strokeWidth ?? 2;
  const strokeColor = layer.strokeColor ?? '#000000';

  // ── Stroke rendering: stacked Text layers at N offsets ─────────────
  // Renders the text in strokeColor at 8 directional offsets, then the
  // fill color on top. This creates a crisp outline effect.
  const strokeOffsets = useMemo(() => {
    const offsets: { left: number; top: number }[] = [];
    for (let angle = 0; angle < 360; angle += 45) {
      const rad = (angle * Math.PI) / 180;
      offsets.push({
        left: Math.cos(rad) * strokeWidth,
        top: Math.sin(rad) * strokeWidth,
      });
    }
    return offsets;
  }, [strokeWidth]);

  const baseTextStyle = {
    fontFamily,
    textAlign: layer.alignment as 'left' | 'center' | 'right',
  } as const;

  const shadowStyle = layer.shadow !== false ? styles.textShadow : undefined;

  if (strokeEnabled) {
    return (
      <View style={styles.strokeContainer}>
        {strokeOffsets.map((offset, i) => (
          <Reanimated.Text
            key={`stroke-${i}`}
            style={[
              styles.layerText,
              animatedStyle,
              baseTextStyle,
              { color: strokeColor, position: 'absolute', left: offset.left, top: offset.top },
            ]}
            pointerEvents="none"
          >
            {textContent}
          </Reanimated.Text>
        ))}
        <Reanimated.Text
          style={[
            styles.layerText,
            animatedStyle,
            baseTextStyle,
            { color: layer.color },
            shadowStyle,
          ]}
        >
          {textContent}
        </Reanimated.Text>
      </View>
    );
  }

  return (
    <Reanimated.Text
      style={[
        styles.layerText,
        animatedStyle,
        baseTextStyle,
        { color: layer.color },
        shadowStyle,
      ]}
    >
      {textContent}
    </Reanimated.Text>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

function createTextStyles(colors: ThemeColors) {
  return StyleSheet.create({
    textBubble: {
      position: 'absolute',
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: 320,
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
    strokeContainer: {
      position: 'relative',
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
    editLayerBtn: {
      position: 'absolute',
      top: -8,
      left: -8,
    },
    editLayerBtnInner: {
      width: 22,
      height: 22,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
