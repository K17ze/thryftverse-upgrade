import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

interface ChatTopBarProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  initials?: string;
  onBack: () => void;
  onSearch?: () => void;
  onInfo?: () => void;
  variant?: 'dm' | 'group';
  onTitlePress?: () => void;
  isSearchActive?: boolean;
}

export function ChatTopBar({
  title,
  subtitle,
  avatarUrl,
  initials,
  onBack,
  onSearch,
  onInfo,
  variant = 'dm',
  onTitlePress,
  isSearchActive = false,
}: ChatTopBarProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.root}>
        <AnimatedPressable
          onPress={onBack}
          style={styles.backBtn}
          activeOpacity={0.6}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.center}
          onPress={onTitlePress}
          activeOpacity={0.7}
          scaleValue={0.98}
          hapticFeedback="light"
          disabled={!onTitlePress}
          accessibilityRole={onTitlePress ? 'button' : undefined}
          accessibilityLabel={onTitlePress ? (variant === 'group' ? 'Open group info' : 'Open profile') : undefined}
        >
          <View style={[styles.avatar, { backgroundColor: Colors.surfaceAlt }]}>
            {avatarUrl ? (
              <CachedImage uri={avatarUrl} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={styles.avatarText}>{initials ?? '?'}</Text>
            )}
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
          {onTitlePress && (
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 2 }} />
          )}
        </AnimatedPressable>

        <View style={styles.actions}>
          {onSearch ? (
            <AnimatedPressable
              onPress={onSearch}
              style={styles.iconBtn}
              activeOpacity={0.6}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityLabel={isSearchActive ? 'Close search' : 'Search messages'}
              accessibilityRole="button"
              accessibilityState={{ selected: isSearchActive }}
            >
              <Ionicons name={isSearchActive ? 'search' : 'search-outline'} size={22} color={isSearchActive ? Colors.brand : Colors.textPrimary} />
            </AnimatedPressable>
          ) : null}
          {onInfo ? (
            <AnimatedPressable
              onPress={onInfo}
              style={styles.iconBtn}
              activeOpacity={0.6}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityLabel={variant === 'group' ? 'Group info' : 'Chat info'}
              accessibilityRole="button"
            >
              <Ionicons name="information-circle-outline" size={22} color={Colors.textPrimary} />
            </AnimatedPressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    gap: Space.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -4,
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
    marginTop: 1,
    letterSpacing: Type.caption.letterSpacing,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});