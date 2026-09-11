import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, ViewStyle, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import Reanimated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, IconGrammar, Control, Stroke, AvatarSize, ProfileLayout } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { FACE_FOCAL_POINT } from '../../utils/media';
import { AnimatedPressable } from '../AnimatedPressable';
import { Video, ResizeMode } from '../compat/Video';

interface FlagshipProfileMediaProps {
  coverUri?: string | null;
  avatarUri?: string | null;
  coverVideoUri?: string | null;
  isSelf?: boolean;
  onEditCover?: () => void;
  onEditAvatar?: () => void;
  isUploadingCover?: boolean;
  isUploadingAvatar?: boolean;
  /** Real byte progress 0–1 for the cover upload — drives the determinate ring. */
  coverUploadProgress?: number;
  /** Real byte progress 0–1 for the avatar upload — drives the determinate ring. */
  avatarUploadProgress?: number;
  style?: ViewStyle;
  cacheBuster?: string;
  coverOnly?: boolean;
  coverHeight?: number;
  coverError?: string | null;
  onRetryCover?: () => void;
  onRevertCover?: () => void;
}

export function FlagshipProfileMedia({
  coverUri,
  avatarUri,
  coverVideoUri,
  isSelf = false,
  onEditCover,
  onEditAvatar,
  isUploadingCover = false,
  isUploadingAvatar = false,
  coverUploadProgress,
  avatarUploadProgress,
  style,
  cacheBuster,
  coverOnly = false,
  coverHeight = ProfileLayout.coverHeight,
  coverError = null,
  onRetryCover,
  onRevertCover }: FlagshipProfileMediaProps) {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  // Rings stay mounted briefly after the upload finishes so the completion
  // fade reads as a transition, not a vanish.
  const showCoverRing = useLingeringActive(isUploadingCover);
  const showAvatarRing = useLingeringActive(isUploadingAvatar);
  const effectiveCover = coverVideoUri || coverUri;
  const hasCover = Boolean(effectiveCover);
  const showCoverError = coverError != null && !isUploadingCover;
  // expo-video has known stability issues on web (null references in VideoView,
  // player initialization failures). Fall back to static image on web.
  const showVideo = coverVideoUri != null && Platform.OS !== 'web';
  // On web, prefer the static cover image over the video URI.
  const staticCover = Platform.OS === 'web' ? (coverUri ?? coverVideoUri) : effectiveCover;

  return (
    <View style={[styles.root, { width: screenWidth }, style]}>
      {/* Cover */}
      <View style={[styles.coverWrap, { height: coverHeight, width: screenWidth }]}>
        {showVideo ? (
          <Video
            source={{ uri: coverVideoUri }}
            style={[styles.coverImage, { height: coverHeight, width: screenWidth }]}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
            accessibilityRole="image"
            accessibilityLabel="Profile cover video"
          />
        ) : hasCover ? (
          <CachedImage
            uri={staticCover!}
            style={[styles.coverImage, { height: coverHeight, width: screenWidth }]}
            contentFit="cover"
            transition={Motion.transitions.mediaLoad.duration}
            cacheBuster={cacheBuster}
            accessibilityRole="image"
            accessibilityLabel="Profile cover photo"
          />
        ) : (
          <ImageEmptyGraphic
            icon="image-outline"
            width={screenWidth}
            height={coverHeight}
            style={styles.coverFallback}
            accessibilityElementsHidden
          />
        )}

        {/* Bottom gradient for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)']}
          style={styles.coverGradient}
          accessibilityElementsHidden
        />

        {/* Edit cover control — compact camera icon button */}
        {isSelf && onEditCover && !showCoverError && (
          <AnimatedPressable
            style={styles.editCoverBtn}
            onPress={onEditCover}
            activeOpacity={0.85}
            hapticFeedback="light"
            disabled={isUploadingCover}
            accessibilityLabel="Change profile cover"
            accessibilityRole="button"
            accessibilityHint="Opens your photo library to choose a new cover image"
          >
            <View style={styles.editCoverVisible}>
              {showCoverRing ? (
                <UploadProgressRing
                  progress={coverUploadProgress}
                  active={isUploadingCover}
                  size={28}
                />
              ) : (
                <Ionicons name="image-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} />
              )}
            </View>
          </AnimatedPressable>
        )}

        {/* Cover upload failure controls */}
        {isSelf && showCoverError && (
          <View style={styles.coverErrorRow}>
            <Text style={styles.coverErrorText} numberOfLines={1}>Cover upload failed</Text>
            <View style={styles.coverErrorActions}>
              {onRetryCover && (
                <Pressable
                  style={styles.coverErrorBtn}
                  onPress={onRetryCover}
                  hitSlop={8}
                  accessibilityLabel="Retry cover upload"
                  accessibilityRole="button"
                >
                  <Text style={styles.coverErrorBtnText}>Retry</Text>
                </Pressable>
              )}
              {onRevertCover && (
                <Pressable
                  style={styles.coverErrorBtn}
                  onPress={onRevertCover}
                  hitSlop={8}
                  accessibilityLabel="Revert cover"
                  accessibilityRole="button"
                >
                  <Text style={styles.coverErrorBtnText}>Revert</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Avatar */}
      {!coverOnly && (
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            {avatarUri ? (
              <CachedImage
                uri={avatarUri}
                style={styles.avatarImage}
                contentFit="cover"
                transition={Motion.transitions.mediaLoad.duration}
                focalPoint={FACE_FOCAL_POINT}
                cacheBuster={cacheBuster}
                accessibilityRole="image"
                accessibilityLabel="Profile avatar"
              />
            ) : (
              <View style={[styles.avatarImage, styles.avatarFallback]} accessibilityElementsHidden>
                <LinearGradient
                  colors={isDark
                    ? ['#1F1F1F', '#161616']
                    : ['#F0EBE6', '#E2DDD6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons
                  name="person"
                  size={IconGrammar.hero}
                  color={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)'}
                />
              </View>
            )}

            {isSelf && onEditAvatar && (
              <AnimatedPressable
                style={styles.editAvatarBtn}
                onPress={onEditAvatar}
                activeOpacity={0.85}
                hapticFeedback="light"
                disabled={isUploadingAvatar}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Change profile avatar"
                accessibilityRole="button"
                accessibilityHint="Opens your camera or photo library to choose a new avatar"
              >
                {showAvatarRing ? (
                  <UploadProgressRing
                    progress={avatarUploadProgress}
                    active={isUploadingAvatar}
                    size={20}
                  />
                ) : (
                  <Ionicons name="camera" size={IconGrammar.badge} color={colors.scrimTextPrimary} />
                )}
              </AnimatedPressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const DEFAULT_COVER_H = ProfileLayout.coverHeight;
const AVATAR_SIZE = AvatarSize.xl;

// ── Upload progress ring ─────────────────────────────────────────────
// Determinate byte-progress indicator — same grammar as the creator
// recording ring: SVG circle, round-capped arc starting at 12 o'clock,
// driven by the transport's real progress (0–1). Fades out on completion;
// no badge, no fake indeterminate spin.

const RING_FADE_IN_MS = 120;
const RING_FADE_OUT_MS = 220;

const ReanimatedSvgCircle = Reanimated.createAnimatedComponent(SvgCircle);

export interface UploadProgressRingProps {
  /** Byte progress 0–1 from the upload transport. */
  progress?: number;
  /** While false the ring fades out (completion transition). */
  active: boolean;
  /** Outer diameter in pt (default 28). */
  size?: number;
  /** Arc colour (default white — legible over media). */
  color?: string;
  /** Background disc fill (default rgba(0,0,0,0.35)). */
  trackColor?: string;
  /** Screen-reader label for the ring (default 'Uploading'). */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function UploadProgressRing({
  progress = 0,
  active,
  size = 28,
  color = '#FFFFFF',
  trackColor = 'rgba(0,0,0,0.35)',
  accessibilityLabel = 'Uploading',
  style }: UploadProgressRingProps) {
  const stroke = size >= 24 ? 2.5 : 2;
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  const opacity = useSharedValue(active ? 1 : 0);
  const dashOffset = useSharedValue(circumference * (1 - clamped));

  React.useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, {
      duration: active ? RING_FADE_IN_MS : RING_FADE_OUT_MS });
  }, [active, opacity]);

  React.useEffect(() => {
    dashOffset.value = withTiming(circumference * (1 - clamped), { duration: 120 });
  }, [clamped, circumference, dashOffset]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: dashOffset.value }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View
      style={[{ width: size, height: size }, fadeStyle, style]}
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 1, now: Math.round(progress * 100) }}
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} fill={trackColor} />
        <ReanimatedSvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={arcProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </Reanimated.View>
  );
}

/**
 * Keeps a flag true for a short window after `active` falls false — lets a
 * progress ring fade out on completion instead of vanishing mid-frame.
 */
export function useLingeringActive(active: boolean, lingerMs = RING_FADE_OUT_MS + 60): boolean {
  const [shown, setShown] = React.useState(active);
  React.useEffect(() => {
    if (active) {
      setShown(true);
      return;
    }
    if (!shown) return;
    const t = setTimeout(() => setShown(false), lingerMs);
    return () => clearTimeout(t);
  }, [active, shown, lingerMs]);
  return shown;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    width: '100%' },
  coverWrap: {
    width: '100%',
    height: DEFAULT_COVER_H,
    position: 'relative',
    overflow: 'hidden' },
  coverImage: {
    width: '100%',
    height: DEFAULT_COVER_H },
  coverFallback: {
    backgroundColor: colors.surfaceAlt },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100 },
  editCoverBtn: {
    position: 'absolute',
    right: Space.md,
    bottom: Space.smMd,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  editCoverVisible: {
    width: 34,
    height: 34,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(255,255,255,0.2)' },
  coverErrorRow: {
    position: 'absolute',
    right: Space.md,
    bottom: Space.smMd,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg },
  coverErrorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  coverErrorActions: {
    flexDirection: 'row',
    gap: Space.sm },
  coverErrorBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    minHeight: Control.hit,
    justifyContent: 'center' },
  coverErrorBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary },
  avatarRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginTop: -(AVATAR_SIZE / 2) },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis * 2,
    borderColor: colors.background,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative' },
  avatarImage: {
    width: AVATAR_SIZE - Stroke.emphasis * 2 * 2,
    height: AVATAR_SIZE - Stroke.emphasis * 2 * 2,
    borderRadius: Radius.full },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  editAvatarBtn: {
    position: 'absolute',
    right: Space.xs / 2,
    bottom: Space.xs / 2,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.emphasis,
    borderColor: colors.background } });
