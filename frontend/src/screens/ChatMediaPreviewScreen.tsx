import React from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Props = StackScreenProps<RootStackParamList, 'ChatMediaPreview'>;

export default function ChatMediaPreviewScreen({ navigation, route }: Props) {
  const { mediaUri, mediaType = 'image' } = route.params;
  const haptic = useHaptic();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

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
          {mediaType === 'video' ? (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="play-circle" size={64} color="#fff" />
            </View>
          ) : (
            <CachedImage
              uri={mediaUri}
              style={styles.mediaImage}
              contentFit="contain"
            />
          )}
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
    </SafeAreaView>
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
  videoPlaceholder: {
    width: SCREEN_W,
    height: SCREEN_H * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
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
