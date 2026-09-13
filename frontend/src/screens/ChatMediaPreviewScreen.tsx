import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppIcon } from '../components/common/AppIcon';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen } from '../components/flagship';
import { Video, ResizeMode } from '../components/compat/Video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Control, Radius, Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatMediaPreview'>;

export default function ChatMediaPreviewScreen({ navigation, route }: Props) {
  const { mediaUri, mediaType = 'image', senderLabel, timestamp } = route.params;
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const mediaSize = { width, height: height * 0.72 };

  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const hasUri = Boolean(mediaUri && mediaUri.length > 0);

  const renderMissingState = () => (
    <View style={[styles.errorWrap, mediaSize]}>
      <AppIcon name="image" size="display" color="scrimTextTertiary" accessible={false} />
      <Text style={styles.errorText}>Media unavailable</Text>
      <Text style={styles.errorSub}>This media could not be loaded.</Text>
      <AnimatedPressable
        style={styles.retryBtn}
        onPress={() => {
          setImageError(false);
          setVideoError(false);
        }}
        activeOpacity={0.7}
        scaleValue={0.95}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Retry loading media"
      >
        <Text style={styles.retryText}>Retry</Text>
      </AnimatedPressable>
    </View>
  );

  const renderImage = () => {
    if (!hasUri || imageError) {
      return renderMissingState();
    }
    return (
      <CachedImage
        uri={mediaUri}
        style={mediaSize}
        contentFit="contain"
        transition={200}
      />
    );
  };

  const renderVideo = () => {
    if (!hasUri || videoError) {
      return renderMissingState();
    }
    return (
      <Video
        source={{ uri: mediaUri }}
        style={mediaSize}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls
        onError={() => setVideoError(true)}
      />
    );
  };

  return (
    <FlagshipScreen scrollEnabled={false}>
      <View style={styles.backdrop}>
        {/* Close button */}
        <AnimatedPressable
          style={[styles.closeBtn, { top: Math.max(insets.top + 8, 12) }]}
          onPress={() => {
            haptic.light();
            navigation.goBack();
          }}
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityLabel="Close preview"
          accessibilityRole="button"
        >
          <AppIcon name="close" size={26} color="scrimTextPrimary" accessible={false} />
        </AnimatedPressable>

        {/* Media */}
        <View
          style={[styles.mediaWrap, mediaSize]}
          accessibilityLabel="Media preview"
          accessibilityRole="image"
        >
          {mediaType === 'video' ? renderVideo() : renderImage()}
        </View>

        {/* Context overlay */}
        {(senderLabel || timestamp) && (
          <View style={[styles.contextOverlay, { bottom: Math.max(insets.bottom + 24, 24) }]}>
            {senderLabel && (
              <Text style={styles.contextSender}>{senderLabel}</Text>
            )}
            {timestamp && (
              <Text style={styles.contextTime}>{timestamp}</Text>
            )}
          </View>
        )}

      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center' },
    closeBtn: {
      position: 'absolute',
      left: 12,
      zIndex: 10,
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center' },
    mediaWrap: {
      justifyContent: 'center',
      alignItems: 'center' },
    errorWrap: {
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.sm + Space.xs },
    errorText: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.scrimTextSecondary },
    errorSub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.scrimTextTertiary },
    retryBtn: {
      marginTop: Space.sm,
      minHeight: Control.hit,
      paddingHorizontal: Space.md,
      justifyContent: 'center',
      alignItems: 'center' },
    retryText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.scrimTextPrimary },
    contextOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      backgroundColor: colors.overlay },
    contextSender: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.scrimTextPrimary,
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3 },
    contextTime: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.scrimTextSecondary,
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3 } });
}