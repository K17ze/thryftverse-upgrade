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
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, IconGrammar } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
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

// Subtle red tint — communicates "avoid placing content here" without
// dominating the canvas silhouette (AGENTS.md §4 surface budget).
const RED_TINT_FILL = 'rgba(220,90,90,0.07)';
const RED_TINT_EDGE = 'rgba(220,90,90,0.42)';
const RED_TINT_CONTENT_EDGE = 'rgba(220,90,90,0.22)';
const RED_TINT_LABEL = '#E08585';

export function SafeZoneOverlay({ visible, topHeight, bottomHeight, style }: SafeZoneOverlayProps) {
  const { colors } = useAppTheme();

  if (!visible || (topHeight <= 0 && bottomHeight <= 0)) return null;

  return (
    <View style={[styles.overlay, style]} pointerEvents="none">
      {topHeight > 0 && (
        <View style={[styles.topBand, { top: 0, height: topHeight }]}>
          <View style={styles.label}>
            <Ionicons name="scan-outline" size={IconGrammar.badge} color={RED_TINT_LABEL} />
            <Text style={styles.labelText}>Top chrome</Text>
          </View>
        </View>
      )}
      {bottomHeight > 0 && (
        <View style={[styles.bottomBand, { bottom: 0, height: bottomHeight }]}>
          <View style={styles.label}>
            <Ionicons name="scan-outline" size={IconGrammar.badge} color={RED_TINT_LABEL} />
            <Text style={styles.labelText}>Tool dock</Text>
          </View>
        </View>
      )}
      {topHeight > 0 && bottomHeight > 0 && (
        <View style={[styles.contentBoundary, { top: topHeight, bottom: bottomHeight }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 45,
  },
  topBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: RED_TINT_FILL,
    borderBottomWidth: 1,
    borderBottomColor: RED_TINT_EDGE,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  bottomBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: RED_TINT_FILL,
    borderTopWidth: 1,
    borderTopColor: RED_TINT_EDGE,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  contentBoundary: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: RED_TINT_CONTENT_EDGE,
    borderStyle: 'dashed',
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  labelText: {
    fontFamily: FontFamily.medium,
    fontSize: 9,
    color: RED_TINT_LABEL,
    letterSpacing: 0.3,
  },
});
