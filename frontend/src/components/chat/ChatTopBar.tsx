import React from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, TypeStyles, Control, AvatarSize } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { colorForId } from '../../utils/avatarColor';

interface ChatTopBarProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  initials?: string;
  /** Stable id for deterministic group placeholder color. */
  groupId?: string;
  /** Show a verified badge next to the title (trusted seller/partner) */
  isVerified?: boolean;
  /**
   * Real-time online presence. Only pass `true` when the backend provides
   * a real-time presence signal for this participant. When `undefined` or
   * `false`, no presence dot is rendered (AGENTS.md §11 — never fabricate
   * presence).
   */
  isOnline?: boolean;
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
  groupId,
  isVerified = false,
  isOnline = false,
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
  onCloseSearch }: ChatTopBarProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
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
            accessibilityLabel={t('search.closeSearch')}
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
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.textMuted}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('search.inConversation')}
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
                  accessibilityLabel={t('search.previousResult')}
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
                  accessibilityLabel={t('search.nextResult')}
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
            accessibilityLabel={t('common.goBack')}
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
            <View style={[styles.avatar, !avatarUrl && { backgroundColor: variant === 'group' && groupId ? colorForId(groupId) : colors.surfaceAlt }]}>
              {avatarUrl ? (
                <CachedImage uri={avatarUrl} style={styles.avatarImage} contentFit="cover" />
              ) : variant === 'group' ? (
                <Text style={[styles.avatarText, { color: colors.scrimTextPrimary }]}>{initials ?? 'G'}</Text>
              ) : (
                <Text style={styles.avatarText}>{initials ?? '?'}</Text>
              )}
              {isOnline ? (
                <View style={[styles.presenceDotOuter, { backgroundColor: colors.success }]}>
                  <View style={[styles.presenceDot, { backgroundColor: colors.background }]} />
                </View>
              ) : null}
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
                    accessibilityLabel={t('common.verifiedUser')}
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
    borderBottomColor: colors.border },
  searchRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm - 1,
    gap: Space.xs },
  searchFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 0,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    minHeight: 38 },
  searchFieldIcon: {
    marginRight: Space.xs },
  searchInput: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textPrimary,
    paddingVertical: Space.sm - 2 },
  searchNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0 },
  searchNavBtn: {
    width: Control.chrome,
    height: Control.chrome,
    justifyContent: 'center',
    alignItems: 'center' },
  searchCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textMuted,
    minWidth: 34,
    textAlign: 'center' },
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm - 1,
    gap: Space.xs,
    minHeight: 56 },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -2 },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 1,
    minWidth: 0 },
  avatar: {
    width: AvatarSize.md,
    height: AvatarSize.md,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0 },
  avatarImage: {
    width: AvatarSize.md,
    height: AvatarSize.md,
    borderRadius: Radius.full },
  presenceDotOuter: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: Space.smMd,
    height: Space.smMd,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  presenceDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full },
  avatarText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minWidth: 0 },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    flexShrink: 1 },
  verifiedBadge: {
    flexShrink: 0 },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textMuted,
    marginTop: 1,
    letterSpacing: TypographyV2.meta.letterSpacing },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0 },
  iconBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' } });
