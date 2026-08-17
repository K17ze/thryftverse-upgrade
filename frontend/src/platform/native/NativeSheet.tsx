import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, View, Text, Pressable } from 'react-native';
import { BottomSheet as ExpoBottomSheet, type SnapPoint } from '@expo/ui';
import { ExpoUIHost } from './ExpoUIHost';

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
  useEffect(() => {
    if (!visible) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => handler.remove();
  }, [visible, onDismiss]);

  return (
    <ExpoBottomSheet
      isPresented={visible}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      showDragIndicator={showDragIndicator}
      testID={testID}
    >
      <ExpoUIHost style={styles.host}>
        {children}
      </ExpoUIHost>
    </ExpoBottomSheet>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
