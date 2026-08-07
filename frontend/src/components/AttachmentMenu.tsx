import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from './AnimatedPressable';
import { Caption, Headline } from './ui/Text';

import { Space, Radius, Type, Typography } from '../theme/designTokens';
interface AttachmentOption {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress?: () => void;
}

interface AttachmentMenuProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectOption?: (optionId: string) => void;
  style?: ViewStyle;
}

function getAttachmentOptions(colors: ThemeColors): AttachmentOption[] {
  return [
    { id: 'gallery', icon: 'images', label: 'Gallery', color: '#4CAF50' },
    { id: 'camera', icon: 'camera', label: 'Camera', color: '#2196F3' },
    { id: 'file', icon: 'document', label: 'File', color: colors.textSecondary },
    { id: 'location', icon: 'location', label: 'Location', color: '#9C27B0' },
    { id: 'contact', icon: 'person', label: 'Contact', color: '#00BCD4' },
    { id: 'product', icon: 'pricetag', label: 'Product', color: '#E91E63' },
  ];
}

export function AttachmentMenu({
  isVisible,
  onClose,
  onSelectOption,
  style,
}: AttachmentMenuProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const attachmentOptions = React.useMemo(() => getAttachmentOptions(colors), [colors]);
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isVisible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  const handleOptionPress = (option: AttachmentOption) => {
    onSelectOption?.(option.id);
    option.onPress?.();
    onClose();
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <AnimatedPressable
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
        />

        <Animated.View
          style={[
            styles.container,
            { transform: [{ translateY }] },
            style,
          ]}
        >
          <View style={styles.handle} />

          <Headline style={styles.title}>Add Attachment</Headline>

          <View style={styles.optionsGrid}>
            {attachmentOptions.map((option) => (
              <AnimatedPressable
                key={option.id}
                style={styles.optionButton}
                onPress={() => handleOptionPress(option)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityHint={`Select ${option.label} attachment`}
                activeOpacity={0.7}
                scaleValue={0.95}
                hapticFeedback="light"
              >
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${option.color}15` },
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={28}
                    color={option.color}
                  />
                </View>
                <Caption color={colors.textPrimary} style={styles.optionLabel}>{option.label}</Caption>
              </AnimatedPressable>
            ))}
          </View>

          <AnimatedPressable
            style={styles.cancelButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
          >
            <Caption color={colors.danger} style={styles.cancelText}>Cancel</Caption>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    container: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl + 8,
      borderTopRightRadius: Radius.xl + 8,
      paddingHorizontal: Space.lg - 4,
      paddingBottom: Space.xl + 14,
      paddingTop: Space.sm + 4,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: Radius.sm,
      alignSelf: 'center',
      marginBottom: Space.lg - 4,
    },
    title: {
      textAlign: 'center',
      marginBottom: Space.lg - 4,
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: Space.lg - 4,
    },
    optionButton: {
      width: '30%',
      alignItems: 'center',
      marginBottom: Space.md + 4,
    },
    iconContainer: {
      width: 60,
      height: 60,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.sm,
    },
    optionLabel: {
      fontFamily: Typography.family.medium,
    },
    cancelButton: {
      backgroundColor: colors.background,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
    },
    cancelText: {
      fontFamily: Typography.family.semibold,
    },
  });
}
