import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen } from '../components/flagship';
import { Video, ResizeMode } from '../components/compat/Video';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Props = StackScreenProps<RootStackParamList, 'ChatMediaPreview'>;

export default function ChatMediaPreviewScreen({ navigation, route }: Props) {
  const { mediaUri, mediaType = 'image' } = route.params;
  const haptic = useHaptic();

  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const hasUri = Boolean(mediaUri && mediaUri.length > 0);

  const renderMissingState = () => (
    <View style={styles.errorWrap}>
      <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.4)" />
      <Text style={styles.errorText}>Media unavailable</Text>
      <Text style={styles.errorSub}>This media could not be loaded.</Text>
    </View>
  );

  const renderImage = () => {
    if (!hasUri || imageError) {
      return renderMissingState();
    }
    return (
      <CachedImage
        uri={mediaUri}
        style={styles.mediaImage}
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
        style={styles.mediaImage}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping
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
          style={styles.closeBtn}
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
        <Pressable
          style={styles.mediaWrap}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Media preview"
          accessibilityRole="image"
        >
          {mediaType === 'video' ? renderVideo() : renderImage()}
        </Pressable>

        {/* Bottom actions */}
        <View style={styles.bottomBar}>
          <AnimatedPressable
            style={styles.bottomBtn}
            onPress={() => {
              haptic.light();
              // Future: save to gallery when permissions allow
            }}
            activeOpacity={0.7}
            scaleValue={0.92}
            accessibilityLabel="Save to gallery"
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={24} color="#fff" />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.bottomBtn}
            onPress={() => {
              haptic.light();
              // Future: share media when system share is available
            }}
            activeOpacity={0.7}
            scaleValue={0.92}
            accessibilityLabel="Share media"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={24} color="#fff" />
          </AnimatedPressable>
        </View>
      </View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaWrap: {
    width: SCREEN_W,
    height: SCREEN_H * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.7,
  },
  errorWrap: {
    width: SCREEN_W,
    height: SCREEN_H * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.7)',
  },
  errorSub: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.4)',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  bottomBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
