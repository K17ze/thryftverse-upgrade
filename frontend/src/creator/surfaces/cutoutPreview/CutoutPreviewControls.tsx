/**
 * CutoutPreviewControls — the controls section of CutoutPreviewSheet:
 * Reset / hold-to-Compare / Invert row, the brush-mode tab row with
 * spring underline, the Edge Softness slider and the hint text.
 * Extracted verbatim from CutoutPreviewSheet.tsx.
 */
import React from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { type SharedValue, type AnimatedStyle } from 'react-native-reanimated';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { CreatorSlider } from '../../controls/CreatorSlider';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import type { BrushMode, ModeId, ModeButton } from './cutoutPreviewShared';
import { styles } from './cutoutPreviewStyles';

interface CutoutPreviewControlsProps {
  colors: ThemeColors;
  canRefine: boolean;
  strokesCount: number;
  invert: boolean;
  brushMode: BrushMode | null;
  featherPx: number;
  modeButtons: ModeButton[];
  modeTabLayouts: React.MutableRefObject<Map<BrushMode, { x: number; width: number }>>;
  modeUnderlineXSV: SharedValue<number>;
  modeUnderlineWSV: SharedValue<number>;
  modeUnderlineOpacitySV: SharedValue<number>;
  modeUnderlineStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  onResetMask: () => void;
  onCompareIn: () => void;
  onCompareOut: () => void;
  onInvertToggle: () => void;
  onModeSelect: (mode: ModeId) => void;
  onFeatherChange: (value: number) => void;
}

export function CutoutPreviewControls({
  colors,
  canRefine,
  strokesCount,
  invert,
  brushMode,
  featherPx,
  modeButtons,
  modeTabLayouts,
  modeUnderlineXSV,
  modeUnderlineWSV,
  modeUnderlineOpacitySV,
  modeUnderlineStyle,
  onResetMask,
  onCompareIn,
  onCompareOut,
  onInvertToggle,
  onModeSelect,
  onFeatherChange }: CutoutPreviewControlsProps) {
  return (
    <>
      {/* ── Compare / reset / invert controls ── */}
      <View style={styles.controlRow}>
        {/* Reset — clears all strokes and recreates the mask */}
        <PressScale
          onPress={onResetMask}
          disabled={!canRefine || strokesCount === 0}
          style={[
            styles.controlBtn,
            {
              backgroundColor: 'transparent',
              borderColor: colors.border,
              opacity: canRefine && strokesCount > 0 ? 1 : 0.4 },
          ]}
          accessibilityLabel="Reset mask"
          accessibilityHint="Clears all brush strokes and starts over"
          accessibilityRole="button"
        >
          <AppIcon
            name="refresh"
            size={IconSize.sm}
            color="textSecondary"
            opticalCenter={true}
            accessible={false}
          />
          <Text
            style={[
              styles.controlBtnLabel,
              { color: colors.textSecondary },
            ]}
          >
            Reset
          </Text>
        </PressScale>

        {/* Hold to compare — shows the original image. Reduce Motion-safe:
            instant swap, no animation. */}
        <Pressable
          onPressIn={onCompareIn}
          onPressOut={onCompareOut}
          disabled={!canRefine}
          style={({ pressed }) => [
            styles.controlBtn,
            {
              backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
              borderColor: colors.border,
              opacity: canRefine ? 1 : 0.4 },
          ]}
          accessibilityLabel="Hold to compare original"
          accessibilityHint="Hold to show the original image"
          accessibilityRole="button"
        >
          <AppIcon name="eye" size={IconSize.sm} color="textSecondary" opticalCenter={true} accessible={false} />
          <Text style={[styles.controlBtnLabel, { color: colors.textSecondary }]}>
            Compare
          </Text>
        </Pressable>

        {/* Invert toggle */}
        <PressScale
          onPress={onInvertToggle}
          disabled={!canRefine}
          style={[
            styles.controlBtn,
            {
              backgroundColor: invert ? colors.brand : 'transparent',
              borderColor: invert ? colors.brand : colors.border,
              opacity: canRefine ? 1 : 0.4 },
          ]}
          accessibilityLabel="Invert mask"
          accessibilityHint="Inverts the cutout mask"
          accessibilityRole="button"
          accessibilityState={{ selected: invert }}
        >
          <AppIcon
            name="swap-horizontal-outline"
            size={IconSize.sm}
            color={invert ? 'textInverse' : 'textSecondary'}
            opticalCenter={true}
            accessible={false}
          />
          <Text
            style={[
              styles.controlBtnLabel,
              { color: invert ? colors.textInverse : colors.textSecondary },
            ]}
          >
            Invert
          </Text>
        </PressScale>
      </View>

      {/* ── Mode selector — text-only tabs with spring underline ── */}
      <View style={styles.modeRow}>
        {modeButtons.map((btn) => {
          const isRestore = btn.id === 'restore';
          const selected = !isRestore && brushMode === btn.id;
          return (
            <PressScale
              key={btn.id}
              onPress={() => onModeSelect(btn.id)}
              disabled={!canRefine}
              onLayout={!isRestore ? (e) => {
                modeTabLayouts.current.set(btn.id as BrushMode, {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width });
                if (brushMode === btn.id) {
                  modeUnderlineXSV.value = e.nativeEvent.layout.x;
                  modeUnderlineWSV.value = e.nativeEvent.layout.width;
                  modeUnderlineOpacitySV.value = 1;
                }
              } : undefined}
              style={styles.modeTab}
              accessibilityLabel={btn.label}
              accessibilityHint="Switches to this mode"
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.modeTabText,
                  {
                    color: selected ? colors.brand : colors.textSecondary,
                    opacity: !canRefine ? 0.4 : 1 },
                ]}
                numberOfLines={1}
              >
                {btn.label}
              </Text>
            </PressScale>
          );
        })}
        {/* Spring-animated underline indicator (brand color, 2pt) */}
        <Reanimated.View
          style={[styles.modeUnderline, modeUnderlineStyle, { backgroundColor: colors.brand }]}
          pointerEvents="none"
        />
      </View>

      {/* ── Edge Softness slider ── */}
      <View style={styles.sliderRow}>
        <View style={styles.sliderHeader}>
          <Text style={[styles.sliderLabel, { color: colors.textPrimary }]}>
            Edge Softness
          </Text>
          <Text style={[styles.sliderValue, { color: colors.textMuted }]}>
            {featherPx}px
          </Text>
        </View>
        <CreatorSlider
          value={featherPx}
          min={0}
          max={10}
          step={1}
          onValueChange={onFeatherChange}
          onCommit={onFeatherChange}
          accessibilityLabel="Edge softness"
          accessibilityHint="Adjusts the edge softness"
        />
      </View>

      {/* ── Hint ── */}
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {brushMode
          ? `Draw to ${brushMode === 'erase' ? 'erase' : 'keep'}.`
          : 'Select a brush mode, then draw.'}
      </Text>
    </>
  );
}
