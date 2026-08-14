import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Type, Space, Radius, Typography, Stroke } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { uploadMedia } from '../services/mediaUpload';
import { createLookOnApi } from '../services/looksApi';
import { useStore } from '../store/useStore';
import { makeStableId } from '../utils/createStableId';
import { LookMediaComposer, OutfitTag } from '../components/look/LookMediaComposer';
import { OutfitPieceEditor } from '../components/look/OutfitPieceEditor';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type Visibility = 'public' | 'private';

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'public', label: 'Public', icon: 'globe-outline' },
  { value: 'private', label: 'Private', icon: 'lock-closed-outline' },
];

export default function CreateLookScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<OutfitTag[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [isPublishing, setIsPublishing] = useState(false);
  // Stable look id generated once per editing session so a publish retry
  // reuses the same id (idempotency) instead of creating a duplicate post.
  const lookIdRef = useRef<string>(makeStableId('look'));

  const allowNavigationRef = useRef(false);

  const isDirty = !!(imageUri || caption.trim() || tags.length > 0);

  const proceedWithNavigation = useCallback(
    (action?: Parameters<typeof navigation.dispatch>[0]) => {
      allowNavigationRef.current = true;
      if (action) {
        navigation.dispatch(action);
      } else {
        navigation.goBack();
      }
    },
    [navigation]
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: { preventDefault: () => void; data: { action: Parameters<typeof navigation.dispatch>[0] } }) => {
      if (allowNavigationRef.current || !isDirty) {
        return;
      }
      event.preventDefault();
      Alert.alert(
        'Discard changes?',
        'Your look has not been saved.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => proceedWithNavigation(event.data.action),
          },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty, proceedWithNavigation]);

  const handleTagsChange = useCallback((newTags: OutfitTag[]) => {
    setTags(newTags);
  }, []);

  const handlePublish = useCallback(
    async () => {
      if (!imageUri) {
        haptic.error();
        show('Add a photo first', 'error');
        return;
      }

      if (!currentUser?.id) {
        haptic.light();
        show('Sign in to create a Look', 'info');
        navigation.navigate('Login');
        return;
      }

      setIsPublishing(true);
      haptic.medium();
      try {
        const uploaded = await uploadMedia(imageUri, 'looks');
        const mediaUrl = uploaded.publicUrl;
        const lookId = lookIdRef.current;
        const internalTitle =
          caption
            .trim()
            .split('\n')
            .find(Boolean)
            ?.slice(0, 120)
          || (currentUser.username
            ? `Look by @${currentUser.username}`
            : 'Untitled Look');
        await createLookOnApi({
          id: lookId,
          title: internalTitle,
          caption: caption.trim(),
          mediaUrl,
          visibility,
          tags: tags.map((t) => ({
            id: t.id,
            label: t.label,
            listingId: t.listingId,
            x: t.x,
            y: t.y,
          })),
          status: 'published',
        });

        allowNavigationRef.current = true;
        show('Look published', 'success');
        haptic.success();
        navigation.replace('LookDetail', { lookId });
      } catch {
        show('Failed to publish look', 'error');
        haptic.error();
      } finally {
        setIsPublishing(false);
      }
    },
    [imageUri, caption, tags, visibility, haptic, show, navigation, currentUser]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Create Look</Text>
        <View style={styles.headerRight}>
          {isPublishing ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : null}
        </View>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          {/* Media Composer */}
          <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
            <LookMediaComposer
              imageUri={imageUri}
              onImageChange={setImageUri}
              tags={tags}
              onTagsChange={handleTagsChange}
              editable
            />
          </Reanimated.View>

          {/* Caption */}
          <Reanimated.View
            entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(60)}
            style={styles.section}
          >
            <Text style={styles.sectionLabel}>Caption</Text>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Share the story behind this outfit..."
              placeholderTextColor={colors.textMuted}
              maxLength={500}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Look caption"
            />
            <Text style={styles.charCount}>{caption.length}/500</Text>
          </Reanimated.View>

          {/* Outfit Pieces */}
          {tags.length > 0 && (
            <Reanimated.View
              entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(100)}
              style={styles.section}
            >
              <Text style={styles.sectionLabel}>Outfit Pieces</Text>
              <OutfitPieceEditor tags={tags} onTagsChange={handleTagsChange} />
            </Reanimated.View>
          )}

          {/* Audience */}
          <Reanimated.View
            entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(140)}
            style={styles.section}
          >
            <Text style={styles.sectionLabel}>Audience</Text>
            <View style={styles.audienceRow}>
              {VISIBILITY_OPTIONS.map((opt) => {
                const isActive = visibility === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.audienceBtn, isActive && styles.audienceBtnActive]}
                    onPress={() => {
                      setVisibility(opt.value);
                      haptic.light();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set audience to ${opt.label}`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={isActive ? colors.brand : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.audienceBtnText,
                        isActive && styles.audienceBtnTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Reanimated.View>

          {/* Publish Button */}
          <Reanimated.View
            entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(180)}
            style={styles.publishSection}
          >
            <AnimatedPressable
              style={[styles.publishBtn, !imageUri && styles.publishBtnDisabled]}
              onPress={handlePublish}
              activeOpacity={0.85}
              disabled={!imageUri || isPublishing}
              accessibilityRole="button"
              accessibilityLabel="Publish look"
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.publishBtnText}>Publish Look</Text>
              )}
            </AnimatedPressable>
          </Reanimated.View>

          <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: Stroke.standard,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  headerRight: {
    minWidth: Space.xxl + Space.lg,
    alignItems: 'flex-end',
  },
  scrollContent: {
    paddingBottom: Space.xl,
  },
  section: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  captionInput: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    minHeight: Space.xxl + Space.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  charCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    textAlign: 'right',
  },
  audienceRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  audienceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  audienceBtnActive: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(99,102,241,0.06)',
  },
  audienceBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  audienceBtnTextActive: {
    color: colors.brand,
    fontFamily: Typography.family.semibold,
  },
  publishSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
  },
  publishBtn: {
    backgroundColor: colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: Space.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.4,
  },
  publishBtnText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
    color: '#fff',
  },
  });
}