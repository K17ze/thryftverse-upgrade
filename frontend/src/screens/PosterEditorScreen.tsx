import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl, AppSegmentOption } from '../components/ui/AppSegmentControl';

type Props = StackScreenProps<RootStackParamList, 'PosterEditor'>;
type StoryPosition = 'top' | 'center' | 'bottom';
const IS_LIGHT = ActiveTheme === 'light';

type LayerOffset = {
  x: number;
  y: number;
};

const MIN_LAYER_WIDTH = 120;
const MIN_LAYER_HEIGHT = 38;
const HORIZONTAL_PADDING = 10;
const VERTICAL_PADDING = 14;

const COLOR_OPTIONS = [
  '#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00',
  '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55',
  '#e2d5c2', '#ffd9b5', '#d6f5de', '#ffccda', '#c7c7cc',
];

const POSITION_OPTIONS: AppSegmentOption<StoryPosition>[] = [
  { value: 'top', label: 'TOP', accessibilityLabel: 'Move text near top of poster' },
  { value: 'center', label: 'CENTER', accessibilityLabel: 'Move text to center of poster' },
  { value: 'bottom', label: 'BOTTOM', accessibilityLabel: 'Move text near bottom of poster' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolvePositionFromY(y: number, maxY: number): StoryPosition {
  if (maxY <= 0) {
    return 'center';
  }

  const ratio = y / maxY;

  if (ratio <= 0.34) {
    return 'top';
  }

  if (ratio <= 0.67) {
    return 'center';
  }

  return 'bottom';
}

function resolvePresetY(position: StoryPosition, maxY: number): number {
  if (position === 'top') {
    return maxY * 0.16;
  }

  if (position === 'center') {
    return maxY * 0.5;
  }

  return maxY * 0.84;
}

export default function PosterEditorScreen({ navigation, route }: Props) {
  const inputRef = React.useRef<TextInput | null>(null);

  const [text, setText] = React.useState(route.params.initialText ?? '');
  const [textColor, setTextColor] = React.useState(route.params.initialColor ?? '#ffffff');
  const [positionHint, setPositionHint] = React.useState<StoryPosition>(route.params.initialPosition ?? 'center');

  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });
  const [layerSize, setLayerSize] = React.useState({ width: 0, height: 0 });
  const [layerOffset, setLayerOffset] = React.useState<LayerOffset>({ x: HORIZONTAL_PADDING, y: VERTICAL_PADDING });
  const [isDragging, setIsDragging] = React.useState(false);

  const hasInitializedRef = React.useRef(false);
  const layerOffsetRef = React.useRef<LayerOffset>({ x: HORIZONTAL_PADDING, y: VERTICAL_PADDING });
  const dragStartOffsetRef = React.useRef<LayerOffset>({ x: HORIZONTAL_PADDING, y: VERTICAL_PADDING });

  const updateLayerOffset = React.useCallback((nextOffset: LayerOffset) => {
    layerOffsetRef.current = nextOffset;
    setLayerOffset(nextOffset);
  }, []);

  const getBounds = React.useCallback(() => {
    const layerWidth = layerSize.width || MIN_LAYER_WIDTH;
    const layerHeight = layerSize.height || MIN_LAYER_HEIGHT;
    const maxX = Math.max(HORIZONTAL_PADDING, canvasSize.width - layerWidth - HORIZONTAL_PADDING);
    const maxY = Math.max(VERTICAL_PADDING, canvasSize.height - layerHeight - VERTICAL_PADDING);

    return {
      layerWidth,
      layerHeight,
      minX: HORIZONTAL_PADDING,
      maxX,
      minY: VERTICAL_PADDING,
      maxY,
    };
  }, [canvasSize.height, canvasSize.width, layerSize.height, layerSize.width]);

  const applyPresetPosition = React.useCallback((nextPosition: StoryPosition) => {
    const bounds = getBounds();
    const centeredX = clamp(
      (canvasSize.width - bounds.layerWidth) / 2,
      bounds.minX,
      bounds.maxX,
    );

    const desiredY = clamp(resolvePresetY(nextPosition, bounds.maxY), bounds.minY, bounds.maxY);

    updateLayerOffset({
      x: centeredX,
      y: desiredY,
    });

    setPositionHint(nextPosition);
  }, [canvasSize.width, getBounds, updateLayerOffset]);

  React.useEffect(() => {
    if (
      hasInitializedRef.current
      || canvasSize.width <= 0
      || canvasSize.height <= 0
      || layerSize.width <= 0
      || layerSize.height <= 0
    ) {
      return;
    }

    applyPresetPosition(route.params.initialPosition ?? 'center');
    hasInitializedRef.current = true;
  }, [
    applyPresetPosition,
    canvasSize.height,
    canvasSize.width,
    layerSize.height,
    layerSize.width,
    route.params.initialPosition,
  ]);

  const updateDragPosition = React.useCallback((gestureState: PanResponderGestureState) => {
    const bounds = getBounds();

    const nextX = clamp(
      dragStartOffsetRef.current.x + gestureState.dx,
      bounds.minX,
      bounds.maxX,
    );

    const nextY = clamp(
      dragStartOffsetRef.current.y + gestureState.dy,
      bounds.minY,
      bounds.maxY,
    );

    updateLayerOffset({ x: nextX, y: nextY });
    setPositionHint(resolvePositionFromY(nextY, bounds.maxY));
  }, [getBounds, updateLayerOffset]);

  const panResponder = React.useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsDragging(true);
        dragStartOffsetRef.current = layerOffsetRef.current;
      },
      onPanResponderMove: (_evt, gestureState) => {
        updateDragPosition(gestureState);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        dragStartOffsetRef.current = layerOffsetRef.current;
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        dragStartOffsetRef.current = layerOffsetRef.current;
      },
    }),
    [updateDragPosition],
  );

  const handleDone = React.useCallback(() => {
    const trimmedText = text.trim();
    const bounds = getBounds();
    const resolvedPosition = resolvePositionFromY(layerOffsetRef.current.y, bounds.maxY);

    navigation.dispatch({
      ...CommonActions.setParams({
        storyEditorResult: {
          text: trimmedText,
          color: textColor,
          position: resolvedPosition,
          updatedAt: Date.now(),
        },
      }),
      source: route.params.createPosterRouteKey,
    });

    navigation.goBack();
  }, [getBounds, navigation, route.params.createPosterRouteKey, text, textColor]);

  const displayText = text.trim().length > 0 ? text.trim() : 'Tap to type';

  const handleCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const handleLayerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayerSize((prev) => {
      if (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) {
        return prev;
      }

      return { width, height };
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={styles.header}>
        <AnimatedPressable style={styles.headerBtn} activeOpacity={0.85} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Edit Text</Text>
        <AnimatedPressable style={[styles.headerBtn, styles.donePill]} activeOpacity={0.85} onPress={handleDone}>
          <Text style={styles.donePillText}>Done</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.canvasWrap} onLayout={handleCanvasLayout}>
        <CachedImage uri={route.params.baseImageUri} style={styles.canvasImage} contentFit="cover" />
        <View style={styles.canvasMask} />

        <AnimatedPressable
          {...panResponder.panHandlers}
          style={[
            styles.layerBubble,
            {
              left: layerOffset.x,
              top: layerOffset.y,
              borderColor: isDragging ? Colors.brand : 'rgba(255,255,255,0.35)',
              backgroundColor: isDragging ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)',
            },
          ]}
          onPress={() => inputRef.current?.focus()}
          activeOpacity={0.96}
          onLayout={handleLayerLayout}
        >
          <Text style={[styles.layerText, { color: textColor }, text.trim().length === 0 && styles.layerPlaceholder]}>
            {displayText}
          </Text>
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.controlsPanel}>
          {/* Text input */}
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Type something..."
            placeholderTextColor={Colors.textMuted}
            maxLength={56}
            autoFocus
          />

          {/* Colors */}
          <View style={styles.colorRow}>
            {COLOR_OPTIONS.map((option) => {
              const isActive = option === textColor;
              return (
                <AnimatedPressable
                  key={option}
                  style={[
                    styles.colorOrb,
                    { backgroundColor: option },
                    isActive && styles.colorOrbActive,
                  ]}
                  activeOpacity={0.9}
                  onPress={() => setTextColor(option)}
                >
                  {isActive && <Ionicons name="checkmark" size={14} color={option === '#ffffff' || option === '#c7c7cc' || option === '#e2d5c2' || option === '#ffd9b5' || option === '#d6f5de' || option === '#ffccda' ? '#000' : '#fff'} />}
                </AnimatedPressable>
              );
            })}
          </View>

          {/* Snap position */}
          <View style={styles.snapRow}>
            {(['top', 'center', 'bottom'] as StoryPosition[]).map((pos) => (
              <AnimatedPressable
                key={pos}
                style={[styles.snapPill, positionHint === pos && styles.snapPillActive]}
                onPress={() => applyPresetPosition(pos)}
                activeOpacity={0.85}
              >
                <Text style={[styles.snapPillText, positionHint === pos && styles.snapPillTextActive]}>
                  {pos.charAt(0).toUpperCase() + pos.slice(1)}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  donePill: {
    backgroundColor: Colors.brand,
    width: 'auto',
    paddingHorizontal: 16,
  },
  donePillText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  canvasWrap: {
    flex: 1,
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  canvasImage: {
    width: '100%',
    height: '100%',
  },
  canvasMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  layerBubble: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '82%',
  },
  layerText: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
    letterSpacing: 0.3,
  },
  layerPlaceholder: {
    opacity: 0.6,
  },
  controlsPanel: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 14,
  },
  textInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  colorOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOrbActive: {
    borderWidth: 2,
    borderColor: Colors.textPrimary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  snapRow: {
    flexDirection: 'row',
    gap: 8,
  },
  snapPill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  snapPillActive: {
    borderColor: Colors.brand,
    backgroundColor: IS_LIGHT ? '#ede4d3' : '#2f291f',
  },
  snapPillText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  snapPillTextActive: {
    color: Colors.brand,
    fontFamily: 'Inter_700Bold',
  },
});
