import React from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Pressable,
  Text,
  ScrollView,
} from 'react-native';
// Dynamically require `react-native-svg` at runtime so bundler doesn't fail
// when the package is intentionally missing during development. When the
// library is unavailable we render a harmless fallback so the app can run.
import { Ionicons } from '@expo/vector-icons';
import { Typography, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

export type BrushType = 'marker' | 'highlighter' | 'neon' | 'eraser';

export interface BrushStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  brushType?: BrushType;
}

interface DrawingCanvasProps {
  strokes: BrushStroke[];
  onStrokesChange: (strokes: BrushStroke[]) => void;
  canvasSize: { width: number; height: number };
  isActive: boolean;
  onClose: () => void;
}

const BRUSH_WIDTHS = [3, 6, 10, 16];

const BRUSH_TYPE_OPTIONS: { key: BrushType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'marker', label: 'Marker', icon: 'brush-outline' },
  { key: 'highlighter', label: 'Highlight', icon: 'color-fill-outline' },
  { key: 'neon', label: 'Neon', icon: 'bulb-outline' },
  { key: 'eraser', label: 'Eraser', icon: 'backspace-outline' },
];

const PASTEL_BRUSH = ['#e2d5c2', '#d4b896', '#b8d4c0', '#d4b8c0'];

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

function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

export default function DrawingCanvas({ strokes, onStrokesChange, canvasSize, isActive, onClose }: DrawingCanvasProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const [currentStroke, setCurrentStroke] = React.useState<BrushStroke | null>(null);
  const [brushColor, setBrushColor] = React.useState(colors.danger);
  const [brushWidth, setBrushWidth] = React.useState(6);
  const [brushType, setBrushType] = React.useState<BrushType>('marker');
  const [redoStack, setRedoStack] = React.useState<BrushStroke[]>([]);

  const BRUSH_COLORS = React.useMemo(
    () => [
      colors.textPrimary, colors.textInverse, colors.danger, colors.bronze, colors.antiqueGold,
      colors.success, colors.commerceTrust, colors.social, colors.discovery, colors.coownDown,
      ...PASTEL_BRUSH, colors.textMuted,
    ],
    [colors]
  );

  const handleBrushColor = (c: string) => {
    setBrushColor(c);
    haptic.selection();
  };

  const handleBrushWidth = (w: number) => {
    setBrushWidth(w);
    haptic.selection();
  };

  const handleBrushType = (t: BrushType) => {
    setBrushType(t);
    haptic.selection();
  };

  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isActive,
        onMoveShouldSetPanResponder: () => isActive,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          if (!isActive) return;
          const { locationX, locationY } = evt.nativeEvent;
          const newStroke: BrushStroke = {
            id: `stroke_${Date.now()}`,
            points: [{ x: locationX, y: locationY }],
            color: brushColor,
            width: brushWidth,
            brushType,
          };
          setCurrentStroke(newStroke);
          haptic.light();
        },
        onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          if (!isActive || !currentStroke) return;
          const { locationX, locationY } = evt.nativeEvent;
          const last = currentStroke.points[currentStroke.points.length - 1];
          const dx = locationX - last.x;
          const dy = locationY - last.y;
          if (dx * dx + dy * dy > 4) {
            setCurrentStroke({
              ...currentStroke,
              points: [...currentStroke.points, { x: locationX, y: locationY }],
            });
          }
        },
        onPanResponderRelease: () => {
          if (!currentStroke) return;
          onStrokesChange([...strokes, currentStroke]);
          setCurrentStroke(null);
          setRedoStack([]);
        },
        onPanResponderTerminate: () => {
          if (!currentStroke) return;
          onStrokesChange([...strokes, currentStroke]);
          setCurrentStroke(null);
          setRedoStack([]);
        },
      }),
    [isActive, currentStroke, brushColor, brushWidth, brushType, strokes, onStrokesChange, haptic]
  );

  const undo = () => {
    if (strokes.length === 0) return;
    const removed = strokes[strokes.length - 1];
    onStrokesChange(strokes.slice(0, -1));
    setRedoStack((prev) => [...prev, removed]);
    haptic.light();
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    onStrokesChange([...strokes, restored]);
    setRedoStack((prev) => prev.slice(0, -1));
    haptic.light();
  };

  const clearAll = () => {
    onStrokesChange([]);
    setRedoStack([]);
  };

  const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  // Attempt to load react-native-svg dynamically. Metro bundler only resolves
  // static imports, so this prevents a hard bundling failure if the package
  // isn't installed yet. If not available, render an empty surface fallback.
  let renderSvg: React.ReactNode = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RNsvg = require('react-native-svg');
    const SvgComp = RNsvg && (RNsvg.default || RNsvg.Svg || RNsvg);
    const PathComp = RNsvg && RNsvg.Path;
    const DefsComp = RNsvg && RNsvg.Defs;
    const MaskComp = RNsvg && RNsvg.Mask;
    const RectComp = RNsvg && RNsvg.Rect;
    const GComp = RNsvg && RNsvg.G;

    if (SvgComp && PathComp) {
      const hasEraser = allStrokes.some((s) => s.brushType === 'eraser');
      const renderStrokePath = (stroke: BrushStroke, keyPrefix: string) => {
        const type = stroke.brushType ?? 'marker';
        if (type === 'eraser') return null;
        const pathProps = {
          d: pointsToSvgPath(stroke.points),
          stroke: stroke.color,
          strokeWidth: stroke.width,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
          fill: 'none' as const,
        };
        if (type === 'highlighter') {
          return <PathComp key={`${keyPrefix}_${stroke.id}`} {...pathProps} strokeOpacity={0.4} />;
        }
        if (type === 'neon') {
          return (
            <GComp key={`${keyPrefix}_${stroke.id}`}>
              <PathComp {...pathProps} strokeWidth={stroke.width * 2.6} strokeOpacity={0.3} />
              <PathComp {...pathProps} />
            </GComp>
          );
        }
        return <PathComp key={`${keyPrefix}_${stroke.id}`} {...pathProps} />;
      };

      if (hasEraser && DefsComp && MaskComp && RectComp && GComp) {
        renderSvg = (
          <SvgComp width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
            <DefsComp>
              <MaskComp id="eraserMask">
                <RectComp width={canvasSize.width} height={canvasSize.height} fill="black" />
                {allStrokes.map((stroke) => (
                  <PathComp
                    key={`mask_${stroke.id}`}
                    d={pointsToSvgPath(stroke.points)}
                    stroke={(stroke.brushType ?? 'marker') === 'eraser' ? 'black' : 'white'}
                    strokeWidth={stroke.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </MaskComp>
            </DefsComp>
            <GComp mask="url(#eraserMask)">
              {allStrokes.map((stroke) => renderStrokePath(stroke, 'main'))}
            </GComp>
          </SvgComp>
        );
      } else {
        renderSvg = (
          <SvgComp width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
            {allStrokes.map((stroke) => renderStrokePath(stroke, 'main'))}
          </SvgComp>
        );
      }
    }
  } catch (e) {
    renderSvg = null;
  }

  // If SVG rendering isn't available, provide a non-crashing placeholder.
  if (!renderSvg) {
    renderSvg = <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
  }

  if (!isActive) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {renderSvg}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Drawing surface */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} pointerEvents="auto" />

      {/* Rendered strokes */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {renderSvg}
      </View>

      {/* Top bar for drawing */}
      <View style={styles.drawTopBar} pointerEvents="box-none">
        <Pressable style={styles.drawIconBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close drawing" accessibilityRole="button">
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.drawActions}>
          <Pressable
            style={styles.drawIconBtn}
            onPress={undo}
            disabled={strokes.length === 0}
            hitSlop={8}
            accessibilityLabel="Undo stroke"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-undo-outline" size={20} color={strokes.length === 0 ? colors.textMuted : colors.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.drawIconBtn}
            onPress={redo}
            disabled={redoStack.length === 0}
            hitSlop={8}
            accessibilityLabel="Redo stroke"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-redo-outline" size={20} color={redoStack.length === 0 ? colors.textMuted : colors.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.drawIconBtn}
            onPress={clearAll}
            disabled={strokes.length === 0}
            hitSlop={8}
            accessibilityLabel="Clear all strokes"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={20} color={strokes.length === 0 ? colors.textMuted : colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={styles.drawControls} pointerEvents="box-none">
        {/* Brush types */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brushTypeRow}>
          {BRUSH_TYPE_OPTIONS.map((b) => (
            <Pressable
              key={b.key}
              style={[styles.brushTypePill, brushType === b.key && styles.brushTypePillActive]}
              onPress={() => handleBrushType(b.key)}
              hitSlop={4}
              accessibilityLabel={`${b.label} brush`}
              accessibilityRole="button"
              accessibilityState={{ selected: brushType === b.key }}
            >
              <Ionicons
                name={b.icon}
                size={16}
                color={brushType === b.key ? colors.textPrimary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.brushTypeText,
                  brushType === b.key && styles.brushTypeTextActive,
                ]}
              >
                {b.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Brush size preview + widths */}
        <View style={styles.widthRow}>
          <View style={styles.sizePreview} pointerEvents="none">
            <View
              style={[
                styles.sizePreviewDot,
                {
                  width: brushWidth,
                  height: brushWidth,
                  borderRadius: brushWidth / 2,
                  backgroundColor: brushType === 'eraser' ? 'transparent' : brushColor,
                  borderColor: brushType === 'eraser' ? colors.textPrimary : 'transparent',
                  borderWidth: brushType === 'eraser' ? 1 : 0,
                  opacity: brushType === 'highlighter' ? 0.4 : 1,
                  ...(brushType === 'neon'
                    ? {
                        shadowColor: brushColor,
                        shadowOpacity: 0.8,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 0 },
                      }
                    : null),
                },
              ]}
            />
          </View>
          {BRUSH_WIDTHS.map((w) => (
            <Pressable
              key={w}
              style={[styles.widthBtn, brushWidth === w && styles.widthBtnActive]}
              onPress={() => handleBrushWidth(w)}
              hitSlop={4}
              accessibilityLabel={`Brush size ${w}`}
              accessibilityRole="button"
              accessibilityState={{ selected: brushWidth === w }}
            >
              <View
                style={{
                  width: w,
                  height: w,
                  borderRadius: w / 2,
                  backgroundColor: brushColor,
                }}
              />
            </Pressable>
          ))}
        </View>

        {/* Colors */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drawColorRow}>
          {BRUSH_COLORS.map((c) => (
            <Pressable
              key={c}
              style={[
                styles.drawColorOrb,
                { backgroundColor: c },
                brushColor === c && styles.drawColorOrbActive,
              ]}
              onPress={() => handleBrushColor(c)}
              hitSlop={4}
              accessibilityLabel={`Brush color ${c}`}
              accessibilityRole="button"
              accessibilityState={{ selected: brushColor === c }}
            >
              {brushColor === c && (
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={isLightColor(c) ? '#000' : '#fff'}
                />
              )}
            </Pressable>
          ))}
        </ScrollView>

        <Pressable style={styles.doneDrawBtn} onPress={onClose} accessibilityLabel="Done drawing" accessibilityRole="button">
          <Text style={styles.doneDrawText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
  drawTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    zIndex: 20,
  },
  drawIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawActions: {
    flexDirection: 'row',
    gap: 8,
  },
  drawControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 12,
    gap: 12,
    backgroundColor: colors.overlay,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    zIndex: 20,
  },
  brushTypeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 2,
  },
  brushTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: colors.glassBg,
  },
  brushTypePillActive: {
    backgroundColor: colors.surfaceAlt,
  },
  brushTypeText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
  brushTypeTextActive: {
    color: colors.textPrimary,
  },
  widthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  sizePreview: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.glassBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  sizePreviewDot: {},
  widthBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.glassBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widthBtnActive: {
    backgroundColor: colors.surfaceAlt,
  },
  drawColorRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
    paddingTop: 4,
  },
  drawColorOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawColorOrbActive: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  doneDrawBtn: {
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.lg,
    paddingHorizontal: 32,
    paddingVertical: 10,
  },
  doneDrawText: {
    color: colors.textInverse,
    fontSize: 14,
    fontFamily: Typography.family.bold,
  },
});
}