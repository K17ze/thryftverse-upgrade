/**
 * LayerOverflowActionSheet — per-layer overflow action sheet for
 * CreatorLayersSheet (bring to front / send to back / duplicate /
 * delete). Extracted verbatim from CreatorLayersSheet.tsx.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { Space, Radius, Typography } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { Motion } from '../../../theme/motionTokens';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { OverflowAction } from './layersSheetShared';
import { getLayerDisplayName } from './layersSheetShared';

interface LayerOverflowActionSheetProps {
  layer: CreatorLayer | null;
  colors: ThemeColors;
  reduceMotion: boolean;
  onClose: () => void;
  onAction: (action: OverflowAction) => void;
}

export function LayerOverflowActionSheet({
  layer,
  colors,
  reduceMotion,
  onClose,
  onAction }: LayerOverflowActionSheetProps) {
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (layer) {
      mounted.current = true;
      if (reduceMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, Motion.spring.entrance);
        backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
      }
    } else if (mounted.current) {
      if (reduceMotion) {
        translateY.value = 400;
        backdropOpacity.value = 0;
      } else {
        translateY.value = withTiming(400, { duration: Motion.duration.normal, easing: Motion.easing.exit });
        backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
      }
    }
  }, [layer, reduceMotion, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value }));

  if (!layer && !mounted.current) return null;

  const options: { key: OverflowAction; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; danger?: boolean }[] = [
    { key: 'front', label: 'Bring to front', icon: 'arrow-up-circle-outline' },
    { key: 'back', label: 'Send to back', icon: 'arrow-down-circle-outline' },
    { key: 'duplicate', label: 'Duplicate', icon: 'copy-outline' },
    { key: 'delete', label: 'Delete', icon: 'trash-outline', danger: true },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 400 }]} pointerEvents={layer ? 'auto' : 'none'}>
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close actions" accessibilityHint="Dismisses the layer actions sheet" accessibilityRole="button" />
      </Reanimated.View>
      <Reanimated.View
        style={[
          overflowStyles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl },
          sheetStyle,
        ]}
      >
        <View style={overflowStyles.handleContainer}>
          <View style={[overflowStyles.handle, { backgroundColor: colors.borderSubtle }]} />
        </View>
        <Text style={[overflowStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {layer ? getLayerDisplayName(layer) : ''}
        </Text>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => onAction(opt.key)}
            style={({ pressed }) => [
              overflowStyles.optionRow,
              { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={opt.label}
            accessibilityHint={opt.danger ? `Deletes the layer` : `Performs ${opt.label.toLowerCase()} on the layer`}
            accessibilityRole="button"
          >
            <Ionicons name={opt.icon} size={IconGrammar.standard} color={opt.danger ? colors.dangerText : colors.textPrimary} />
            <Text style={[overflowStyles.optionText, { color: opt.danger ? colors.dangerText : colors.textPrimary }]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            overflowStyles.cancelRow,
            { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
          ]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Cancel"
          accessibilityHint="Closes the layer actions sheet without taking action"
          accessibilityRole="button"
        >
          <Text style={[overflowStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </Reanimated.View>
    </View>
  );
}

const overflowStyles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Space.xs,
    paddingBottom: Space.lg,
    paddingHorizontal: Space.md },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.xs },
  handle: {
    width: 32,
    height: 4,
    borderRadius: Radius.md },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    marginTop: Space.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm },
  optionText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent' },
  cancelText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size } });
