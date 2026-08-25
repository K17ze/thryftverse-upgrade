import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';

export interface KeyboardAwareStickyActionProps {
  children: React.ReactNode;
  action?: React.ReactNode;
  stickyAction?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  actionStyle?: StyleProp<ViewStyle>;
  scrollProps?: Partial<KeyboardAwareScrollViewProps>;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}

export function KeyboardAwareStickyAction({
  children,
  action,
  stickyAction,
  style,
  contentStyle,
  contentContainerStyle,
  actionStyle,
  scrollProps,
  keyboardShouldPersistTaps,
}: KeyboardAwareStickyActionProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const sticky = stickyAction ?? action;

  return (
    <View style={[styles.container, style]}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentContainerStyle, contentStyle]}
        bottomOffset={insets.bottom}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...scrollProps}
      >
        {children}
      </KeyboardAwareScrollView>
      {sticky ? (
        <View style={[styles.actionContainer, { paddingBottom: insets.bottom + 12 }, actionStyle]}>
          {sticky}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  actionContainer: {
    paddingHorizontal: Space.md,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  });
}
