import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { styles } from '../CreatorCameraStyles';

// ── Top controls — close (left), flash + tools (right) ───────────────

export interface CameraTopBarProps {
  insets: EdgeInsets;
  onClose: () => void;
  renderTopRightAccessory?: () => React.ReactNode;
  flash: 'off' | 'on' | 'auto';
  onCycleFlash: () => void;
  onOpenTools: () => void;
}

export function CameraTopBar({
  insets,
  onClose,
  renderTopRightAccessory,
  flash,
  onCycleFlash,
  onOpenTools }: CameraTopBarProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
        onPress={onClose}
        hitSlop={12}
        accessibilityLabel="Close camera"
        accessibilityHint="Closes the camera without capturing"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={IconGrammar.standard} color={colors.scrimTextPrimary} />
      </Pressable>

      <View style={styles.topRightControls}>
        {renderTopRightAccessory?.()}
        {/* Flash — subtle 20pt glyph in a 44pt target; no background unless active */}
        <Pressable
          style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed, flash !== 'off' && { backgroundColor: colors.scrimTextTertiary }]}
          onPress={onCycleFlash}
          hitSlop={12}
          accessibilityLabel={`Flash ${flash}`}
          accessibilityHint="Cycles flash between off, on, and auto"
          accessibilityRole="button"
        >
          <Ionicons
            name={flash === 'off' ? 'flash-off' : flash === 'auto' ? 'flash-outline' : 'flash'}
            size={20}
            color={flash === 'off' ? colors.scrimTextPrimary : colors.brand}
          />
        </Pressable>
        {/* Tools — single "more" affordance, transparent 20pt ellipsis */}
        <Pressable
          style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
          onPress={onOpenTools}
          hitSlop={12}
          accessibilityLabel="Camera tools"
          accessibilityHint="Opens timer, grid, hands-free, speed, green screen, and multi-capture"
          accessibilityRole="button"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.scrimTextPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
