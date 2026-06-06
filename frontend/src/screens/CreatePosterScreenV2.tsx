import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Dimensions,
  StatusBar,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';

import { useAppTheme } from '../theme/ThemeContext';

import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useToast } from '../context/ToastContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W - 40, 360);
const CANVAS_H = CANVAS_W * (16 / 9);

type Props = StackScreenProps<RootStackParamList, 'CreatePoster'>;

export default function CreatePosterScreenV2({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const [phase, setPhase] = useState<'landing' | 'editing' | 'preview'>('landing');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<string[]>([]);

  const loadRecentPhotos = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setImageUri(result.assets[0].uri);
        setPhase('editing');
        setHasChanges(true);
      }
    } catch {
      show('Could not open gallery.', 'error');
    }
  }, [show]);

  const openCamera = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        show('Camera permission required.', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setImageUri(result.assets[0].uri);
        setPhase('editing');
        setHasChanges(true);
      }
    } catch {
      show('Could not open camera.', 'error');
    }
  }, [show]);

  const handleClose = () => {
    if (hasChanges) {
      Alert.alert('Discard changes?', 'Your poster will not be saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  if (phase === 'landing') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable onPress={handleClose} style={styles.iconBtn} activeOpacity={0.7} scaleValue={0.9} hapticFeedback="light">
            <Ionicons name="close" size={26} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Create poster</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.landingBody}>
          <View style={styles.canvasPlaceholder}>
            <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.canvasTitle}>Start creating</Text>
            <Text style={styles.canvasSubtitle}>Choose a photo or start from scratch</Text>
          </View>

          <View style={styles.actionsRow}>
            <ActionButton icon="images-outline" label="Gallery" onPress={loadRecentPhotos} />
            <ActionButton icon="camera-outline" label="Camera" onPress={openCamera} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'editing') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable onPress={handleClose} style={styles.iconBtn} activeOpacity={0.7} scaleValue={0.9} hapticFeedback="light">
            <Ionicons name="close" size={26} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Edit</Text>
          <AnimatedPressable
            onPress={() => setPhase('preview')}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
          >
            <Text style={styles.nextText}>Preview</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.editorBody}>
          <View style={[styles.canvas, { width: CANVAS_W, height: CANVAS_H }]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={styles.emptyCanvas}>
                <Ionicons name="color-wand-outline" size={32} color={Colors.textMuted} />
              </View>
            )}
            {caption ? (
              <View style={styles.captionOverlay}>
                <Text style={styles.captionText}>{caption}</Text>
              </View>
            ) : null}
          </View>
        </View>

      </SafeAreaView>
    );
  }

  // preview
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.topBar}>
        <AnimatedPressable onPress={() => setPhase('editing')} style={styles.iconBtn} activeOpacity={0.7} scaleValue={0.9} hapticFeedback="light">
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Preview</Text>
        <AnimatedPressable
          onPress={() => {
            show('Draft saved locally', 'info');
            navigation.goBack();
          }}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="medium"
        >
          <Text style={[styles.nextText, styles.nextTextPrimary]}>Save</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.previewBody}>
        <View style={[styles.canvas, { width: CANVAS_W, height: CANVAS_H }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.emptyCanvas}>
              <Ionicons name="color-wand-outline" size={32} color={Colors.textMuted} />
            </View>
          )}
          {caption ? (
            <View style={styles.captionOverlay}>
              <Text style={styles.captionText}>{caption}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const FILTERS = [
  { key: 'normal', label: 'Normal' },
  { key: 'bw', label: 'B&W' },
  { key: 'warm', label: 'Warm' },
  { key: 'cool', label: 'Cool' },
];

function ActionButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <AnimatedPressable style={styles.actionBtn} onPress={onPress} activeOpacity={0.7} scaleValue={0.95} hapticFeedback="light">
      <View style={styles.actionCircle}>
        <Ionicons name={icon as any} size={28} color={Colors.textPrimary} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: 10,
  },
  topTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  nextTextPrimary: {
    color: Colors.brand,
  },
  landingBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    gap: Space.xl,
  },
  canvasPlaceholder: {
    width: CANVAS_W,
    height: CANVAS_H,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  canvasTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
  },
  canvasSubtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Space.lg,
  },
  actionBtn: {
    alignItems: 'center',
    gap: Space.sm,
  },
  actionCircle: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
  },
  editorBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  emptyCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  captionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textInverse,
    textAlign: 'center',
  },
  toolbar: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  toolbarLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  filterChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.textInverse,
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
