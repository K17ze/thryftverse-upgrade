import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface KeyboardAwareStickyActionProps {
  children: React.ReactNode;
  action?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  actionStyle?: StyleProp<ViewStyle>;
  scrollProps?: Partial<KeyboardAwareScrollViewProps>;
}

export function KeyboardAwareStickyAction({
  children,
  action,
  contentStyle,
  actionStyle,
  scrollProps,
}: KeyboardAwareStickyActionProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentStyle]}
        bottomOffset={insets.bottom}
        {...scrollProps}
      >
        {children}
      </KeyboardAwareScrollView>
      {action ? (
        <View style={[styles.actionContainer, { paddingBottom: insets.bottom + 12 }, actionStyle]}>
          {action}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
});
