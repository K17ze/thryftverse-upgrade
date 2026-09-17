/**
 * MediaPickerStates — non-grid states for the MediaPicker sheet:
 * the loading skeleton and the permission gate (undetermined / denied /
 * can-ask-again) that wraps the sheet content.
 *
 * Extracted from MediaPicker.tsx (pure move — no behavior change).
 */

import React from 'react';
import { View } from 'react-native';
import type * as MediaLibrary from 'expo-media-library/legacy';
import { type ThemeColors } from '../../../theme/ThemeContext';
import { PickerShell, PermissionDeniedState, createStyles } from './pickerShared';

export function MediaPickerSkeleton({
  colors,
  styles }: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.mediaGridContent}>
      {Array.from({ length: 18 }).map((_, i) => (
        <View key={i} style={[styles.mediaGridCell, { backgroundColor: colors.surfaceAlt }]} />
      ))}
    </View>
  );
}

export function MediaPickerPermissionGate({
  status,
  onClose,
  onOpenSettings,
  onRequestPermission,
  colors,
  styles,
  children }: {
  status: MediaLibrary.PermissionResponse | null | undefined;
  onClose: () => void;
  onOpenSettings: () => void;
  onRequestPermission: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  children: React.ReactNode;
}) {
  if (!status) {
    return (
      <PickerShell title="Select" onClose={onClose}>
        <MediaPickerSkeleton colors={colors} styles={styles} />
      </PickerShell>
    );
  }

  if (!status.granted && !status.canAskAgain) {
    return (
      <PickerShell title="Select" onClose={onClose}>
        <PermissionDeniedState
          title="Allow photo access"
          message="ThryftVerse needs access to your library to add photos."
          ctaLabel="Open settings"
          onCta={onOpenSettings}
          colors={colors}
          styles={styles}
        />
      </PickerShell>
    );
  }

  if (!status.granted) {
    return (
      <PickerShell title="Select" onClose={onClose}>
        <PermissionDeniedState
          title="Allow photo access"
          message="ThryftVerse needs access to your library to add photos."
          ctaLabel="Allow access"
          onCta={onRequestPermission}
          colors={colors}
          styles={styles}
        />
      </PickerShell>
    );
  }

  return <>{children}</>;
}
