import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Colors } from '../constants/colors';
import { Type, Space, Radius, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { uploadMedia } from '../services/mediaUpload';
import { createLookOnApi } from '../services/looksApi';
import { LookMediaComposer, OutfitTag } from '../components/look/LookMediaComposer';
import { OutfitPieceEditor } from '../components/look/OutfitPieceEditor';

type NavT = StackNavigationProp<RootStackParamList>;

type Visibility = 'public' | 'private';

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'public', label: 'Public', icon: 'globe-outline' },
  { value: 'private', label: 'Private', icon: 'lock-closed-outline' },
];

export default function CreateLookScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const reducedMotion = useReducedMotion();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<OutfitTag[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [isPublishing, setIsPublishing] = useState(false);

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

      setIsPublishing(true);
      haptic.medium();
      try {
        const mediaUrl = await uploadMedia(imageUri, 'looks');
        const lookId = `look_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const internalTitle =
          caption
            .trim()
            .split('\n')
            .find(Boolean)
            ?.slice(0, 120)
          || 'Untitled Look';
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
    [imageUri, caption, tags, visibility, haptic, show, navigation]
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
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Create Look</Text>
        <View style={styles.headerRight}>
          {isPublishing ? (
            <ActivityIndicator size="small" color={Colors.brand} />
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
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
              placeholderTextColor={Colors.textMuted}
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
                      color={isActive ? Colors.brand : Colors.textSecondary}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  headerRight: {
    minWidth: 60,
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
    color: Colors.textPrimary,
  },
  captionInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    fontSize: 16,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    minHeight: 80,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  charCount: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
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
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  audienceBtnActive: {
    borderColor: Colors.brand,
    backgroundColor: 'rgba(99,102,241,0.06)',
  },
  audienceBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  audienceBtnTextActive: {
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
  },
  publishSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
  },
  publishBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.4,
  },
  publishBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: '#fff',
  },
});