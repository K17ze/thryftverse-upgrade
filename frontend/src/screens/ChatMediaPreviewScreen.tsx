import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen } from '../components/flagship';
import { Video, ResizeMode } from '../components/compat/Video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Type, TypeStyles, Radius, Elevation } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'ChatMediaPreview'>;

export default function ChatMediaPreviewScreen({ navigation, route }: Props) {
  const { mediaUri, mediaType = 'image', senderLabel, timestamp } = route.params;
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const mediaSize = { width, height: height * 0.72 };

  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const hasUri = Boolean(mediaUri && mediaUri.length > 0);

  const renderMissingState = () => (
    <View style={[styles.errorWrap, mediaSize]}>
      <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.4)" />
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
          <Ionicons name="close" size={26} color="#fff" />
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    ...Elevation.subtle,
  },
  mediaWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: Type.subtitle.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: 'rgba(255,255,255,0.7)',
  },
  errorSub: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: 'rgba(255,255,255,0.4)',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    ...Elevation.subtle,
  },
  retryText: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: '#fff',
  },
  contextOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  contextSender: {
    fontSize: Type.subtitle.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  contextTime: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});