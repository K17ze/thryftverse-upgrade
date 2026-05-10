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

type LayerOffset = {
  x: number;
  y: number;
};

const MIN_LAYER_WIDTH = 120;
const MIN_LAYER_HEIGHT = 38;
const HORIZONTAL_PADDING = 10;
const VERTICAL_PADDING = 14;

const COLOR_OPTIONS = ['#ffffff', '#e2d5c2', '#ffd9b5', '#d6f5de', '#ffccda'];

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
        <AnimatedPressable
          style={styles.iconBtn}
          activeOpacity={0.85}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close story editor"
        >
          <Ionicons name="close" size={20} color={Colors.textPrimary} />
        </AnimatedPressable>

        <View style={styles.headerCopy}>
          <Text style={styles.headerLabel}>STORY EDITOR</Text>
          <Text style={styles.headerTitle}>Move text on canvas</Text>
        </View>

        <AppButton
          title="Done"
          variant="primary"
          size="sm"
          align="center"
          style={styles.doneBtn}
          titleStyle={styles.doneBtnText}
          onPress={handleDone}
          accessibilityLabel="Apply story edit"
        />
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
              borderColor: isDragging ? Colors.brand : 'rgba(255,255,255,0.58)',
            },
          ]}
          onPress={() => inputRef.current?.focus()}
          activeOpacity={0.96}
          accessibilityRole="button"
          accessibilityLabel="Drag story text layer"
          accessibilityHint="Drag this text around the poster"
          onLayout={handleLayerLayout}
        >
          <Text style={[styles.layerText, { color: textColor }, text.trim().length === 0 && styles.layerPlaceholder]}>
            {displayText}
          </Text>
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.controlsPanel}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Type story text"
            placeholderTextColor={Colors.textMuted}
            maxLength={56}
          />

          <Text style={styles.dragHint}>Drag the text directly on the canvas. Use snap presets for quick placement.</Text>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Color</Text>
            <View style={styles.colorRow}>
              {COLOR_OPTIONS.map((option) => {
                const isActive = option === textColor;

                return (
                  <AnimatedPressable
                    key={option}
                    style={[
                      styles.colorChip,
                      { backgroundColor: option },
                      isActive && styles.colorChipActive,
                    ]}
                    activeOpacity={0.9}
                    onPress={() => setTextColor(option)}
                    accessibilityRole="button"
                    accessibilityLabel="Select text color"
                  >
                    {isActive ? <Ionicons name="checkmark" size={11} color={Colors.textInverse} /> : null}
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Snap</Text>
            <AppSegmentControl
              options={POSITION_OPTIONS}
              value={positionHint}
              onChange={applyPresetPosition}
              style={styles.positionRow}
              fullWidth
              optionStyle={styles.positionChip}
              optionActiveStyle={styles.positionChipActive}
              optionTextStyle={styles.positionChipText}
              optionTextActiveStyle={styles.positionChipTextActive}
            />
          </View>

          <AppButton
            title="Clear Text"
            variant="secondary"
            size="sm"
            align="center"
            style={styles.clearBtn}
            titleStyle={styles.clearBtnText}
            onPress={() => setText('')}
            accessibilityLabel="Clear story text"
          />
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
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    letterSpacing: 0.9,
    fontFamily: 'Inter_700Bold',
  },
  headerTitle: {
    marginTop: 2,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  doneBtn: {
    minHeight: 34,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  doneBtnText: {
    color: Colors.background,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  canvasWrap: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
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
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '82%',
  },
  layerText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 8,
    letterSpacing: 0.2,
  },
  layerPlaceholder: {
    opacity: 0.75,
  },
  controlsPanel: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  textInput: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dragHint: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    lineHeight: 16,
  },
  controlRow: {
    gap: 7,
  },
  controlLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChipActive: {
    borderWidth: 2,
    borderColor: Colors.textPrimary,
  },
  positionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  positionChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 34,
  },
  positionChipActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.surfaceAlt,
  },
  positionChipText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  positionChipTextActive: {
    color: Colors.brand,
  },
  clearBtn: {
    marginTop: 2,
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  clearBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
