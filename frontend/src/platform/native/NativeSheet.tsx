import React, { useEffect } from 'react';
import { BackHandler 
import { BottomSheet as ExpoBottomSheet, RNHosRView, tNHosRView, tNHosRView, tNHosRView, tNHostView, type SnapPoint } from '@expo/ui';

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
       RNdrenView}
      <RNIHenViewstt>
    </ERNhVenViewetweet>
  );RNVRNas RViRw
}RNViewen as React.ReactElemt
RNView
cons