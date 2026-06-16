import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis, Meta } from '../ui/Text';

interface ReplyQuoteProps {
  senderName: string;
  text: string;
  onClose: () => void;
  onPress?: () => void;
  style?: ViewStyle;
}

export function ReplyQuote({
  senderName,
  text,
  onClose,
  onPress,
  style,
}: ReplyQuoteProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.bar} />
      <AnimatedPressable
        style={styles.content}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Quoted reply from ${senderName}`}
        accessibilityHint="Scrolls to the original message"
        activeOpacity={0.7}
        scaleValue={0.99}
        hapticFeedback="light"
      >
        <Meta color={Colors.brand}>{senderName}</Meta>
        <Caption color={Colors.textSecondary} numberOfLines={1}>
          {text}
        </Caption>
      </AnimatedPressable>
      <AnimatedPressable
        style={styles.closeBtn}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss reply"
        activeOpacity={0.7}
        scaleValue={0.9}
        hapticFeedback="light"
      >
        <Ionicons name="close" size={18} color={Colors.textMuted} />
      </AnimatedPressable>
    </View>
  );
}

export function ReplyIndicator({
  senderName,
  text,
  style,
}: {
  senderName: string;
  text: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.indicatorContainer, style]}>
      <View style={styles.indicatorBar} />
      <View style={styles.indicatorContent}>
        <Meta color={Colors.brand}>{senderName}</Meta>
        <Caption color={Colors.textSecondary} numberOfLines={1}>
          {text}
        </Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    marginBottom: Space.xs,
  },
  bar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: Colors.brand,
    borderRadius: 2,
    marginRight: Space.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Space.sm,
  },
  indicatorContainer: {
    flexDirection: 'row',
    marginBottom: Space.xs + 2,
    marginLeft: Space.xs,
  },
  indicatorBar: {
    width: 3,
    backgroundColor: Colors.brand,
    borderRadius: 2,
    marginRight: Space.sm,
  },
  indicatorContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
});