import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { BottomSheet as ExpoBottomSheet, type SnapPoint } from '@expo/ui';

export interface NativeSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  snapPoints?: SnapPoint[];
  showDragIndicator?: boolean;
  testID?: string;
}

export function NativeSheet({
  visible,
  onDismiss,
  children,
  snapPoints,
  showDragIndicator = true,
  testID,
}: NativeSheetProps) {
  return (
    <ExpoBottomSheet
      isPresented={visible}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      showDragIndicator={showDragIndicator}
      testID={testID}
    >
      {children}
    </ExpoBottomSheet>
  );
}
