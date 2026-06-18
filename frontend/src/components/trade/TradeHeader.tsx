import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
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
              color={Colors.textPrimary}
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

const styles = StyleSheet.create({
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPlaceholder: {
    width: 44,
    height: 44,
  },
});