import React from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles, Typography, Control } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

interface ChatTopBarProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  initials?: string;
  /** Show a verified badge next to the title (trusted seller/partner) */
  isVerified?: boolean;
  onBack: () => void;
  onSearch?: () => void;
  onInfo?: () => void;
  variant?: 'dm' | 'group';
  onTitlePress?: () => void;
  isSearchActive?: boolean;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  searchResultLabel?: string;
  onPreviousResult?: () => void;
  onNextResult?: () => void;
  onCloseSearch?: () => void;
}

export function ChatTopBar({
  title,
  subtitle,
  avatarUrl,
  initials,
  isVerified = false,
  onBack,
  onSearch,
  onInfo,
  variant = 'dm',
  onTitlePress,
  isSearchActive = false,
  searchValue = '',
  onSearchValueChange,
  searchResultLabel,
  onPreviousResult,
  onNextResult,
  onCloseSearch,
}: ChatTopBarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      {isSearchActive ? (
        <View style={styles.searchRoot}>
          <AnimatedPressable
            onPress={onCloseSearch ?? onBack}
            style={styles.backBtn}
            activeOpacity={0.6}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityLabel="Close search"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <View style={styles.searchFieldWrap}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchFieldIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchValue}
              onChangeText={onSearchValueChange}
              placeholder="Search in chat"
              placeholderTextColor={colors.textMuted}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search in conversation"
            />
          </View>
          {searchResultLabel ? (
            <View style={styles.searchNav}>
              <Text style={styles.searchCount}>{searchResultLabel}</Text>
              {onPreviousResult ? (
                <AnimatedPressable
                  onPress={onPreviousResult}
                  style={styles.searchNavBtn}
                  activeOpacity={0.6}
                  scaleValue={0.92}
                  hapticFeedback="light"
                  accessibilityLabel="Previous result"
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-up" size={16} color={colors.textPrimary} />
                </AnimatedPressable>
              ) : null}
              {onNextResult ? (
                <AnimatedPressable
                  onPress={onNextResult}
                  style={styles.searchNavBtn}
                  activeOpacity={0.6}
                  scaleValue={0.92}
                  hapticFeedback="light"
                  accessibilityLabel="Next result"
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-down" size={16} color={colors.textPrimary} />
                </AnimatedPressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
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
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
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
            <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
              {avatarUrl ? (
                <CachedImage uri={avatarUrl} style={styles.avatarImage} contentFit="cover" />
              ) : variant === 'group' ? (
                <Ionicons name="people" size={18} color={colors.textSecondary} />
              ) : (
                <Text style={styles.avatarText}>{initials ?? '?'}</Text>
              )}
            </View>
            <View style={styles.titleWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {isVerified && variant === 'dm' ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={13}
                    color={colors.brand}
                    style={styles.verifiedBadge}
                    accessibilityLabel="Verified user"
                  />
                ) : null}
              </View>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
              ) : null}
            </View>
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
                <Ionicons name={isSearchActive ? 'search' : 'search-outline'} size={20} color={isSearchActive ? colors.brand : colors.textPrimary} />
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
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
              </AnimatedPressable>
            ) : null}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm - 1,
    gap: Space.xs,
  },
  searchFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 0,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    minHeight: 38,
  },
  searchFieldIcon: {
    marginRight: Space.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textPrimary,
    paddingVertical: Space.sm - 2,
  },
  searchNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  searchNavBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchCount: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textMuted,
    minWidth: 34,
    textAlign: 'center',
  },
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm - 1,
    gap: Space.xs,
    minHeight: 56,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -2,
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 1,
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
  },
  avatarText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  title: {
    fontSize: Type.bodyStrong.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary,
    letterSpacing: Type.bodyStrong.letterSpacing,
    flexShrink: 1,
  },
  verifiedBadge: {
    flexShrink: 0,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textMuted,
    marginTop: 1,
    letterSpacing: Type.caption.letterSpacing,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
