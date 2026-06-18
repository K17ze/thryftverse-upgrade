import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  PanResponderGestureState,
  GestureResponderEvent,
  Animated as RNAnimated,
  TextInput,
  LayoutChangeEvent,
} from 'react-native';
import Reanimated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/colors';
import { Type, Space, Radius , Typography  } from '../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { uploadMedia } from '../services/mediaUpload';
import { createLookOnApi } from '../services/looksApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { CachedImage } from '../components/CachedImage';
import { Listing } from '../data/mockData';

type NavT = StackNavigationProp<RootStackParamList>;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PHOTO_H = SCREEN_W * 1.25;
const DRAWER_H = SCREEN_H * 0.55;

interface LookTag {
  id: string;
  x: number;
  y: number;
  label: string;
  listingId?: string;
  listingTitle?: string;
  listingPrice?: number;
  listingImage?: string;
  listingBrand?: string;
}

function TagDot() {
  const scale = useSharedValue(0);
  React.useEffect(() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }, [scale]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * 1.6 }], opacity: 0.35 }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={dotStyles.wrap} pointerEvents="none">
      <Reanimated.View style={[dotStyles.ring, ringStyle]} />
      <Reanimated.View style={[dotStyles.core, dotStyle]}>
        <View style={dotStyles.inner} />
      </Reanimated.View>
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.brand },
  core: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  inner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
});

export default function CreateLookScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings } = useBackendData();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<LookTag[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTagId, setEditorTagId] = useState<string | null>(null);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [photoSize, setPhotoSize] = useState({ width: SCREEN_W, height: PHOTO_H });
  const [isPicking, setIsPicking] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; tags?: string }>({});

  const drawerY = useRef(new RNAnimated.Value(DRAWER_H)).current;
  const backdropOpacity = useRef(new RNAnimated.Value(0)).current;

  const openEditor = useCallback((tagId: string) => {
    haptic.light();
    setEditorTagId(tagId);
    setShowEditor(true);
    setTagSearchQuery('');
    RNAnimated.parallel([
      RNAnimated.spring(drawerY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      RNAnimated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [haptic, drawerY, backdropOpacity]);

  const closeEditor = useCallback(() => {
    setShowEditor(false);
    setEditorTagId(null);
    RNAnimated.parallel([
      RNAnimated.spring(drawerY, { toValue: DRAWER_H, useNativeDriver: true, friction: 8 }),
      RNAnimated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [drawerY, backdropOpacity]);

  const handlePickImage = async (source: 'gallery' | 'camera') => {
    setIsPicking(true);
    try {
      if (source === 'gallery') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { show('Allow photo library access', 'error'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 5], quality: 0.92,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          setImageUri(result.assets[0].uri);
          setTags([]);
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { show('Allow camera access', 'error'); return; }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true, aspect: [4, 5], quality: 0.92,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          setImageUri(result.assets[0].uri);
          setTags([]);
        }
      }
    } finally { setIsPicking(false); }
  };

  const handlePhotoPress = (evt: GestureResponderEvent) => {
    if (showEditor) return;
    const { locationX, locationY } = evt.nativeEvent;
    const x = Math.min(Math.max(locationX / photoSize.width, 0), 1);
    const y = Math.min(Math.max(locationY / photoSize.height, 0), 1);
    haptic.medium();
    const newTag: LookTag = {
      id: `tag_${Date.now()}`, x, y, label: 'Product',
    };
    setTags((prev) => [...prev, newTag]);
    setActiveTagId(newTag.id);
    setTimeout(() => setActiveTagId(null), 800);
    openEditor(newTag.id);
  };

  const createTagPan = (tagId: string) => {
    let startX = 0, startY = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const tag = tags.find((t) => t.id === tagId);
        if (tag) { startX = tag.x; startY = tag.y; }
        setActiveTagId(tagId);
      },
      onPanResponderMove: (_evt, gesture: PanResponderGestureState) => {
        setTags((prev) => prev.map((t) => {
          if (t.id !== tagId) return t;
          return {
            ...t,
            x: Math.min(Math.max(startX + gesture.dx / photoSize.width, 0), 1),
            y: Math.min(Math.max(startY + gesture.dy / photoSize.height, 0), 1),
          };
        }));
      },
      onPanResponderRelease: () => { setActiveTagId(null); },
    });
  };

  const editorTag = tags.find((t) => t.id === editorTagId);

  const filteredListings = React.useMemo(() => {
    if (!tagSearchQuery.trim()) return listings.slice(0, 8);
    const q = tagSearchQuery.toLowerCase();
    return listings.filter((l) => l.title?.toLowerCase().includes(q) || l.brand?.toLowerCase().includes(q)).slice(0, 12);
  }, [tagSearchQuery, listings]);

  const handleSelectListing = (listing: Listing) => {
    if (!editorTagId) return;
    haptic.light();
    setTags((prev) => prev.map((t) =>
      t.id === editorTagId
        ? { ...t, listingId: listing.id, listingTitle: listing.title, listingPrice: listing.price, listingImage: listing.images?.[0], listingBrand: listing.brand, label: listing.title }
        : t
    ));
  };

  const handleUpdateLabel = (text: string) => {
    if (!editorTagId) return;
    setTags((prev) => prev.map((t) => t.id === editorTagId ? { ...t, label: text } : t));
  };

  const handleRemoveTag = () => {
    if (!editorTagId) return;
    haptic.medium();
    setTags((prev) => prev.filter((t) => t.id !== editorTagId));
    closeEditor();
  };

  const validate = (): boolean => {
    const nextErrors: { title?: string; tags?: string } = {};
    if (!title.trim()) nextErrors.title = 'Add a title for your look';
    if (!imageUri) nextErrors.title = nextErrors.title ?? 'Upload a photo to continue';
    if (tags.length === 0) nextErrors.tags = 'Tag at least one product';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const addUserLook = useStore((state) => state.addUserLook);
  const currentUser = useStore((state) => state.currentUser);

  const handleSubmit = async () => {
    if (!validate()) { haptic.error(); return; }
    if (!imageUri) return;
    setIsPublishing(true);
    haptic.medium();
    try {
      const mediaUrl = await uploadMedia(imageUri, 'looks');
      const lookId = addUserLook({
        title: title.trim(),
        coverImage: mediaUrl,
        items: tags.map((t) => ({
          id: t.id,
          label: t.label,
          x: t.x,
          y: t.y,
        })),
        creator: {
          name: currentUser?.username ?? 'you',
          avatar: currentUser?.avatar ?? undefined,
        },
        likes: 0,
        comments: 0,
      });
      await createLookOnApi({
        id: lookId,
        title: title.trim(),
        mediaUrl,
        tags: tags.map((t) => ({
          id: t.id,
          listingId: t.listingId,
          label: t.label,
          x: t.x,
          y: t.y,
        })),
        status: 'published',
      });
      show('Look published', 'success');
      navigation.navigate('LookDetail', { lookId });
    } catch (e) {
      show(typeof e === 'object' && e && 'message' in e ? String((e as Error).message) : 'Failed to publish look', 'error');
      haptic.error();
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={Colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      <ScreenHeader title="Create Look" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Photo Canvas */}
          <Reanimated.View entering={FadeInDown.duration(300)}>
            {!imageUri ? (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.placeholderTitle}>Add a photo to start tagging</Text>
                <Text style={styles.placeholderSub}>Portrait orientation works best</Text>
                <View style={styles.emptyActions}>
                  <AnimatedPressable style={styles.emptyActionBtn} onPress={() => handlePickImage('gallery')} activeOpacity={0.85}>
                    <Ionicons name="images-outline" size={18} color={Colors.brand} />
                    <Text style={styles.emptyActionText}>Gallery</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.emptyActionBtn} onPress={() => handlePickImage('camera')} activeOpacity={0.85}>
                    <Ionicons name="camera-outline" size={18} color={Colors.brand} />
                    <Text style={styles.emptyActionText}>Camera</Text>
                  </AnimatedPressable>
                </View>
              </View>
            ) : (
              <View style={styles.photoWrap}
                onLayout={(e: LayoutChangeEvent) => {
                  const { width, height } = e.nativeEvent.layout;
                  setPhotoSize({ width, height });
                }}
              >
                <Pressable onPress={isPreview ? undefined : handlePhotoPress} style={StyleSheet.absoluteFillObject}>
                  <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
                </Pressable>

                {tags.map((tag) => {
                  const isActive = activeTagId === tag.id;
                  const pan = createTagPan(tag.id);
                  return (
                    <View key={tag.id} style={[styles.tagWrap, { left: tag.x * photoSize.width, top: tag.y * photoSize.height }]} pointerEvents="box-none">
                      <View {...(isPreview ? {} : pan.panHandlers)} pointerEvents="auto" style={styles.tagDragArea}>
                        <TagDot />
                        {(isActive || tag.listingId || isPreview) && (
                          <Reanimated.View entering={FadeInDown.duration(180)} style={styles.tagPill}>
                            {tag.listingImage && <CachedImage uri={tag.listingImage} style={styles.tagPillImg} containerStyle={{ borderRadius: 4 }} contentFit="cover" />}
                            <View style={{ flex: 1, gap: 1 }}>
                              <Text style={styles.tagPillTitle} numberOfLines={1}>{tag.label}</Text>
                              {tag.listingPrice !== undefined && <Text style={styles.tagPillPrice}>£{tag.listingPrice}</Text>}
                            </View>
                          </Reanimated.View>
                        )}
                      </View>
                      {!isPreview && <Pressable style={styles.tagTapOverlay} onPress={() => openEditor(tag.id)} hitSlop={20} />}
                    </View>
                  );
                })}

                {!isPreview && (
                  <AnimatedPressable style={styles.changePhotoBtn} onPress={() => handlePickImage('gallery')} activeOpacity={0.85}>
                    <Ionicons name="refresh" size={14} color="#fff" />
                    <Text style={styles.changePhotoText}>Change</Text>
                  </AnimatedPressable>
                )}

                {tags.length === 0 && !isPreview && (
                  <View style={styles.tagHintOverlay} pointerEvents="none">
                    <Ionicons name="finger-print-outline" size={28} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.tagHintText}>Tap anywhere to tag a product</Text>
                  </View>
                )}

                {isPreview && (
                  <View style={styles.previewBadge} pointerEvents="none">
                    <Text style={styles.previewBadgeText}>Preview</Text>
                  </View>
                )}
              </View>
            )}
          </Reanimated.View>

          {/* Title */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(100)} style={{ marginTop: Space.md }}>
            <AppInput
              label="Look Title"
              placeholder="e.g. Weekend Layers"
              value={title}
              onChangeText={(t) => { setTitle(t); if (errors.title) setErrors((prev) => ({ ...prev, title: undefined })); }}
              errorText={errors.title}
            />
          </Reanimated.View>

          {errors.tags && (
            <Reanimated.View entering={FadeInDown.duration(200)}>
              <View style={styles.inlineErrorRow}>
                <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                <Text style={styles.inlineErrorText}>{errors.tags}</Text>
              </View>
            </Reanimated.View>
          )}

          {tags.length > 0 && (
            <Reanimated.View entering={FadeInDown.duration(250)}>
              <View style={styles.tagCountRow}>
                <Text style={styles.tagCountText}>{tags.length} product{tags.length === 1 ? '' : 's'} tagged</Text>
                <AnimatedPressable onPress={() => { setTags([]); haptic.medium(); }} activeOpacity={0.85}>
                  <Text style={styles.tagCountClear}>Clear all</Text>
                </AnimatedPressable>
              </View>
            </Reanimated.View>
          )}

          {/* Tagged product list */}
          {tags.length > 0 && (
            <Reanimated.View entering={FadeInDown.duration(250).delay(50)} style={{ marginTop: Space.md }}>
              <View style={styles.tagList}>
                {tags.map((tag) => (
                  <View key={tag.id} style={styles.tagListItem}>
                    {tag.listingImage ? (
                      <CachedImage uri={tag.listingImage} style={styles.tagListImg} containerStyle={{ borderRadius: Radius.sm }} contentFit="cover" />
                    ) : (
                      <View style={styles.tagListImgPlaceholder}><Ionicons name="pricetag" size={14} color={Colors.textMuted} /></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tagListLabel} numberOfLines={1}>{tag.label}</Text>
                      {tag.listingPrice !== undefined && <Text style={styles.tagListPrice}>£{tag.listingPrice}</Text>}
                    </View>
                    <AnimatedPressable onPress={() => openEditor(tag.id)} activeOpacity={0.85}>
                      <Ionicons name="create-outline" size={18} color={Colors.textMuted} />
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
            </Reanimated.View>
          )}

          {/* Preview toggle */}
          {imageUri && tags.length > 0 && (
            <Reanimated.View entering={FadeInDown.duration(200)} style={{ marginTop: Space.md }}>
              <AnimatedPressable
                style={styles.previewToggle}
                onPress={() => { setIsPreview((p) => !p); haptic.light(); }}
                activeOpacity={0.85}
              >
                <Ionicons name={isPreview ? 'create-outline' : 'eye-outline'} size={18} color={Colors.brand} />
                <Text style={styles.previewToggleText}>{isPreview ? 'Back to Edit' : 'Preview Look'}</Text>
              </AnimatedPressable>
            </Reanimated.View>
          )}

          <Reanimated.View entering={FadeInDown.duration(300).delay(200)} style={{ marginTop: Space.lg }}>
            <AppButton title={isPublishing ? 'Publishing...' : 'Post Look'} variant="primary" size="lg" onPress={handleSubmit} disabled={!imageUri || !title.trim() || isPublishing} />
          </Reanimated.View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Tag Editor Bottom Sheet */}
      {showEditor && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <RNAnimated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={showEditor ? 'auto' : 'none'}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeEditor} />
          </RNAnimated.View>

          <RNAnimated.View style={[styles.drawer, { transform: [{ translateY: drawerY }] }]} pointerEvents="auto">
            <View style={styles.handleRow}><View style={styles.handle} /></View>

            <View style={styles.editorHeader}>
              <Text style={styles.editorTitle}>Tag Product</Text>
              <AnimatedPressable style={styles.editorClose} onPress={closeEditor} activeOpacity={0.8}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </AnimatedPressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorScroll} keyboardShouldPersistTaps="handled">
              {editorTag?.listingId && (
                <Reanimated.View entering={FadeInDown.duration(200)} style={styles.selectedListingCard}>
                  <CachedImage uri={editorTag.listingImage ?? ''} style={styles.selectedListingImg} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
                  <View style={styles.selectedListingInfo}>
                    <Text style={styles.selectedListingBrand}>{editorTag.listingBrand}</Text>
                    <Text style={styles.selectedListingTitle} numberOfLines={1}>{editorTag.listingTitle}</Text>
                    <Text style={styles.selectedListingPrice}>£{editorTag.listingPrice}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                </Reanimated.View>
              )}

              <AppInput label="Display Label" placeholder="What you're wearing" value={editorTag?.label ?? ''} onChangeText={handleUpdateLabel} containerStyle={{ marginBottom: Space.sm }} />

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={Colors.textMuted} />
                <TextInput style={styles.searchInput} placeholder="Search listings to link..." placeholderTextColor={Colors.textMuted} value={tagSearchQuery} onChangeText={setTagSearchQuery} autoCapitalize="none" />
                {tagSearchQuery.length > 0 && (
                  <Pressable onPress={() => setTagSearchQuery('')}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable>
                )}
              </View>

              <Text style={styles.resultsLabel}>Select a listing</Text>
              {filteredListings.length === 0 ? (
                <View style={styles.emptyResults}>
                  <Ionicons name="search-outline" size={32} color={Colors.textMuted} />
                  <Text style={styles.emptyResultsText}>No listings found</Text>
                </View>
              ) : (
                <View style={styles.listingGrid}>
                  {filteredListings.map((listing) => (
                    <AnimatedPressable key={listing.id} style={[styles.listingCard, editorTag?.listingId === listing.id && styles.listingCardActive]} onPress={() => handleSelectListing(listing)} activeOpacity={0.9}>
                      <CachedImage uri={listing.images?.[0] ?? ''} style={styles.listingImg} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
                      <Text style={styles.listingBrand} numberOfLines={1}>{listing.brand}</Text>
                      <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
                      <Text style={styles.listingPrice}>£{listing.price}</Text>
                      {editorTag?.listingId === listing.id && (
                        <View style={styles.listingCheck}><Ionicons name="checkmark" size={12} color="#fff" /></View>
                      )}
                    </AnimatedPressable>
                  ))}
                </View>
              )}

              <AnimatedPressable style={styles.removeBtn} onPress={handleRemoveTag} activeOpacity={0.85}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                <Text style={styles.removeText}>Remove Tag</Text>
              </AnimatedPressable>
            </ScrollView>
          </RNAnimated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xl },

  photoPlaceholder: {
    width: '100%', height: PHOTO_H, borderRadius: Radius.lg, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: Space.sm,
  },
  placeholderTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, letterSpacing: Type.subtitle.letterSpacing },
  placeholderSub: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted, letterSpacing: Type.caption.letterSpacing },
  emptyActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.sm },
  emptyActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  emptyActionText: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.brand },

  photoWrap: { width: '100%', height: PHOTO_H, borderRadius: Radius.lg, overflow: 'hidden', position: 'relative', backgroundColor: Colors.surfaceAlt },
  photo: { width: '100%', height: '100%' },

  tagWrap: { position: 'absolute', transform: [{ translateX: -24 }, { translateY: -24 }], zIndex: 10 },
  tagDragArea: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  tagTapOverlay: { position: 'absolute', top: -8, left: -8, right: -8, bottom: -8 },

  tagPill: {
    position: 'absolute', top: 22, left: -50, width: 100,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: Radius.md,
    padding: 6, gap: 6,
  },
  tagPillImg: { width: 28, height: 28, borderRadius: 4, backgroundColor: Colors.surfaceAlt },
  tagPillTitle: { fontSize: 11, fontFamily: Typography.family.semibold, color: '#fff', letterSpacing: 0.1 },
  tagPillPrice: { fontSize: 10, fontFamily: Typography.family.medium, color: 'rgba(255,255,255,0.7)' },

  changePhotoBtn: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full,
  },
  changePhotoText: { color: '#fff', fontSize: Type.meta.size, fontFamily: Typography.family.semibold },

  tagHintOverlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', gap: 8 },
  tagHintText: { fontSize: Type.caption.size, fontFamily: Typography.family.medium, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.3 },

  tagCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Space.sm, paddingHorizontal: 4 },
  tagCountText: { fontSize: Type.caption.size, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  tagCountClear: { fontSize: Type.caption.size, fontFamily: Typography.family.semibold, color: Colors.danger },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: DRAWER_H,
    backgroundColor: Colors.background, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  handleRow: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },

  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md, paddingBottom: Space.sm },
  editorTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.bold, color: Colors.textPrimary, letterSpacing: Type.subtitle.letterSpacing },
  editorClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  editorScroll: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

  selectedListingCard: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Space.sm, marginBottom: Space.sm },
  selectedListingImg: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt },
  selectedListingInfo: { flex: 1, gap: 2 },
  selectedListingBrand: { fontSize: Type.meta.size, fontFamily: Typography.family.semibold, color: Colors.brand, letterSpacing: Type.meta.letterSpacing, textTransform: 'uppercase' },
  selectedListingTitle: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, letterSpacing: Type.body.letterSpacing },
  selectedListingPrice: { fontSize: Type.caption.size, fontFamily: Typography.family.medium, color: Colors.textMuted, letterSpacing: Type.caption.letterSpacing },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: Space.sm,
  },
  searchInput: { flex: 1, fontSize: Type.body.size, fontFamily: Typography.family.regular, color: Colors.textPrimary, padding: 0 },

  resultsLabel: { fontSize: Type.caption.size, fontFamily: Typography.family.semibold, color: Colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: Space.sm, marginTop: Space.sm },
  emptyResults: { alignItems: 'center', paddingVertical: Space.lg, gap: 8 },
  emptyResultsText: { fontSize: Type.body.size, fontFamily: Typography.family.medium, color: Colors.textMuted },

  listingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  listingCard: {
    width: (SCREEN_W - Space.md * 2 - Space.sm * 2) / 3,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 6, gap: 4,
  },
  listingCardActive: { borderColor: Colors.brand, borderWidth: 2 },
  listingImg: { width: '100%', aspectRatio: 0.77, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt },
  listingBrand: { fontSize: 10, fontFamily: Typography.family.semibold, color: Colors.brand, letterSpacing: 0.3, textTransform: 'uppercase' },
  listingTitle: { fontSize: 11, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  listingPrice: { fontSize: 11, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  listingCheck: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },

  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Space.lg, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.danger },
  removeText: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.danger, letterSpacing: Type.body.letterSpacing },

  inlineErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Space.sm, paddingHorizontal: 4 },
  inlineErrorText: { fontSize: Type.caption.size, fontFamily: Typography.family.medium, color: Colors.danger },

  tagList: { gap: Space.sm, marginTop: Space.sm },
  tagListItem: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Space.sm },
  tagListImg: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt },
  tagListImgPlaceholder: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tagListLabel: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  tagListPrice: { fontSize: Type.caption.size, fontFamily: Typography.family.medium, color: Colors.textMuted },

  previewToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  previewToggleText: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.brand },

  previewBadge: { position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  previewBadgeText: { fontSize: Type.meta.size, fontFamily: Typography.family.semibold, color: '#fff' },
});