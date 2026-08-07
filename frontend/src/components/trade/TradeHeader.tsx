import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Type , Space, Radius  } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Headline } from '../ui/Text';

interface TradeHeaderProps {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  rightAction?: React.ReactNode;
  showBack?: boolean;
  showClose?: boolean;
  backIcon?: keyof typeof Ionicons.glyphMap;
}

export function TradeHeader({
  title,
  onBack,
  onClose,
  rightAction,
  showBack = true,
  showClose = false,
  backIcon = 'chevron-back',
}: TradeHeaderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const handlePress = () => {
    if (showClose && onClose) {
      onClose();
    } else if (showBack && onBack) {
      onBack();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftSlot}>
        {(showBack || showClose) && (
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={handlePress}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={showClose ? 'Close' : 'Go back'}
            accessibilityHint={showClose ? 'Closes this screen' : 'Returns to the previous screen'}
          >
            <Ionicons
              name={showClose ? 'close' : backIcon}
              size={22}
              color={colors.textPrimary}
            />
          </AnimatedPressable>
        )}
      </View>

      <View style={styles.titleWrap}>
        <Headline style={styles.title} numberOfLines={1}>
          {title}
        </Headline>
      </View>

      <View style={styles.rightSlot}>
        {rightAction ? (
          rightAction
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: 56,
  },
  leftSlot: {
    width: 44,
    alignItems: 'flex-start',
  },
  rightSlot: {
    width: 44,
    alignItems: 'flex-end',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPlaceholder: {
    width: 44,
    height: 44,
  },
});