import React from 'react';
import {
  KeyboardProvider as RNUKeyboardProvider,
  KeyboardAwareScrollView,
  KeyboardStickyView,
  useKeyboardHandler,
  useKeyboardContext,
  type KeyboardAwareScrollViewProps,
  type KeyboardStickyViewProps,
} from 'react-native-keyboard-controller';

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  return <RNUKeyboardProvider>{children}</RNUKeyboardProvider>;
}

export { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardHandler, useKeyboardContext };
export type { KeyboardAwareScrollViewProps, KeyboardStickyViewProps };
