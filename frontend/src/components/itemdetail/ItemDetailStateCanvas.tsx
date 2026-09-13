import React from 'react';
import { View, StatusBar, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  CommerceStateCanvas,
  type CommerceStateCanvasProps,
} from '../commerce/CommerceStateCanvas';

export type ItemDetailStateCanvasProps = CommerceStateCanvasProps;

/**
 * Full-screen state scene for the item detail early returns — loading,
 * error and not-found. The themed container + translucent StatusBar wrap
 * the shared commerce state canvas so every state scene renders the same
 * chrome as the populated screen.
 */
export function ItemDetailStateCanvas(props: ItemDetailStateCanvasProps) {
  const { isDark, colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
      <CommerceStateCanvas {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
