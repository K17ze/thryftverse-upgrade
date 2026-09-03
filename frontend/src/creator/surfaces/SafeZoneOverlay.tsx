/**
 * SafeZoneOverlay — shared visual guide for reserved top/bottom UI areas.
 *
 * Per spec 05 (Poster Reconstruction): safe zone visibility should be
 * automatic while dragging near reserved top/bottom UI areas, manually
 * toggleable under More, not permanently visible.
 *
 * This is a visual guide only — `pointerEvents="none"` so it never
 * intercepts touch/gesture input on the canvas.
 *
 * The overlay renders two subtle red-tinted bands (top chrome + tool dock)
 * with small labels, plus a dashed content-safe boundary between them.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

export interface SafeZoneOverlayProps {
  /** Whether the overlay is visible. When false, renders nothing. */
  visible: boolean;
  /** Height (px) of the top reserved chrome region. */
  topHeight: number;
  /** Height (px) of the bottom reserved tool dock region. */
  bottomHeight: number;
  /** Optional style override for the wrapping container. */
  style?: ViewStyle;
}

export function SafeZoneOverlay({ visible, topHeight, bottomHeight, style }: SafeZoneOverlayProps) {
  const { colors } = useAppTheme();

  if (!visible || (topHeight <= 0 && bottomHeight <= 0)) return null;

  return (
    <View style={[styles.overlay, style]} pointerEvents="none">
      {topHeight > 0 && (
        <View
          style={[styles.topBand, { top: 0, height: topHeight, backgroundColor: colors.brandSubtle, borderBottomColor: colors.brand }]}
          accessibilityLabel="Top safe area"
        />
      )}
      {bottomHeight > 0 && (
        <View
          style={[styles.bottomBand, { bottom: 0, height: bottomHeight, backgroundColor: colors.brandSubtle, borderTopColor: colors.brand }]}
          accessibilityLabel="Bottom safe area"
        />
      )}
      {topHeight > 0 && bottomHeight > 0 && (
        <View
          style={[styles.contentBoundary, { top: topHeight, bottom: bottomHeight, borderColor: colors.brand }]}
          accessibilityElementsHidden
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 45 },
  topBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    borderStyle: 'dashed' },
  bottomBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed' },
  contentBoundary: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed' } });
