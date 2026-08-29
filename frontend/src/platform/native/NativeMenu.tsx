import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, BackHandler } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Radius, Type, Space, Elevation } from '../../theme/designTokens';
export interface NativeMenuOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface NativeMenuProps {
  visible: boolean;
  onDismiss: () => void;
  options: NativeMenuOption[];
  testID?: string;
}

export function NativeMenu({ visible, onDismiss, options, testID }: NativeMenuProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (!visible) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => handler.remove();
  }, [visible, onDismiss]);

  if (!visible) return null;
  return (
    <Pressable style={styles.overlay} onPress={onDismiss} testID={testID} accessibilityRole="button" accessibilityLabel="Dismiss menu">
      <View style={styles.menu}>
        {options.map((opt, i) => (
          <Pressable
            key={i}
            style={styles.option}
            accessibilityLabel={opt.label}
            onPress={() => {
              opt.onPress();
              onDismiss();
            }}
            disabled={opt.disabled}
          accessibilityRole="switch"
          >
            <Text
              style={[
                styles.optionText,
                opt.destructive && styles.optionTextDestructive,
                opt.disabled && styles.optionTextDisabled,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: Radius.xl,
    paddingVertical: Space.xs,
    minWidth: 200,
    ...Elevation.modal,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: Space.md,
  },
  optionText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },
  optionTextDestructive: {
    color: colors.danger,
  },
  optionTextDisabled: {
    color: colors.textMuted,
  },
  });
}
