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
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen } from '../components/flagship';
import { Video, ResizeMode } from '../components/compat/Video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Props = StackScreenProps<RootStackParamList, 'ChatMediaPreview'>;

export default function ChatMediaPreviewScreen({ navigation, route }: Props) {
  const { mediaUri, mediaType = 'image' } = route.params;
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();

  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const hasUri = Boolean(mediaUri && mediaUri.length > 0);

  const renderMissingState = () => (
    <View style={styles.errorWrap}>
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
        <Pressable
          style={styles.mediaWrap}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Media preview"
          accessibilityRole="image"
        >
          {mediaType === 'video' ? renderVideo() : renderImage()}
        </Pressable>

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
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
});
