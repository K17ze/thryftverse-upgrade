import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { KeyboardStickyView as RNUKeyboardStickyView } from 'react-native-keyboard-controller';

export interface KeyboardDockProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  offset?: { closed?: number; opened?: number };
}

export function KeyboardDock({ children, style, offset }: KeyboardDockProps) {
  return (
    <RNUKeyboardStickyView offset={offset} style={[styles.dock, style]}>
      {children}
    </RNUKeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
