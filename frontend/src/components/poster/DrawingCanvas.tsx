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
import { Typography } from '../../constants/typography';

export interface BrushStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface DrawingCanvasProps {
  strokes: BrushStroke[];
  onStrokesChange: (strokes: BrushStroke[]) => void;
  canvasSize: { width: number; height: number };
  isActive: boolean;
  onClose: () => void;
}

const BRUSH_COLORS = [
  '#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00',
  '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55',
  '#e2d5c2', '#ffd9b5', '#d6f5de', '#ffccda', '#c7c7cc',
];

const BRUSH_WIDTHS = [3, 6, 10, 16];

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
  const [currentStroke, setCurrentStroke] = React.useState<BrushStroke | null>(null);
  const [brushColor, setBrushColor] = React.useState('#ff3b30');
  const [brushWidth, setBrushWidth] = React.useState(6);

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
          };
          setCurrentStroke(newStroke);
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
        },
        onPanResponderTerminate: () => {
          if (!currentStroke) return;
          onStrokesChange([...strokes, currentStroke]);
          setCurrentStroke(null);
        },
      }),
    [isActive, currentStroke, brushColor, brushWidth, strokes, onStrokesChange]
  );

  const undo = () => {
    onStrokesChange(strokes.slice(0, -1));
  };

  const clearAll = () => {
    onStrokesChange([]);
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

    if (SvgComp && PathComp) {
      renderSvg = (
        <SvgComp width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFillObject}>
          {allStrokes.map((stroke) => (
            <PathComp
              key={stroke.id}
              d={pointsToSvgPath(stroke.points)}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </SvgComp>
      );
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
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {renderSvg}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Drawing surface */}
      <View style={StyleSheet.absoluteFillObject} {...panResponder.panHandlers} pointerEvents="auto" />

      {/* Rendered strokes */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {renderSvg}
      </View>

      {/* Top bar for drawing */}
      <View style={styles.drawTopBar} pointerEvents="box-none">
        <Pressable style={styles.drawIconBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.drawActions}>
          <Pressable style={styles.drawIconBtn} onPress={undo} disabled={strokes.length === 0}>
            <Ionicons name="arrow-undo-outline" size={20} color={strokes.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </Pressable>
          <Pressable style={styles.drawIconBtn} onPress={clearAll} disabled={strokes.length === 0}>
            <Ionicons name="trash-outline" size={20} color={strokes.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </Pressable>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={styles.drawControls} pointerEvents="box-none">
        {/* Brush widths */}
        <View style={styles.widthRow}>
          {BRUSH_WIDTHS.map((w) => (
            <Pressable
              key={w}
              style={[styles.widthBtn, brushWidth === w && styles.widthBtnActive]}
              onPress={() => setBrushWidth(w)}
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
              onPress={() => setBrushColor(c)}
            >
              {brushColor === c && (
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={c === '#ffffff' || c === '#c7c7cc' || c === '#e2d5c2' || c === '#ffd9b5' || c === '#d6f5de' || c === '#ffccda' ? '#000' : '#fff'}
                />
              )}
            </Pressable>
          ))}
        </ScrollView>

        <Pressable style={styles.doneDrawBtn} onPress={onClose}>
          <Text style={styles.doneDrawText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 20,
  },
  widthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  widthBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  widthBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
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
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawColorOrbActive: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  doneDrawBtn: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 10,
  },
  doneDrawText: {
    color: '#000',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
});
