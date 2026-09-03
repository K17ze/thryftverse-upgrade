import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutAnimation, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, TypeStyles, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export interface ChatListingContextBarProps {
  thumbnailUri: string | null;
  title: string;
  price: string;
  availability: string;
  primaryActionLabel: string;
  primaryActionIcon: React.ComponentProps<typeof Ionicons>['name'];
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  secondaryActionIcon?: React.ComponentProps<typeof Ionicons>['name'];
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
  defaultCollapsed = false }: ChatListingContextBarProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const reducedMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const toggleCollapsed = () => {
    if (Platform.OS === 'ios' && !reducedMotion) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'),
      );
    }
    setCollapsed((c) => !c);
  };

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
          accessibilityLabel={t('inbox.linkedListing', { title, price, availability })}
          accessibilityHint={t('inbox.listingHint')}
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
              <View style={styles.availabilityDot} />
              <Text style={styles.availability}>{availability}</Text>
            </View>
          </View>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={toggleCollapsed}
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand listing actions' : 'Collapse listing actions'}
          style={styles.collapseBtn}
        >
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={18}
            color={colors.textSecondary}
          />
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
            <Ionicons name={primaryActionIcon} size={15} color={colors.textInverse} />
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
              <Ionicons name={secondaryActionIcon ?? 'chatbubbles-outline'} size={15} color={colors.textPrimary} />
              <Text style={styles.secondaryBtnText}>{secondaryActionLabel}</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 1,
    flex: 1 },
  collapseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.full },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  thumbFallback: {
    justifyContent: 'center',
    alignItems: 'center' },
  thumbFallbackText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    letterSpacing: 0.8 },
  info: {
    flex: 1,
    gap: 3 },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1 },
  price: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary },
  availabilityDot: {
    width: 3,
    height: 3,
    borderRadius: Radius.full,
    backgroundColor: colors.textMuted },
  availability: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textMuted },
  actionsRow: {
    flexDirection: 'row',
    gap: Space.sm },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 1,
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: colors.textPrimary },
  primaryBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textInverse },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 1,
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  secondaryBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary } });
