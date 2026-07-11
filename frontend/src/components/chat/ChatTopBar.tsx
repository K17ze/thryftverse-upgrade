import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
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
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
          <TextInput
            style={styles.searchInput}
            value={searchValue}
            onChangeText={onSearchValueChange}
            placeholder="Search in chat"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search in conversation"
          />
          {searchResultLabel ? (
            <View style={styles.searchNav}>
              <Text style={styles.searchCount}>{searchResultLabel}</Text>
              {onPreviousResult ? (
                <AnimatedPressable
                  onPress={onPreviousResult}
                  style={styles.iconBtn}
                  activeOpacity={0.6}
                  scaleValue={0.92}
                  hapticFeedback="light"
                  accessibilityLabel="Previous result"
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-up" size={20} color={Colors.textPrimary} />
                </AnimatedPressable>
              ) : null}
              {onNextResult ? (
                <AnimatedPressable
                  onPress={onNextResult}
                  style={styles.iconBtn}
                  activeOpacity={0.6}
                  scaleValue={0.92}
                  hapticFeedback="light"
                  accessibilityLabel="Next result"
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-down" size={20} color={Colors.textPrimary} />
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
              ) : variant === 'group' ? (
                <Ionicons name="people" size={18} color={Colors.textSecondary} />
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
                    color={Colors.brand}
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  searchRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    gap: Space.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textPrimary,
    paddingHorizontal: Space.sm,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
  },
  searchNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  searchCount: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textMuted,
    minWidth: 36,
    textAlign: 'center',
  },
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    gap: Space.sm,
  },
  backBtn: {
    width: 44,
    height: 44,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    flexShrink: 1,
  },
  verifiedBadge: {
    flexShrink: 0,
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
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});