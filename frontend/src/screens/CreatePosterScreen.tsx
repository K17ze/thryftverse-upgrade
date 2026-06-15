import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Dimensions,
  StatusBar,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';

import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useToast } from '../context/ToastContext';
import { uploadMedia } from '../services/mediaUpload';
import { createPosterOnApi } from '../services/postersApi';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W - 40, 360);
const CANVAS_H = CANVAS_W * (16 / 9);

type Props = StackScreenProps<RootStackParamList, 'CreatePoster'>;

const TEXT_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55'];
const BG_COLORS = ['#1a1a1a', '#ffffff', '#ff3b30', '#ff9500', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#f2f2f2'];
const ALIGNMENTS: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];

export default function CreatePosterScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const [phase, setPhase] = useState<'landing' | 'editing' | 'preview'>('landing');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [hasChanges, setHasChanges] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showTextSheet, setShowTextSheet] = useState(false);

  const loadRecentPhotos = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { show('Photo library access required', 'error'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 0.85,
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
      if (status !== 'granted') { show('Camera permission required.', 'error'); return; }
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

  const startBlank = useCallback(() => {
    setImageUri(null);
    setBgColor(BG_COLORS[0]);
    setPhase('editing');
    setHasChanges(true);
  }, []);

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

  const handlePublish = async (status: 'draft' | 'published') => {
    if (!imageUri && !bgColor) {
      show('Add a photo or choose a background to continue.', 'error');
      return;
    }
    setIsPublishing(true);
    try {
      let mediaUrl: string | null = null;
      if (imageUri) {
        mediaUrl = await uploadMedia(imageUri, 'posters');
      }
      const posterId = `poster_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      await createPosterOnApi({
        id: posterId,
        mediaUrl: mediaUrl ?? '',
        caption: caption.trim(),
        textOverlay: caption.trim()
          ? { text: caption.trim(), color: textColor, position: 'bottom', alignment }
          : undefined,
        backgroundColor: bgColor ?? undefined,
        layout: imageUri ? 'single' : 'blank',
        status,
        expiryHours: 24,
      });
      show(status === 'published' ? 'Poster published' : 'Draft saved', 'success');
      navigation.goBack();
    } catch (e) {
      show(typeof e === 'object' && e && 'message' in e ? String((e as Error).message) : 'Failed to save poster', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const renderCanvas = () => (
    <View style={[styles.canvas, { width: CANVAS_W, height: CANVAS_H, backgroundColor: bgColor ?? Colors.surfaceAlt }]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={StyleSheet.absoluteFill} />
      )}
      {caption ? (
        <View style={[styles.captionOverlay, { justifyContent: 'flex-end' }]}>
          <Text style={[styles.captionText, { color: textColor, textAlign: alignment }]}>{caption}</Text>
        </View>
      ) : null}
    </View>
  );

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
          <View style={[styles.canvasPlaceholder, { width: CANVAS_W, height: CANVAS_H }]}>
            <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.canvasTitle}>Start creating</Text>
            <Text style={styles.canvasSubtitle}>Choose a photo, camera, or blank canvas</Text>
          </View>
          <View style={styles.actionsRow}>
            <ActionButton icon="images-outline" label="Gallery" onPress={loadRecentPhotos} />
            <ActionButton icon="camera-outline" label="Camera" onPress={openCamera} />
            <ActionButton icon="color-wand-outline" label="Blank" onPress={startBlank} />
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
          <AnimatedPressable onPress={() => setPhase('preview')} style={styles.iconBtn} activeOpacity={0.7} scaleValue={0.9} hapticFeedback="light">
            <Text style={styles.nextText}>Preview</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.editorBody}>
          {renderCanvas()}
        </View>

        <View style={styles.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.sm }}>
            <ToolButton icon="text-outline" label="Text" onPress={() => setShowTextSheet(true)} />
            {!imageUri && <ToolButton icon="color-palette-outline" label="Background" onPress={() => setShowTextSheet(true)} />}
            <ToolButton icon="refresh-outline" label="Replace" onPress={loadRecentPhotos} />
          </ScrollView>
        </View>

        {showTextSheet && (
          <View style={styles.textSheet}>
            <View style={styles.sheetHandle} />
            <TextInput
              style={styles.textInput}
              placeholder="Type your caption..."
              placeholderTextColor={Colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={200}
              autoFocus
            />
            <Text style={styles.charCount}>{caption.length}/200</Text>
            <View style={styles.colorRow}>
              <Text style={styles.sheetLabel}>Color</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TEXT_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setTextColor(c)} style={[styles.colorDot, { backgroundColor: c }, textColor === c && styles.colorDotActive]} />
                ))}
              </ScrollView>
            </View>
            <View style={styles.colorRow}>
              <Text style={styles.sheetLabel}>Align</Text>
              <View style={styles.alignRow}>
                {ALIGNMENTS.map((a) => (
                  <Pressable key={a} onPress={() => setAlignment(a)} style={[styles.alignBtn, alignment === a && styles.alignBtnActive]}>
                    <Ionicons name={`text-${a}` as any} size={18} color={alignment === a ? '#fff' : Colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </View>
            {!imageUri && (
              <View style={styles.colorRow}>
                <Text style={styles.sheetLabel}>Bg</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {BG_COLORS.map((c) => (
                    <Pressable key={c} onPress={() => setBgColor(c)} style={[styles.colorDot, { backgroundColor: c }, bgColor === c && styles.colorDotActive]} />
                  ))}
                </ScrollView>
              </View>
            )}
            <AnimatedPressable style={styles.doneBtn} onPress={() => setShowTextSheet(false)} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Done</Text>
            </AnimatedPressable>
          </View>
        )}
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
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.previewBody}>
        {renderCanvas()}
      </View>

      <View style={styles.publishBar}>
        <AnimatedPressable
          style={[styles.publishBtn, styles.publishBtnSecondary]}
          onPress={() => handlePublish('draft')}
          activeOpacity={0.85}
          disabled={isPublishing}
        >
          {isPublishing ? <ActivityIndicator size="small" color={Colors.textSecondary} /> : <Text style={styles.publishBtnSecondaryText}>Save Draft</Text>}
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.publishBtn}
          onPress={() => handlePublish('published')}
          activeOpacity={0.85}
          disabled={isPublishing}
        >
          {isPublishing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.publishBtnText}>Publish</Text>}
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

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

function ToolButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <AnimatedPressable style={styles.toolBtn} onPress={onPress} activeOpacity={0.7} scaleValue={0.95} hapticFeedback="light">
      <View style={styles.toolCircle}>
        <Ionicons name={icon as any} size={22} color={Colors.textPrimary} />
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
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
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: Space.sm,
  },
  toolBtn: {
    alignItems: 'center',
    gap: 4,
  },
  toolCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  textSheet: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Space.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Space.sm,
  },
  textInput: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
  },
  charCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  sheetLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    width: 40,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: 6,
  },
  colorDotActive: {
    borderColor: Colors.textPrimary,
  },
  alignRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  alignBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alignBtnActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  doneBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: Space.sm,
  },
  doneBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  publishBar: {
    flexDirection: 'row',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  publishBtn: {
    flex: 1,
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishBtnSecondary: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  publishBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  publishBtnSecondaryText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
