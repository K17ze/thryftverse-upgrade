import React from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { AnimatedPressable } from '../AnimatedPressable';
import { FlagshipProfileMedia } from '../flagship';
import { UploadProgressRing } from '../flagship/FlagshipProfileMedia';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { isVideoUri } from '../../utils/media';
import type { ProfileMediaState } from '../../hooks/useProfileMediaUpload';
import { COVER_HEIGHT } from '../../hooks/myprofile';

export interface ProfileHeaderHeroProps {
  coverMedia: string;
  coverState: ProfileMediaState;
  avatarState: ProfileMediaState;
  insetsTop: number;
  scrollY: SharedValue<number>;
  username: string;
  onSettings: () => void;
  onShare: () => void;
  onEditCover: () => void;
  onRetryCover: () => void;
  onRevertCover: () => void;
}

/**
 * Cover/header region — full-width cover media, floating personalisation
 * controls (settings, share), cover edit/retry/revert with UploadProgressRing,
 * and the collapsed scroll header. Extracted from MyProfileScreen.
 */
export function ProfileHeaderHero({
  coverMedia,
  coverState,
  avatarState,
  insetsTop,
  scrollY,
  username,
  onSettings,
  onShare,
  onEditCover,
  onRetryCover,
  onRevertCover }: ProfileHeaderHeroProps) {
  const { colors } = useAppTheme();
  const { t: tt } = useAppTranslation('myProfile');
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const coverStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-100, 0, COVER_HEIGHT],
      [-50, 0, -COVER_HEIGHT],
      Extrapolation.CLAMP
    );
    const scale = interpolate(scrollY.value, [-100, 0], [1.25, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }] };
  });

  const coverActionStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COVER_HEIGHT],
          [0, -COVER_HEIGHT],
          Extrapolation.CLAMP
        ) },
    ] }));

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }] };
  });

  const headerOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [COVER_HEIGHT - 88, COVER_HEIGHT - 44],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <>
      {/* ── 1. FULL-WIDTH COVER ── */}
      <Reanimated.View style={[styles.coverWrap, coverStyle]}>
        <FlagshipProfileMedia
          coverUri={coverMedia}
          coverVideoUri={isVideoUri(coverMedia) ? coverMedia : undefined}
          isSelf
          coverOnly
          coverHeight={COVER_HEIGHT}
          isUploadingCover={coverState.status === 'uploading'}
          isUploadingAvatar={avatarState.status === 'uploading'}
          coverUploadProgress={coverState.progress}
          avatarUploadProgress={avatarState.progress}
          style={{ width: '100%' }}
        />
        {/* Top gradient fade — improves floating control contrast over any cover media */}
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.12)', 'transparent']}
          style={styles.coverTopFade}
          pointerEvents="none"
        />
        {/* Subtle bottom fade around the avatar seam — no hard dark strip */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.10)']}
          style={styles.coverBottomFade}
          pointerEvents="none"
        />
      </Reanimated.View>

      {/* ── 2. FLOATING PERSONALISATION, SHARE AND SETTINGS ── */}
      <Reanimated.View pointerEvents="box-none" style={[styles.coverActionLayer, coverActionStyle]}>
        <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insetsTop + 6, 14) }, topUtilityStyle]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            onPress={onSettings}
            accessibilityLabel={tt('accessibility.openSettings')}
            accessibilityRole="button"
            accessibilityHint={tt('accessibility.openSettingsHint')}
          >
            <View style={styles.topUtilityVisible}>
              <Ionicons name="settings-outline" size={22} color={colors.scrimTextPrimary} aria-hidden={true} />
            </View>
          </AnimatedPressable>

          <View style={styles.topUtilityRight}>
            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              onPress={onShare}
              accessibilityLabel={tt('accessibility.shareProfile')}
              accessibilityRole="button"
              accessibilityHint={tt('accessibility.shareProfileHint')}
            >
              <View style={styles.topUtilityVisible}>
                <Ionicons name="share-outline" size={18} color={colors.scrimTextPrimary} aria-hidden={true} />
              </View>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {coverState.status === 'failed' ? (
          <View style={styles.coverFailure}>
            <View style={styles.coverFailureCopy}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
              <Text style={styles.coverFailureText} numberOfLines={1} maxFontSizeMultiplier={2}>
                {coverState.error || tt('cover.uploadFailed')}
              </Text>
            </View>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={onRetryCover}
              accessibilityRole="button"
              accessibilityLabel={tt('accessibility.retryCoverUpload')}
              hitSlop={5}
            >
              <Text style={styles.coverFailureActionText}>{tt('cover.retry')}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={onRevertCover}
              accessibilityRole="button"
              accessibilityLabel={tt('accessibility.cancelCoverChange')}
              hitSlop={5}
            >
              <Text style={styles.coverFailureActionText}>{tt('cover.cancel')}</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <AnimatedPressable
            style={styles.coverEditTarget}
            onPress={onEditCover}
            hapticFeedback="light"
            disabled={coverState.status === 'uploading'}
            accessibilityRole="button"
            accessibilityLabel={
              coverState.status === 'uploading'
                ? tt('accessibility.uploadingCover')
                : tt('accessibility.changeCover')
            }
            accessibilityState={{ disabled: coverState.status === 'uploading', busy: coverState.status === 'uploading' }}
          >
            <View style={styles.coverEditVisible}>
              {coverState.status === 'uploading' ? (
                <UploadProgressRing
                  progress={coverState.progress}
                  active={coverState.status === 'uploading'}
                  size={28}
                />
              ) : (
                <Ionicons name="image-outline" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
              )}
            </View>
          </AnimatedPressable>
        )}
      </Reanimated.View>

      {/* ── COLLAPSED SCROLL HEADER ── */}
      <Reanimated.View style={[styles.floatingHeader, { paddingTop: insetsTop }, headerOpacityStyle]} pointerEvents="none">
        <View style={{ flex: 1 }} />
        <Text style={styles.floatingHeaderTitle} numberOfLines={1} ellipsizeMode="tail">{username}</Text>
        <View style={{ flex: 1 }} />
      </Reanimated.View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Cover
    coverWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: COVER_HEIGHT,
      zIndex: 0,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    // Cover gradient fades — match the public ProfileHero treatment for control
    // contrast and a premium authored cover. Top fade improves floating button
    // legibility; bottom fade softens the avatar seam.
    coverTopFade: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 80 },
    coverBottomFade: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 40 },
    coverActionLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: COVER_HEIGHT,
      zIndex: 8 },
    topUtilityRow: {
      position: 'absolute',
      left: Space.md - 2,
      right: Space.md - 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between' },
    topUtilityRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    topUtilityIconBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    topUtilityVisible: {
      width: Space.xl - 2,
      height: Space.xl - 2,
      borderRadius: RadiusRoleValue.standalonePanel,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
      borderColor: colors.scrimTextTertiary },
    coverEditTarget: {
      position: 'absolute',
      right: Space.md - 2,
      bottom: Space.sm,
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    coverEditVisible: {
      width: Space.xl + 2,
      height: Space.xl + 2,
      borderRadius: RadiusRoleValue.dominantPanel,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
      borderColor: colors.scrimTextTertiary },
    coverFailure: {
      position: 'absolute',
      left: Space.md - 2,
      right: Space.md - 2,
      bottom: Space.sm,
      minHeight: Control.hit,
      paddingLeft: Space.smMd,
      paddingRight: Space.xs + 1,
      borderRadius: RadiusRoleValue.sheetDialog,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.overlay },
    coverFailureCopy: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 3 },
    coverFailureText: {
      flexShrink: 1,
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.scrimTextPrimary },
    coverFailureAction: {
      minWidth: Space.xxl + 4,
      minHeight: Space.xl + 2,
      paddingHorizontal: Space.sm,
      alignItems: 'center',
      justifyContent: 'center' },
    coverFailureActionText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.scrimTextPrimary },

    // Collapsed header
    floatingHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      elevation: 4,
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.background,
      borderBottomColor: colors.border },
    floatingHeaderTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.priceList.letterSpacing,
      color: colors.textPrimary } });
}
