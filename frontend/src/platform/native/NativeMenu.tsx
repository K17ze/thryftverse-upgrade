import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, BackHandler } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography } from '../../theme/designTokens';
import { Space } from '../../theme/designTokens';

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
    <Pressable style={styles.overlay} onPress={onDismiss} testID={testID}>
      <View style={styles.menu}>
        {options.map((opt, i) => (
          <Pressable
            key={i}
            style={styles.option}
            onPress={() => {
              opt.onPress();
              onDismiss();
            }}
            disabled={opt.disabled}
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
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: Space.md,
  },
  optionText: {
    fontSize: 15,
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
