import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, TypeStyles, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

export interface ChatListingContextBarProps {
  thumbnailUri: string | null;
  title: string;
  price: string;
  availability: string;
  primaryActionLabel: string;
  primaryActionIcon: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  secondaryActionIcon?: string;
  onSecondaryAction?: () => void;
  onTitlePress?: () => void;
  defaultCollapsed?: boolean;
}

export function ChatListingContextBar({
  thumbnailUri,
  title,
  price,
  availability,
  primaryActionLabel,
  primaryActionIcon,
  onPrimaryAction,
  secondaryActionLabel,
  secondaryActionIcon,
  onSecondaryAction,
  onTitlePress,
  defaultCollapsed = false,
}: ChatListingContextBarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <View style={styles.root}>
      <View style={styles.rowContainer}>
        <AnimatedPressable
          onPress={onTitlePress}
          activeOpacity={0.85}
          scaleValue={0.98}
          hapticFeedback="light"
          disabled={!onTitlePress}
          accessibilityRole={onTitlePress ? 'button' : undefined}
          accessibilityLabel={`Linked listing: ${title}, ${price}, ${availability}`}
          accessibilityHint="Opens the listing detail page"
          style={styles.row}
        >
          {thumbnailUri ? (
            <CachedImage
              uri={thumbnailUri}
              style={styles.thumb}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Text style={styles.thumbFallbackText}>{title.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.price}>{price}</Text>
              <Text style={styles.availability}>{availability}</Text>
            </View>
          </View>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setCollapsed((c) => !c)}
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand listing actions' : 'Collapse listing actions'}
          style={styles.collapseBtn}
        >
          <Ionicons name={collapsed ? 'ellipsis-horizontal' : 'close'} size={18} color={Colors.textSecondary} />
        </AnimatedPressable>
      </View>
      {!collapsed && (
        <View style={styles.actionsRow}>
          <AnimatedPressable
            style={styles.primaryBtn}
            onPress={onPrimaryAction}
            activeOpacity={0.85}
            scaleValue={0.96}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={primaryActionLabel}
          >
            <Ionicons name={primaryActionIcon as any} size={14} color={Colors.textInverse} />
            <Text style={styles.primaryBtnText}>{primaryActionLabel}</Text>
          </AnimatedPressable>
          {secondaryActionLabel && onSecondaryAction ? (
            <AnimatedPressable
              style={styles.secondaryBtn}
              onPress={onSecondaryAction}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={secondaryActionLabel}
            >
              <Ionicons name={(secondaryActionIcon ?? 'chatbubbles-outline') as any} size={14} color={Colors.textPrimary} />
              <Text style={styles.secondaryBtnText}>{secondaryActionLabel}</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    gap: Space.sm,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  collapseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  thumbFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbFallbackText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.8,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  price: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  availability: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
  },
  primaryBtnText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textInverse,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  secondaryBtnText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
});
