import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Space, Radius, Type, Typography, IconGrammar, Stroke} from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  searchListingsFromApi,
  fetchUserListingsFromApi,
  fetchListingByIdFromApi,
  type ListingSearchResult,
  type ListingApiItem,
} from '../services/listingsApi';
import { searchUsers, type UserSearchResult } from '../services/profileApi';
import { useStore } from '../store/useStore';
import { fetchLooksFromApi } from '../services/looksApi';
import { createStableId } from '../utils/createStableId';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { withAlpha } from '../components/poster/shared/colorUtils';
import type { CreatorLayer } from './composition';
import { isCapabilitySupported, getCapabilityForLayerType, isVisualLayer } from './capabilities/registry';
import { Canvas, Path, Skia, DashPathEffect } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

// ── Extracted sheet components (Phase 2: Asset Picker Decomposition) ──
// These replace the monolithic inline pickers with dedicated, reusable
// sheet components. Each adapter wraps the new sheet to match the
// AssetPickerContent onAddLayer interface.
import { TextEditorSheet } from './tools/text/TextEditorSheet';
import type { TextStyleConfig as NewTextStyleConfig } from './tools/text/textStylePresets';
import { StickerBrowserSheet } from './tools/stickers/StickerBrowserSheet';
import type { StickerDef as NewStickerDef } from './tools/stickers/StickerCategories';
import { DrawingWorkspace } from './tools/drawing/DrawingWorkspace';
import type { DrawingDocument } from './tools/drawing/DrawingTypes';
import { AudioBrowserSheet } from './tools/audio/AudioBrowserSheet';
import type { AudioConfig as NewAudioConfig } from './tools/audio/AudioTypes';

export type AssetPickerMode = 'media' | 'product' | 'mention' | 'look' | 'text' | 'shape' | 'vote' | 'draw' | 'gif' | 'music' | 'quiz' | 'question' | 'emojiSlider' | 'countdown' | 'stickers' | 'link' | 'location' | 'hashtag' | 'time' | 'weather';

export interface CreatorAssetPickerProps {
  visible: boolean;
  mode: AssetPickerMode;
  onClose: () => void;
  onAddLayer: (layer: CreatorLayer) => void;
  editingLayer?: CreatorLayer | null;
  /** Media URI to render as the drawing background (draw-on-media pattern).
   *  Only used by the 'draw' mode. */
  backgroundUri?: string;
}

export function CreatorAssetPicker({ visible, mode, onClose, onAddLayer, editingLayer, backgroundUri }: CreatorAssetPickerProps) {
  const haptic = useHaptic();
  if (!visible) return null;

  return (
    <AssetPickerContent mode={mode} onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} backgroundUri={backgroundUri} />
  );
}

// ── Phase 2 Adapters: wrap extracted sheets to match onAddLayer interface ──

/** Adapter for TextEditorSheet — converts (text, style) → text layer. */
function TextEditorAdapter({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const isEditing = editingLayer?.type === 'text';
  const existingPayload = editingLayer?.type === 'text' ? editingLayer.payload : null;
  const handleConfirm = useCallback((text: string, style: NewTextStyleConfig) => {
    // The TextStyleConfig fields mirror the text layer payload, but
    // `textStyle` is typed as `string` in TextStyleConfig while the
    // composition schema expects a specific union. Cast through unknown
    // to satisfy the schema — the values are always valid preset IDs.
    const payload = style as unknown as Record<string, unknown>;
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: { ...editingLayer.payload, ...payload } as typeof editingLayer.payload,
      } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('text'), 10),
        type: 'text' as const,
        width: 0.6,
        height: 0.1,
        payload: payload as never,
      });
    }
    onClose();
  }, [isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <TextEditorSheet
      visible={true}
      onClose={onClose}
      initialText={existingPayload?.text ?? ''}
      initialStyle={existingPayload ? {
        text: existingPayload.text,
        textStyle: existingPayload.textStyle,
        textColor: existingPayload.textColor,
        backgroundColor: existingPayload.backgroundColor,
        fill: existingPayload.fill,
        stroke: existingPayload.stroke,
        shadow: existingPayload.shadow,
        background: existingPayload.background,
        alignment: existingPayload.alignment,
        opacity: 1,
        textEffect: existingPayload.textEffect,
        textAnimation: existingPayload.textAnimation,
      } : undefined}
      onConfirm={handleConfirm}
    />
  );
}

/** Adapter for StickerBrowserSheet — converts sticker selection → layer. */
function StickerBrowserAdapter({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const [subMode, setSubMode] = useState<AssetPickerMode | null>(null);

  const handleStickerSelect = useCallback((sticker: NewStickerDef) => {
    if (sticker.interactive && sticker.pickerMode) {
      // Route to the interactive sticker's configuration picker
      setSubMode(sticker.pickerMode as AssetPickerMode);
      return;
    }
    // Non-interactive sticker: create a layer directly
    if (sticker.emoji) {
      // Emoji sticker → text layer with emoji as content
      onAddLayer({
        ...baseLayer(createStableId('text'), 10),
        type: 'text',
        width: 0.15,
        height: 0.15,
        payload: {
          text: sticker.emoji,
          textStyle: 'clean',
          fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
          textColor: '#ffffff',
          alignment: 'center',
          opacity: 1,
          textEffect: 'none',
          textAnimation: 'none',
        },
      });
    } else if (sticker.iconRef) {
      // Icon-based sticker → decorative layer
      onAddLayer({
        ...baseLayer(createStableId('shape'), 5),
        type: 'decorative',
        width: 0.15,
        height: 0.15,
        payload: { shape: 'star', color: '#ffffff', opacity: 1 },
      });
    }
    onClose();
  }, [onAddLayer, onClose]);

  // If an interactive sticker was selected, route to its configuration picker.
  if (subMode) {
    return (
      <AssetPickerContent
        mode={subMode}
        onClose={() => setSubMode(null)}
        onAddLayer={onAddLayer}
        editingLayer={null}
      />
    );
  }

  return (
    <StickerBrowserSheet
      visible={true}
      onClose={onClose}
      onStickerSelect={handleStickerSelect}
    />
  );
}

/** Adapter for DrawingWorkspace — converts drawing commit → draw layer. */
function DrawingWorkspaceAdapter({ onClose, onAddLayer, editingLayer, backgroundUri }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null; backgroundUri?: string }) {
  const isEditing = editingLayer?.type === 'draw';
  const existingStrokes = editingLayer?.type === 'draw' ? editingLayer.payload.strokes ?? [] : [];

  const handleCommit = useCallback((drawing: DrawingDocument) => {
    // Convert DrawingDocument strokes to composition DrawStroke format
    const strokes = drawing.strokes.map((s) => ({
      points: s.points,
      color: s.color,
      width: s.size,
      tool: s.brushType,
      emoji: s.emojiConfig?.emoji,
      emojiSize: s.emojiConfig?.size ?? 32,
      emojiSpacing: s.emojiConfig?.spacing ?? 24,
      emojiJitter: s.emojiConfig?.jitter ?? 0,
    }));
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: { ...editingLayer.payload, strokes },
      } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('draw'), 10),
        type: 'draw',
        width: 0.8,
        height: 0.8,
        payload: { strokes, opacity: 1 },
      });
    }
    onClose();
  }, [isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <DrawingWorkspace
      visible={true}
      onClose={onClose}
      onCommit={handleCommit}
      canvasWidth={320}
      canvasHeight={400}
      backgroundUri={backgroundUri}
    />
  );
}

/** Adapter for AudioBrowserSheet — converts audio config → music layer. */
function AudioBrowserAdapter({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const handleConfirm = useCallback((config: NewAudioConfig) => {
    // Create a music layer from the audio config.
    // When no track is selected (trackId is null), this represents
    // original-audio-only configuration — we still create the layer so
    // the volume/offset settings are preserved.
    onAddLayer({
      ...baseLayer(createStableId('music'), 10),
      type: 'music',
      width: 0.3,
      height: 0.08,
      payload: {
        trackName: config.trackId ? 'Selected track' : 'Original audio',
        artistName: '',
        startOffsetMs: config.startOffsetMs,
        opacity: 1,
        volume: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    });
    onClose();
  }, [onAddLayer, onClose]);

  return (
    <AudioBrowserSheet
      visible={true}
      onClose={onClose}
      onConfirm={handleConfirm}
      hasOriginalAudio={true}
    />
  );
}

function AssetPickerContent({ mode, onClose, onAddLayer, editingLayer, backgroundUri }: { mode: AssetPickerMode; onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null; backgroundUri?: string }) {
  switch (mode) {
    case 'media':
      return <MediaPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'product':
      return <ProductPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'mention':
      return <MentionPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'look':
      return <LookPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'text':
      return <TextEditorAdapter onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'shape':
      return <ShapePicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'vote':
      return <VotePicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'draw':
      return <DrawingWorkspaceAdapter onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} backgroundUri={backgroundUri} />;
    case 'gif':
      return <GifPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'music':
      return <AudioBrowserAdapter onClose={onClose} onAddLayer={onAddLayer} />;
    case 'quiz':
      return <QuizPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'question':
      return <QuestionPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'emojiSlider':
      return <EmojiSliderPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'countdown':
      return <CountdownPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'stickers':
      return <StickerBrowserAdapter onClose={onClose} onAddLayer={onAddLayer} />;
    case 'link':
      return <LinkPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'location':
      return <LocationPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'hashtag':
      return <HashtagPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'time':
      return <TimePicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'weather':
      return <WeatherPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    default:
      return null;
  }
}

function PickerShell({ title, onClose, children, compact }: { title: string; onClose: () => void; children: React.ReactNode; compact?: boolean }) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  return (
    <SheetContainer visible={true} onClose={onClose} compact={compact}>
      <KeyboardAwareScrollView contentContainerStyle={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ maxHeight: '100%' }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker" accessibilityHint="Closes the picker sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
          </PressScale>
        </View>
        {children}
      </KeyboardAwareScrollView>
    </SheetContainer>
  );
}

function baseLayer(id: string, zIndex: number): Omit<CreatorLayer, 'type' | 'payload'> {
  return {
    id,
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.4,
    scale: 1,
    rotation: 0,
    zIndex,
    locked: false,
    hidden: false,
    opacity: 1,
  };
}

// ── Media Picker ───────────────────────────────────────────────────

const GRID_COLUMNS = 3;

// HSL → HEX converter for the spectrum color picker
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface MediaAsset {
  id: string;
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  /**
   * Video duration in milliseconds, normalized at the boundary.
   * The legacy expo-media-library API returns duration in seconds, while
   * expo-image-picker returns it in milliseconds. Both are converted to
   * milliseconds here so all downstream comparisons and display formatting
   * use one consistent unit.
   */
  durationMs?: number;
}

// Camera roll category tabs
// Note: "Selfies" was previously inferred from square aspect ratio, which is
// not truthful (a square image is not necessarily a selfie). Renamed to
// "Square" so the filter label matches what it actually does. Querying
// actual smart albums (iOS Selfies album) requires platform-specific APIs
// not reliably available through expo-media-library.
type MediaCategory = 'recent' | 'photos' | 'videos' | 'square';
const MEDIA_CATEGORIES: { key: MediaCategory; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'recent', label: 'Recent', icon: 'time-outline' },
  { key: 'photos', label: 'Photos', icon: 'images-outline' },
  { key: 'videos', label: 'Videos', icon: 'videocam-outline' },
  { key: 'square', label: 'Square', icon: 'crop-outline' },
];

// ── MediaGridItem — spring press feedback + spring scale selection badge ──
function MediaGridItem({
  asset,
  isSelected,
  selectionOrder,
  onPress,
  colors,
  styles,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  selectionOrder: number;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const pressedSV = useSharedValue(0);
  const badgeScaleSV = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    if (isSelected) {
      if (reduceMotion) {
        badgeScaleSV.value = 1;
      } else {
        badgeScaleSV.value = withSpring(1, spring.success);
      }
    } else {
      badgeScaleSV.value = reduceMotion ? 0 : withSpring(0, spring.tap);
    }
  }, [isSelected, reduceMotion, spring, badgeScaleSV]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressedSV.value, [0, 1], [1, 0.95], Extrapolation.CLAMP) }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScaleSV.value }],
    opacity: badgeScaleSV.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { pressedSV.value = withSpring(1, spring.tap); }}
      onPressOut={() => { pressedSV.value = withSpring(0, spring.tap); }}
      accessibilityLabel={`Select ${asset.mediaType}${isSelected ? `, selected ${selectionOrder}` : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Reanimated.View style={[styles.mediaGridCell, pressStyle]}>
        <Image
          source={{ uri: asset.uri }}
          style={styles.mediaGridThumb}
          contentFit="cover"
        />
        {asset.mediaType === 'video' && (
          <View style={styles.mediaGridVideoBadge}>
            <Ionicons name="play" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
            {asset.durationMs != null && (
              <Text style={styles.mediaGridDuration}>
                {Math.floor(asset.durationMs / 1000)}s
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <View style={styles.mediaGridSelectedOverlay}>
            <Reanimated.View style={[styles.mediaGridSelectionBadge, { backgroundColor: colors.brand }, badgeStyle]}>
              <Text style={[styles.mediaGridSelectionText, { color: colors.textInverse }]}>{selectionOrder}</Text>
            </Reanimated.View>
          </View>
        )}
      </Reanimated.View>
    </Pressable>
  );
}

// ── StaticStateIcon — replaces the previous infinite breathing animation.
// Per AGENTS.md §17, continuous pulsing is prohibited. Empty/permission
// states use a static icon with a restrained one-shot entrance fade instead.
function StaticStateIcon({ name, size, color }: { name: React.ComponentProps<typeof Ionicons>['name']; size: number; color: string }) {
  return (
    <Ionicons name={name} size={size} color={color} aria-hidden={true} />
  );
}

// ── PermissionDeniedState — spring entrance with retry CTA ──
function PermissionDeniedState({
  icon,
  title,
  message,
  ctaLabel,
  onCta,
  colors,
  styles,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  ctaLabel: string;
  onCta: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const entranceSV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      entranceSV.value = withDelay(100, withSpring(1, spring.entrance));
    }
  }, [reduceMotion, spring, entranceSV]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceSV.value,
    transform: [{ translateY: interpolate(entranceSV.value, [0, 1], [20, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <Reanimated.View style={[styles.mediaPermissionState, entranceStyle]}>
      <StaticStateIcon name={icon} size={IconGrammar.hero} color={colors.textMuted} />
      <Text style={[styles.mediaPermissionTitle, { color: colors.textPrimary }]}>
        {title}
      </Text>
      <Text style={[styles.mediaPermissionText, { color: colors.textSecondary }]}>
        {message}
      </Text>
      <PressScale
        onPress={onCta}
        style={[styles.mediaPermissionBtn, { backgroundColor: colors.brand }]}
        accessibilityLabel={ctaLabel}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[styles.mediaPermissionBtnText, { color: colors.textInverse }]}>{ctaLabel}</Text>
      </PressScale>
    </Reanimated.View>
  );
}

const MediaPicker = React.memo(function MediaPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Ordered selection — preserved as an array instead of deriving order
  // from Set iteration semantics (which is not deterministic across JS
  // engines). This ensures the selection order matches the user's tap order.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<MediaCategory>('recent');
  const cursorRef = useRef<string | undefined>(undefined);
  const mountedRef = useRef(true);

  // ── Album/source model ──
  // Queries the device's actual photo albums (iOS smart albums, Android
  // buckets) so the user can browse by source instead of only by media type.
  // Falls back gracefully to "All Photos" when the platform doesn't expose
  // albums or the query fails.
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);

  useEffect(() => {
    if (!status?.granted) return;
    let cancelled = false;
    MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })
      .then((result) => {
        if (!cancelled && result) {
          setAlbums(result);
        }
      })
      .catch(() => {
        // Albums are optional — the grid still works with the default
        // "all photos" query when album listing is unavailable.
      });
    return () => { cancelled = true; };
  }, [status?.granted]);

  const activeAlbum = albums.find((a) => a.id === activeAlbumId) ?? null;
  const albumLabel = activeAlbum?.title ?? 'All Photos';

  // Spring indicator for category tab
  const tabIndicatorXSV = useSharedValue(0);
  const tabIndicatorWidthSV = useSharedValue(0);
  const tabLayoutsRef = useRef<Record<MediaCategory, { x: number; width: number }>>({} as any);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load media when permission is granted or album changes
  const loadRecentMedia = useCallback(async (reset: boolean) => {
    if (reset) {
      setIsLoading(true);
      cursorRef.current = undefined;
    } else {
      if (!hasMore || loadingMore) return;
      setLoadingMore(true);
    }

    try {
      const opts: any = {
        first: 60,
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]],
      };
      if (!reset && cursorRef.current) {
        opts.after = cursorRef.current;
      }
      // When an album is selected, scope the query to that album's assets.
      if (activeAlbumId) {
        opts.album = activeAlbumId;
      }

      const page = await MediaLibrary.getAssetsAsync(opts);
      if (!mountedRef.current) return;

      const mapped: MediaAsset[] = page.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        mediaType: a.mediaType === 'video' ? 'video' : 'image',
        width: a.width,
        height: a.height,
        // Legacy expo-media-library returns duration in seconds; normalize
        // to milliseconds at the boundary so all downstream logic uses one
        // consistent unit.
        durationMs: a.duration != null ? Math.round(a.duration * 1000) : undefined,
      }));

      setAssets((prev) => reset ? mapped : [...prev, ...mapped]);
      cursorRef.current = page.endCursor;
      setHasMore(page.hasNextPage);
    } catch {
      if (reset) setAssets([]);
      setHasMore(false);
    } finally {
      if (mountedRef.current) {
        if (reset) setIsLoading(false);
        else setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore, activeAlbumId]);

  useEffect(() => {
    if (status && status.granted) {
      loadRecentMedia(true);
    }
  }, [status, loadRecentMedia]);

  // ── Category tab switch with spring indicator ────────────────────
  const handleCategorySwitch = useCallback((cat: MediaCategory) => {
    if (cat === activeCategory) return;
    haptic.selection();
    setActiveCategory(cat);
    const layout = tabLayoutsRef.current[cat];
    if (layout) {
      if (reduceMotion) {
        tabIndicatorXSV.value = layout.x;
        tabIndicatorWidthSV.value = layout.width;
      } else {
        tabIndicatorXSV.value = withSpring(layout.x, spring.tap);
        tabIndicatorWidthSV.value = withSpring(layout.width, spring.tap);
      }
    }
  }, [activeCategory, haptic, reduceMotion, tabIndicatorXSV, tabIndicatorWidthSV, spring]);

  // Filter assets by category
  const filteredAssets = useMemo(() => {
    if (activeCategory === 'recent') return assets;
    if (activeCategory === 'photos') return assets.filter(a => a.mediaType === 'image');
    if (activeCategory === 'videos') return assets.filter(a => a.mediaType === 'video');
    if (activeCategory === 'square') return assets.filter(a => a.mediaType === 'image' && a.width === a.height);
    return assets;
  }, [assets, activeCategory]);

  // ── Video preflight ──
  // Reject videos exceeding the max supported duration (60s) before they
  // enter the selection. This prevents the user from building a selection
  // that will be rejected downstream by the editor or upload pipeline.
  const MAX_VIDEO_DURATION_MS = 60_000;
  const videoPreflightError = useRef<string | null>(null);

  const toggleSelect = useCallback((asset: MediaAsset) => {
    if (asset.mediaType === 'video') {
      if (asset.durationMs != null && asset.durationMs > MAX_VIDEO_DURATION_MS) {
        haptic.medium();
        videoPreflightError.current = `Video is ${Math.floor(asset.durationMs / 1000)}s — max 60s supported`;
        return;
      }
    }
    haptic.selection();
    setSelectedIds((prev) => {
      if (prev.includes(asset.id)) {
        return prev.filter((id) => id !== asset.id);
      }
      if (prev.length >= 10) return prev;
      return [...prev, asset.id];
    });
  }, [haptic]);

  const handleAddSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    haptic.light();
    // Preserve the user's tap order by mapping over the ordered array
    // instead of filtering assets (which would preserve library order).
    const selected = selectedIds
      .map((id) => assets.find((a) => a.id === id))
      .filter((a): a is MediaAsset => !!a);
    selected.forEach((asset, i) => {
      onAddLayer({
        ...baseLayer(createStableId('media'), i),
        type: 'media',
        width: 1,
        height: 1,
        payload: {
          mediaUri: asset.uri,
          mediaType: asset.mediaType,
          contentFit: 'cover',
          videoDurationMs: asset.durationMs,
          opacity: 1,
        },
      });
    });
    onClose();
  }, [selectedIds, assets, onAddLayer, onClose]);

  // ── Reorder selection ──
  // Move a selected item left or right in the ordered array. This lets the
  // user correct their tap order before committing to the canvas.
  const reorderSelection = useCallback((id: string, direction: -1 | 1) => {
    haptic.selection();
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  }, [haptic]);

  const handleTakePhoto = useCallback(async () => {
    haptic.light();
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      onAddLayer({
        ...baseLayer(createStableId('media'), 0),
        type: 'media',
        width: 1,
        height: 1,
        payload: {
          mediaUri: result.assets[0].uri,
          mediaType: 'image',
          contentFit: 'cover',
          opacity: 1,
        },
      });
      onClose();
    }
  }, [onAddLayer, onClose]);

  const handlePickVideo = useCallback(async () => {
    haptic.light();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      onAddLayer({
        ...baseLayer(createStableId('media'), 0),
        type: 'media',
        width: 1,
        height: 1,
        payload: {
          mediaUri: result.assets[0].uri,
          mediaType: 'video',
          contentFit: 'cover',
          // ImagePicker returns duration in milliseconds.
          videoDurationMs: result.assets[0].duration ?? undefined,
          opacity: 1,
        },
      });
      onClose();
    }
  }, [onAddLayer, onClose]);

  const handleOpenSettings = useCallback(async () => {
    const { Linking } = await import('react-native');
    Linking.openSettings();
  }, []);

  const selectedCount = selectedIds.length;

  // ── Tab indicator animated style ─────────────────────────────────
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorXSV.value }],
    width: tabIndicatorWidthSV.value,
  }));

  // ── FlashList renderItem ─────────────────────────────────────────
  const renderItem: ListRenderItem<MediaAsset | 'camera' | 'video'> = useCallback(({ item }) => {
    if (item === 'camera') {
      return (
        <PressScale
          onPress={handleTakePhoto}
          style={[styles.mediaGridCell, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
          accessibilityLabel="Take photo with camera"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="camera-outline" size={IconGrammar.hero} color={colors.textPrimary} aria-hidden={true} />
        </PressScale>
      );
    }
    if (item === 'video') {
      return (
        <PressScale
          onPress={handlePickVideo}
          style={[styles.mediaGridCell, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
          accessibilityLabel="Pick video from gallery"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="videocam-outline" size={IconGrammar.hero} color={colors.textPrimary} aria-hidden={true} />
        </PressScale>
      );
    }
    const asset = item as MediaAsset;
    const isSelected = selectedIds.includes(asset.id);
    const selectionOrder = isSelected ? selectedIds.indexOf(asset.id) + 1 : 0;
    return (
      <MediaGridItem
        asset={asset}
        isSelected={isSelected}
        selectionOrder={selectionOrder}
        onPress={() => toggleSelect(asset)}
        colors={colors}
        styles={styles}
      />
    );
  }, [colors, handleTakePhoto, handlePickVideo, toggleSelect, selectedIds, styles]);

  const gridData: (MediaAsset | 'camera' | 'video')[] = useMemo(() => {
    return ['camera', 'video', ...filteredAssets];
  }, [filteredAssets]);

  // ── Permission states (after all hooks) ──
  if (!status) {
    return (
      <PickerShell title="Add Media" onClose={onClose}>
        <View style={styles.mediaLoadingState}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </PickerShell>
    );
  }

  if (!status.granted && !status.canAskAgain) {
    return (
      <PickerShell title="Add Media" onClose={onClose}>
        <PermissionDeniedState
          icon="lock-closed-outline"
          title="Photo access needed"
          message="Allow access to your photo library to pick media for your creation."
          ctaLabel="Open settings"
          onCta={handleOpenSettings}
          colors={colors}
          styles={styles}
        />
      </PickerShell>
    );
  }

  if (!status.granted) {
    return (
      <PickerShell title="Add Media" onClose={onClose}>
        <PermissionDeniedState
          icon="images-outline"
          title="Access your photos"
          message="We need access to show your recent photos and videos here."
          ctaLabel="Allow access"
          onCta={() => requestPermission()}
          colors={colors}
          styles={styles}
        />
      </PickerShell>
    );
  }

  // ── Media grid with multi-select ──

  return (
    <SheetContainer visible={true} onClose={selectedCount > 0 ? () => { setSelectedIds([]); } : onClose} maxHeight={0.9}>
      <View style={styles.header}>
        {/* The title stays as the static sheet title regardless of selection
            state. The selection count is shown in exactly one place — the
            Add (N) button — to avoid the label-everything AI-tell of
            restating the count in the title, a badge, and the button
            (AGENTS.md §4). This matches the MediaBrowserSheet pattern. */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Add Media
        </Text>
        <View style={styles.headerRight}>
          {selectedCount > 0 && (
            <PressScale
              onPress={handleAddSelected}
              style={[styles.addBtn, { backgroundColor: colors.brand }]}
              accessibilityLabel={`Add ${selectedCount} selected media`}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.addBtnText, { color: colors.textInverse }]}>
                Add ({selectedCount})
              </Text>
            </PressScale>
          )}
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker" accessibilityHint="Closes the picker sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
          </PressScale>
        </View>
      </View>

      {/* Album/source disclosure — per audit: "album/source disclosure" in
          the canonical MediaAcquireSheet header. Shows the current album
          name and opens a dropdown to switch between device albums. */}
      {albums.length > 0 && (
        <Pressable
          style={styles.albumDisclosure}
          onPress={() => { haptic.light(); setShowAlbumPicker((v) => !v); }}
          accessibilityLabel={`Current album: ${albumLabel}. Tap to change album.`}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAlbumPicker }}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Ionicons name="folder-open-outline" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} />
          <Text style={[styles.albumDisclosureText, { color: colors.textPrimary }]} numberOfLines={1}>
            {albumLabel}
          </Text>
          <Ionicons name={showAlbumPicker ? 'chevron-up' : 'chevron-down'} size={IconGrammar.badge} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
      )}

      {/* Album picker dropdown — flat list of device albums */}
      {showAlbumPicker && albums.length > 0 && (
        <View style={[styles.albumPickerDropdown, { borderColor: colors.border }]}>
          <Pressable
            style={[styles.albumPickerItem, activeAlbumId === null && { backgroundColor: colors.brandSubtle }]}
            onPress={() => {
              haptic.selection();
              setActiveAlbumId(null);
              setShowAlbumPicker(false);
            }}
            accessibilityLabel="All Photos album"
            accessibilityRole="button"
            accessibilityState={{ selected: activeAlbumId === null }}
          >
            <Ionicons name="images-outline" size={IconGrammar.metadata} color={activeAlbumId === null ? colors.brand : colors.textSecondary} aria-hidden={true} />
            <Text style={[styles.albumPickerItemText, { color: activeAlbumId === null ? colors.brand : colors.textPrimary }]}>
              All Photos
            </Text>
            {activeAlbumId === null && <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.brand} aria-hidden={true} />}
          </Pressable>
          {albums.slice(0, 12).map((album) => (
            <Pressable
              key={album.id}
              style={[styles.albumPickerItem, activeAlbumId === album.id && { backgroundColor: colors.brandSubtle }]}
              onPress={() => {
                haptic.selection();
                setActiveAlbumId(album.id);
                setShowAlbumPicker(false);
              }}
              accessibilityLabel={`${album.title} album`}
              accessibilityRole="button"
              accessibilityState={{ selected: activeAlbumId === album.id }}
            >
              <Ionicons name="folder-outline" size={IconGrammar.metadata} color={activeAlbumId === album.id ? colors.brand : colors.textSecondary} aria-hidden={true} />
              <Text style={[styles.albumPickerItemText, { color: activeAlbumId === album.id ? colors.brand : colors.textPrimary }]} numberOfLines={1}>
                {album.title}
              </Text>
              {activeAlbumId === album.id && <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.brand} aria-hidden={true} />}
            </Pressable>
          ))}
        </View>
      )}

      {/* Camera roll category tabs with spring indicator */}
      <View style={styles.categoryTabRow}>
        <Reanimated.View
          style={[styles.categoryTabIndicator, { backgroundColor: colors.brand }, tabIndicatorStyle]}
        />
        {MEDIA_CATEGORIES.map((cat) => {
          const active = activeCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => handleCategorySwitch(cat.key)}
              onLayout={(e) => {
                tabLayoutsRef.current[cat.key] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
                if (cat.key === 'recent' && tabIndicatorWidthSV.value === 0) {
                  tabIndicatorWidthSV.value = e.nativeEvent.layout.width;
                }
              }}
              style={styles.categoryTab}
              accessibilityLabel={`Category ${cat.label}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={cat.icon}
                size={IconGrammar.metadata}
                color={active ? colors.textInverse : colors.textSecondary}
                aria-hidden={true}
              />
              <Text style={[
                styles.categoryTabLabel,
                { color: active ? colors.textInverse : colors.textSecondary },
              ]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.mediaLoadingState}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : filteredAssets.length === 0 ? (
        // Empty state
        <View style={styles.mediaEmptyState}>
          <StaticStateIcon name="images-outline" size={IconGrammar.hero} color={colors.textMuted} />
          <Text style={[styles.mediaEmptyText, { color: colors.textSecondary }]}>
            {activeCategory === 'videos' ? 'No videos found' : activeCategory === 'square' ? 'No square photos found' : 'No photos found'}
          </Text>
          <PressScale
            onPress={handleTakePhoto}
            style={[styles.mediaPermissionBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Take photo"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.mediaPermissionBtnText, { color: colors.textInverse }]}>Take photo</Text>
          </PressScale>
        </View>
      ) : (
        <>
          {/* Limited-access banner (iOS 14+ / Android 14+) */}
          {status.accessPrivileges === 'limited' && (
            <Pressable
              style={[styles.limitedAccessBanner, { borderColor: colors.border }]}
              onPress={async () => {
                try {
                  await MediaLibrary.presentPermissionsPickerAsync();
                  loadRecentMedia(true);
                } catch {
                  handleOpenSettings();
                }
              }}
              accessibilityLabel="Limited photo access — tap to select more photos"
              accessibilityRole="button"
            >
              <Ionicons name="images-outline" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} />
              <Text style={[styles.limitedAccessText, { color: colors.textSecondary }]}>
                Limited access — tap to add more photos
              </Text>
              <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
          )}

          {/* Selection preview rail — ordered thumbnails with reorder support */}
          {selectedCount > 0 && (
            <View style={styles.selectionPreviewRail}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectionPreviewScroll}
              >
                {selectedIds.map((id, index) => {
                  const asset = assets.find((a) => a.id === id);
                  if (!asset) return null;
                  return (
                    <View key={id} style={styles.selectionPreviewItem}>
                      <Image
                        source={{ uri: asset.uri }}
                        style={styles.selectionPreviewThumb}
                        contentFit="cover"
                      />
                      <View style={[styles.selectionPreviewOrder, { backgroundColor: colors.brand }]}>
                        <Text style={[styles.selectionPreviewOrderText, { color: colors.textInverse }]}>
                          {index + 1}
                        </Text>
                      </View>
                      {/* Reorder left — move this item earlier in the sequence */}
                      {index > 0 && (
                        <Pressable
                          style={styles.selectionPreviewReorderLeft}
                          onPress={() => reorderSelection(id, -1)}
                          hitSlop={4}
                          accessibilityLabel={`Move ${asset.mediaType} ${index + 1} earlier in selection`}
                          accessibilityRole="button"
                        >
                          <Ionicons name="chevron-back-circle" size={IconGrammar.standard} color={colors.scrimTextPrimary} aria-hidden={true} />
                        </Pressable>
                      )}
                      {/* Reorder right — move this item later in the sequence */}
                      {index < selectedIds.length - 1 && (
                        <Pressable
                          style={styles.selectionPreviewReorderRight}
                          onPress={() => reorderSelection(id, 1)}
                          hitSlop={4}
                          accessibilityLabel={`Move ${asset.mediaType} ${index + 1} later in selection`}
                          accessibilityRole="button"
                        >
                          <Ionicons name="chevron-forward-circle" size={IconGrammar.standard} color={colors.scrimTextPrimary} aria-hidden={true} />
                        </Pressable>
                      )}
                      <Pressable
                        style={styles.selectionPreviewRemove}
                        onPress={() => toggleSelect(asset)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${asset.mediaType} ${index + 1} from selection`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close-circle" size={IconGrammar.standard} color={colors.scrimTextPrimary} aria-hidden={true} />
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Full grid via FlashList for virtualization */}
          <FlashList
            data={gridData}
            keyExtractor={(item) => typeof item === 'string' ? item : item.id}
            renderItem={renderItem}
            numColumns={GRID_COLUMNS}
            contentContainerStyle={styles.mediaGridContent}
            onEndReached={() => loadRecentMedia(false)}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore ? (
              <View style={styles.mediaGridFooter}>
                <ActivityIndicator size="small" color={colors.textMuted} />
              </View>
            ) : null}
          />
        </>
      )}
    </SheetContainer>
  );
});

// ── Product Picker ─────────────────────────────────────────────────
// Per spec 10 (Look Architecture V3), the Add item drawer sources are:
//   My closet/listings · Saved · Marketplace search · Recently viewed
// Selecting an item adds a visual object, not a settings row.

const RECENTLY_VIEWED_KEY = '@thryftverse_recently_viewed_listings';
const MAX_RECENT = 30;

// Recently-viewed cache entry — stores just enough to reconstruct the
// listing card without a round-trip. The canonical listing ID is always
// preserved so the published look can resolve to the live listing.
interface RecentListingEntry {
  id: string;
  sellerId: string;
  title: string;
  priceGbp: number;
  imageUrl: string | null;
  createdAt: string;
}

async function getRecentListings(): Promise<RecentListingEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function recordRecentListing(item: ListingSearchResult): Promise<void> {
  try {
    const existing = await getRecentListings();
    const entry: RecentListingEntry = {
      id: item.id,
      sellerId: item.sellerId,
      title: item.title,
      priceGbp: item.priceGbp,
      imageUrl: item.imageUrl,
      createdAt: item.createdAt,
    };
    const filtered = existing.filter((e) => e.id !== entry.id);
    const next = [entry, ...filtered].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — never block the picker.
  }
}

// Map a full ListingApiItem (from user listings / fetch-by-id) to the
// ListingSearchResult shape the picker renders.
function listingApiItemToSearchResult(item: ListingApiItem): ListingSearchResult {
  return {
    id: item.id,
    sellerId: item.sellerId,
    title: item.title,
    description: item.description,
    priceGbp: item.priceGbp,
    imageUrl: item.imageUrl,
    rank: 0,
    createdAt: item.createdAt,
    seller: item.seller ?? null,
    brand: item.brand,
    size: item.size,
    condition: item.condition,
    category: item.category,
  };
}

type ProductSourceTab = 'closet' | 'saved' | 'search' | 'recent';

const ProductPicker = React.memo(function ProductPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const currentUserId = useStore((state) => state.currentUser?.id);
  const savedProductIds = useStore((state) => state.savedProducts);
  const wishlistIds = useStore((state) => state.wishlist);

  const [activeTab, setActiveTab] = useState<ProductSourceTab>('search');

  // ── Search state (Marketplace search) ──────────────────────────────
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ListingSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchReqIdRef = useRef(0);
  const searchMountedRef = useRef(true);

  // ── Closet state (My closet/listings) ──────────────────────────────
  const [closetResults, setClosetResults] = useState<ListingSearchResult[]>([]);
  const [isClosetLoading, setIsClosetLoading] = useState(false);
  const [closetError, setClosetError] = useState<string | null>(null);
  const closetLoadedRef = useRef(false);

  // ── Saved state (Saved = savedProducts + wishlist) ─────────────────
  const [savedResults, setSavedResults] = useState<ListingSearchResult[]>([]);
  const [isSavedLoading, setIsSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const savedLoadedRef = useRef(false);

  // ── Recent state (Recently viewed) ─────────────────────────────────
  const [recentResults, setRecentResults] = useState<ListingSearchResult[]>([]);
  const [isRecentLoading, setIsRecentLoading] = useState(false);
  const recentLoadedRef = useRef(false);

  useEffect(() => {
    searchMountedRef.current = true;
    return () => { searchMountedRef.current = false; };
  }, []);

  // ── Search effect (debounced) ──────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }
    const reqId = ++searchReqIdRef.current;
    setIsSearchLoading(true);
    setSearchError(null);
    try {
      const res = await searchListingsFromApi(trimmed, 50);
      if (reqId !== searchReqIdRef.current || !searchMountedRef.current) return;
      setSearchResults(res.items);
      setHasSearched(true);
    } catch (err) {
      if (reqId !== searchReqIdRef.current || !searchMountedRef.current) return;
      setSearchError((err as Error).message || 'Search failed');
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      if (reqId === searchReqIdRef.current && searchMountedRef.current) setIsSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  // ── Closet: load user's own listings when tab is first opened ──────
  useEffect(() => {
    if (activeTab !== 'closet' || closetLoadedRef.current || !currentUserId) return;
    closetLoadedRef.current = true;
    let cancelled = false;
    setIsClosetLoading(true);
    setClosetError(null);
    fetchUserListingsFromApi(currentUserId, { status: 'active', limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setClosetResults(res.items.map(listingApiItemToSearchResult));
      })
      .catch((err) => {
        if (cancelled) return;
        setClosetError((err as Error).message || 'Could not load your listings');
        setClosetResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsClosetLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, currentUserId]);

  // ── Saved: load saved + wishlisted listings by ID ──────────────────
  useEffect(() => {
    if (activeTab !== 'saved' || savedLoadedRef.current) return;
    savedLoadedRef.current = true;
    const ids = Array.from(new Set([...savedProductIds, ...wishlistIds]));
    if (ids.length === 0) {
      setSavedResults([]);
      return;
    }
    let cancelled = false;
    setIsSavedLoading(true);
    setSavedError(null);
    // Fetch each listing by ID. The store only retains IDs, so we
    // resolve them individually. Failures for individual IDs are
    // silently skipped — partial results are better than blocking.
    Promise.all(
      ids.slice(0, 50).map((id) =>
        fetchListingByIdFromApi(id)
          .then((res) => (res.ok && res.listing ? listingApiItemToSearchResult(res.listing) : null))
          .catch(() => null)
      )
    )
      .then((items) => {
        if (cancelled) return;
        setSavedResults(items.filter((x): x is ListingSearchResult => x !== null));
      })
      .catch((err) => {
        if (cancelled) return;
        setSavedError((err as Error).message || 'Could not load saved items');
        setSavedResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSavedLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, savedProductIds, wishlistIds]);

  // ── Recent: load recently viewed listings from AsyncStorage ────────
  useEffect(() => {
    if (activeTab !== 'recent' || recentLoadedRef.current) return;
    recentLoadedRef.current = true;
    let cancelled = false;
    setIsRecentLoading(true);
    getRecentListings()
      .then((entries) => {
        if (cancelled) return;
        // Map RecentListingEntry to ListingSearchResult shape
        setRecentResults(
          entries.map((e) => ({
            id: e.id,
            sellerId: e.sellerId,
            title: e.title,
            description: '',
            priceGbp: e.priceGbp,
            imageUrl: e.imageUrl,
            rank: 0,
            createdAt: e.createdAt,
            seller: null,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setRecentResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsRecentLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleSelect = useCallback((item: ListingSearchResult) => {
    haptic.selection();
    // Record in recently viewed for future "Recent" tab population
    recordRecentListing(item);
    onAddLayer({
      ...baseLayer(createStableId('product'), 10),
      type: 'product',
      width: 0.2,
      height: 0.1,
      payload: {
        listingId: item.id,
        snapshotTitle: item.title,
        snapshotImageUrl: item.imageUrl ?? undefined,
        snapshotPriceGbp: item.priceGbp,
        availability: 'active',
      },
    });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  // ── Active tab data ────────────────────────────────────────────────
  const activeResults = activeTab === 'search'
    ? searchResults
    : activeTab === 'closet'
      ? closetResults
      : activeTab === 'saved'
        ? savedResults
        : recentResults;
  const activeLoading = activeTab === 'search'
    ? isSearchLoading
    : activeTab === 'closet'
      ? isClosetLoading
      : activeTab === 'saved'
        ? isSavedLoading
        : isRecentLoading;
  const activeError = activeTab === 'search'
    ? searchError
    : activeTab === 'closet'
      ? closetError
      : activeTab === 'saved'
        ? savedError
        : null;

  const handleRetry = useCallback(() => {
    if (activeTab === 'search') {
      doSearch(query);
    } else if (activeTab === 'closet') {
      closetLoadedRef.current = false;
      // Re-trigger by toggling state — force re-load
      setActiveTab('search');
      setTimeout(() => setActiveTab('closet'), 0);
    } else if (activeTab === 'saved') {
      savedLoadedRef.current = false;
      setActiveTab('search');
      setTimeout(() => setActiveTab('saved'), 0);
    }
  }, [activeTab, doSearch, query]);

  const renderProductItem = useCallback<ListRenderItem<ListingSearchResult>>(({ item }) => (
    <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select ${item.title}`} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <View style={styles.resultThumb}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.resultThumbImg} /> : <Ionicons name="pricetag" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} />}
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.resultPrice}>{currencySymbol}{item.priceGbp.toFixed(0)}</Text>
      </View>
    </Pressable>
  ), [handleSelect, styles, colors, currencySymbol]);

  const tabs: Array<{ key: ProductSourceTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
    { key: 'search', label: 'Search', icon: 'search-outline' },
    { key: 'closet', label: 'My Closet', icon: 'shirt-outline' },
    { key: 'saved', label: 'Saved', icon: 'bookmark-outline' },
    { key: 'recent', label: 'Recent', icon: 'time-outline' },
  ];

  return (
    <PickerShell title="Add Item" onClose={onClose} compact>
      {/* ── Source tabs ─────────────────────────────────────────────── */}
      <View style={styles.productTabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productTabBarContent}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => { haptic.light(); setActiveTab(tab.key); }}
                style={[styles.productTab, isActive && styles.productTabActive]}
                accessibilityLabel={tab.label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons name={tab.icon} size={IconGrammar.metadata} color={isActive ? colors.brand : colors.textSecondary} aria-hidden={true} />
                <Text style={[styles.productTabLabel, { color: isActive ? colors.brand : colors.textSecondary }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Search input (only visible on Search tab) ───────────────── */}
      {activeTab === 'search' && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search listings..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Search listings"
          />
          {isSearchLoading && <ActivityIndicator size="small" color={colors.brand} />}
        </View>
      )}

      {/* ── Results / states ────────────────────────────────────────── */}
      {activeError ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load items</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : activeLoading ? (
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlashList
          data={activeResults}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={
            activeTab === 'search'
              ? hasSearched && !isSearchLoading
                ? <View style={styles.emptyState}><Text style={styles.emptyText}>No listings found</Text></View>
                : null
              : !activeLoading
                ? <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                      {activeTab === 'closet'
                        ? 'No active listings in your closet'
                        : activeTab === 'saved'
                          ? 'No saved items yet'
                          : 'No recently viewed items'}
                    </Text>
                  </View>
                : null
          }
        />
      )}
    </PickerShell>
  );
});

// ── Mention Picker ─────────────────────────────────────────────────

const MentionPicker = React.memo(function MentionPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const currentUserId = useStore((state) => state.currentUser?.id);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      setIsSearching(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setIsSearching(true);
    setError(null);
    try {
      const res = await searchUsers(trimmed, 20);
      if (reqId !== reqIdRef.current || !mountedRef.current) return;
      const filtered = currentUserId ? res.filter((u) => u.id !== currentUserId) : res;
      setResults(filtered);
      setHasSearched(true);
    } catch (err) {
      if (reqId !== reqIdRef.current || !mountedRef.current) return;
      setError((err as Error).message || 'Search failed');
      setResults([]);
      setHasSearched(true);
    } finally {
      if (reqId === reqIdRef.current && mountedRef.current) setIsSearching(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleRetry = useCallback(() => doSearch(query), [doSearch, query]);

  const handleSelect = useCallback((user: UserSearchResult) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('mention'), 10),
      type: 'mention',
      width: 0.15,
      height: 0.06,
      payload: { userId: user.id, username: user.username },
    });
    onClose();
  }, [onAddLayer, onClose]);

  const renderMentionItem = useCallback<ListRenderItem<UserSearchResult>>(({ item }) => (
    <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select @${item.username}`} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <View style={styles.resultAvatar}>
        {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.resultThumbImg} /> : <Text style={styles.resultAvatarText}>{item.username[0]?.toUpperCase()}</Text>}
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName}>@{item.username}</Text>
        {item.displayName && <Text style={styles.resultSubtext}>{item.displayName}</Text>}
      </View>
    </Pressable>
  ), [handleSelect, styles]);

  return (
    <PickerShell title="Add Mention" onClose={onClose} compact>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search users"
        />
        {isSearching && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't search users</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry search" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderMentionItem}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={hasSearched && !isSearching ? <View style={styles.emptyState}><Text style={styles.emptyText}>No users found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
});

// ── Look Picker ────────────────────────────────────────────────────

const LookPicker = React.memo(function LookPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [query, setQuery] = useState('');
  const [allLooks, setAllLooks] = useState<Array<{ id: string; caption: string; mediaUrl: string; creatorId: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadLooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchLooksFromApi({ status: 'published', limit: 120 });
      if (!mountedRef.current) return;
      setAllLooks(res.items
        .filter((l) => l.visibility === 'public' && l.status === 'published')
        .map((l) => ({
          id: l.id,
          caption: l.caption || l.title,
          mediaUrl: l.mediaUrl,
          creatorId: l.creatorId,
        })));
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message || 'Failed to load looks');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLooks();
  }, [loadLooks]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allLooks;
    const q = query.trim().toLowerCase();
    return allLooks.filter((l) => l.caption.toLowerCase().includes(q));
  }, [allLooks, query]);

  const handleSelect = useCallback((item: { id: string; caption: string; mediaUrl: string }) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('look'), 10),
      type: 'look',
      width: 0.2,
      height: 0.08,
      payload: { lookId: item.id, snapshotCaption: item.caption, snapshotImageUrl: item.mediaUrl },
    });
    onClose();
  }, [onAddLayer, onClose]);

  const renderLookItem = useCallback<ListRenderItem<{ id: string; caption: string; mediaUrl: string; creatorId: string }>>(({ item }) => (
    <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select look ${item.caption}`} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <View style={styles.resultAvatar}><Ionicons name="shirt-outline" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} /></View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={2}>{item.caption}</Text>
      </View>
    </Pressable>
  ), [handleSelect, styles, colors]);

  return (
    <PickerShell title="Add Look" onClose={onClose} compact>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search looks..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search looks"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load looks</Text>
          <Pressable onPress={loadLooks} style={styles.retryBtn} accessibilityLabel="Retry loading looks" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderLookItem}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No looks found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
});

// ── Text Picker ────────────────────────────────────────────────────
// Instagram 2025-2026 parity: 10 fonts, text effects, background color,
// text animations (typewriter, bounce, fade). Each style label renders
// in its own font.

const TEXT_STYLES: Array<{ key: string; label: string }> = [
  { key: 'clean', label: 'Clean' },
  { key: 'headline', label: 'Headline' },
  { key: 'editorial', label: 'Editorial' },
  { key: 'compact', label: 'Compact' },
  { key: 'handwritten', label: 'Handwritten' },
  { key: 'bubble', label: 'Bubble' },
  { key: 'deco', label: 'Deco' },
  { key: 'poster', label: 'Poster' },
  { key: 'squeeze', label: 'Squeeze' },
  { key: 'signature', label: 'Signature' },
  { key: 'neon', label: 'Neon' },
];

// Text effect types (Instagram 2025-2026)
const TEXT_EFFECTS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'none', label: 'None', icon: 'close-circle-outline' },
  { key: 'shadow', label: 'Shadow', icon: 'moon-outline' },
  { key: 'neon', label: 'Neon', icon: 'flash-outline' },
  { key: 'outline', label: 'Outline', icon: 'square-outline' },
  { key: 'glow', label: 'Glow', icon: 'sunny-outline' },
];

// Text animation types (Instagram 2025-2026)
const TEXT_ANIMATIONS: Array<{ key: string; label: string }> = [
  { key: 'none', label: 'None' },
  { key: 'typewriter', label: 'Typewriter' },
  { key: 'bounce', label: 'Bounce' },
  { key: 'fade', label: 'Fade In' },
  { key: 'slide', label: 'Slide Up' },
];

const TEXT_COLORS = ['#ffffff', '#000000', '#9b0202', '#215634', '#06489A', '#C9A46A', '#8A6A3F', '#6B3245', '#E06666', '#B85566'];

const TEXT_BG_COLORS = ['transparent', '#000000', '#ffffff', '#9b0202', '#215634', '#06489A', '#C9A46A', '#6B3245'];

const TEXT_ALIGNMENTS: Array<{ key: 'left' | 'center' | 'right'; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'left', icon: 'text-outline' },
  { key: 'center', icon: 'text' },
  { key: 'right', icon: 'list-outline' },
];

// Text style preview mapping — mirrors CreatorCanvas styleMap
// Instagram 2025-2026: 10 fonts covering clean, bold, editorial,
// compact, handwritten, bubble, deco, poster, squeeze, signature
const TEXT_STYLE_PREVIEW: Record<string, { fontFamily: string; fontSize: number; lineHeight: number }> = {
  clean: { fontFamily: Typography.family.medium, fontSize: Type.body.size, lineHeight: Type.body.size * 1.3 },
  headline: { fontFamily: Typography.family.bold, fontSize: Type.title.size, lineHeight: Type.title.size * 1.15 },
  editorial: { fontFamily: Typography.family.bold, fontSize: Type.bodyStrong.size + 2, lineHeight: (Type.bodyStrong.size + 2) * 1.2 },
  compact: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, lineHeight: Type.caption.size * 1.3 },
  handwritten: { fontFamily: Typography.family.regular, fontSize: Type.body.size, lineHeight: Type.body.size * 1.35 },
  bubble: { fontFamily: Typography.family.bold, fontSize: Type.bodyStrong.size + 4, lineHeight: (Type.bodyStrong.size + 4) * 1.2 },
  deco: { fontFamily: Typography.family.bold, fontSize: Type.bodyStrong.size, lineHeight: Type.bodyStrong.size * 1.3 },
  poster: { fontFamily: Typography.family.bold, fontSize: Type.title.size - 4, lineHeight: (Type.title.size - 4) * 1.1 },
  squeeze: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, lineHeight: Type.body.size * 1.1 },
  signature: { fontFamily: Typography.family.regular, fontSize: Type.bodyStrong.size, lineHeight: Type.bodyStrong.size * 1.4 },
  neon: { fontFamily: Typography.family.bold, fontSize: Type.bodyStrong.size + 4, lineHeight: (Type.bodyStrong.size + 4) * 1.2 },
};

const TextPicker = React.memo(function TextPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'text';
  const existingPayload = editingLayer?.type === 'text' ? editingLayer.payload : null;

  const [text, setText] = useState(existingPayload?.text ?? '');
  const [textStyle, setTextStyle] = useState<string>(existingPayload?.textStyle ?? 'clean');
  const [textColor, setTextColor] = useState(existingPayload?.textColor ?? '#ffffff');
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right' | 'justify'>(existingPayload?.alignment ?? 'center');
  const [textEffect, setTextEffect] = useState<string>(existingPayload?.textEffect ?? 'none');
  const [textAnimation, setTextAnimation] = useState<string>(existingPayload?.textAnimation ?? 'none');
  const [textBgColor, setTextBgColor] = useState(existingPayload?.backgroundColor ?? 'transparent');
  const [showSpectrum, setShowSpectrum] = useState(false);

  const handleAdd = useCallback(() => {
    if (!text.trim()) return;
    const payload: any = {
      text: text.trim(),
      textStyle,
      textColor,
      alignment,
      opacity: 1,
      textEffect,
      textAnimation,
      backgroundColor: textBgColor !== 'transparent' ? textBgColor : undefined,
    };
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: {
          ...editingLayer.payload,
          ...payload,
        },
      } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('text'), 10),
        type: 'text',
        width: 0.6,
        height: 0.1,
        payload,
      });
    }
    onClose();
  }, [text, textStyle, textColor, alignment, textEffect, textAnimation, textBgColor, isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <PickerShell title={isEditing ? 'Edit Text' : 'Add Text'} onClose={onClose}>
      <View style={styles.textPickerBody}>
        {/* Live preview — shows text with selected style + color */}
        <View style={styles.textPreview}>
          <Text
            style={[
              styles.textPreviewText,
              { color: textColor, textAlign: alignment },
              TEXT_STYLE_PREVIEW[textStyle] ?? TEXT_STYLE_PREVIEW.clean,
              textStyle === 'neon' && {
                textShadowColor: textColor,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 12,
              },
            ]}
            numberOfLines={3}
          >
            {text.trim() || 'Your text preview'}
          </Text>
        </View>

        <TextInput
          style={styles.textInput}
          placeholder="Type your text..."
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={200}
          autoFocus
          accessibilityLabel="Text content"
        />

        {/* Style selector — each label rendered in its own style */}
        <Text style={styles.pickerSectionLabel}>Style</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TEXT_STYLES.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => { haptic.selection(); setTextStyle(s.key); }}
              style={[styles.styleOption, textStyle === s.key && styles.styleOptionActive]}
              accessibilityLabel={`Text style ${s.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: textStyle === s.key }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text
                style={[
                  styles.styleOptionText,
                  textStyle === s.key && styles.styleOptionTextActive,
                  TEXT_STYLE_PREVIEW[s.key] ?? TEXT_STYLE_PREVIEW.clean,
                  s.key === 'neon' && {
                    textShadowColor: textStyle === 'neon' ? colors.brand : textColor,
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 8,
                  },
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Color selector */}
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {TEXT_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setTextColor(c); setShowSpectrum(false); }}
              onLongPress={() => { haptic.medium(); setTextColor(c); setShowSpectrum(true); }}
              style={[styles.colorOption, { backgroundColor: c }, textColor === c && !showSpectrum && styles.colorOptionActive]}
              accessibilityLabel={`Text color ${c}`}
              accessibilityRole="button"
              accessibilityState={{ selected: textColor === c && !showSpectrum }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        {/* Spectrum picker — long-press any swatch to open */}
        {showSpectrum && (
          <View style={styles.spectrumWrap}>
            <LinearGradient
              colors={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.spectrumBar}
            >
              <Pressable
                style={styles.spectrumOverlay}
                onPress={(e) => {
                  const { locationX } = e.nativeEvent;
                  // Approximate hue from x position (0..width → 0..360°)
                  // width is approximate; the layout fills the row
                  const ratio = Math.max(0, Math.min(1, locationX / (screenWidth - Space.md * 2 - 4)));
                  const hue = ratio * 360;
                  const hex = hslToHex(hue, 80, 55);
                  setTextColor(hex);
                }}
                accessibilityLabel="Spectrum color picker"
                accessibilityRole="adjustable"
                accessibilityHint="Tap to select a color"
                accessibilityValue={{ text: `Color ${textColor}` }}
              />
            </LinearGradient>
            <View style={[styles.spectrumIndicator, { backgroundColor: textColor }]} />
            <PressScale onPress={() => { haptic.selection(); setShowSpectrum(false); }} style={styles.spectrumClose} accessibilityLabel="Close spectrum" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-up" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
            </PressScale>
          </View>
        )}

        {/* Alignment */}
        <Text style={styles.pickerSectionLabel}>Alignment</Text>
        <View style={styles.alignmentRow}>
          {TEXT_ALIGNMENTS.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => { haptic.selection(); setAlignment(a.key); }}
              style={[styles.alignmentOption, alignment === a.key && styles.alignmentOptionActive]}
              accessibilityLabel={`Align ${a.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected: alignment === a.key }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={a.icon} size={IconGrammar.standard} color={alignment === a.key ? colors.brand : colors.textSecondary} aria-hidden={true} />
            </Pressable>
          ))}
        </View>

        {/* Text effect — Instagram 2025-2026: shadow, neon, outline, glow */}
        <Text style={styles.pickerSectionLabel}>Effect</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TEXT_EFFECTS.map((e) => {
            const isActive = textEffect === e.key;
            const sampleColor = isActive ? colors.brand : colors.textPrimary;
            return (
              <Pressable
                key={e.key}
                onPress={() => { haptic.selection(); setTextEffect(e.key); }}
                style={({ pressed }) => [
                  styles.effectChip,
                  isActive && styles.effectChipActive,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                accessibilityLabel={`Text effect ${e.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text
                  style={[
                    styles.effectChipSample,
                    { color: sampleColor },
                    e.key === 'shadow' && { textShadowColor: '#000', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 3 },
                    e.key === 'neon' && { textShadowColor: isActive ? colors.brand : '#7B68EE', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
                    e.key === 'outline' && { borderWidth: Stroke.standard, borderColor: sampleColor, paddingHorizontal: Space.xs, borderRadius: Radius.sm },
                    e.key === 'glow' && { textShadowColor: isActive ? colors.brand : '#F5D547', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
                  ]}
                >
                  Aa
                </Text>
                <Text style={[styles.effectChipLabel, isActive && styles.effectChipLabelActive]}>{e.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Text animation — Instagram 2025-2026: typewriter, bounce, fade, slide */}
        <Text style={styles.pickerSectionLabel}>Animation</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TEXT_ANIMATIONS.map((a) => {
            const isActive = textAnimation === a.key;
            const animIcon: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
              none: 'close-outline',
              typewriter: 'keypad-outline',
              bounce: 'arrow-up-circle-outline',
              fade: 'eye-outline',
              slide: 'arrow-up-outline',
            };
            return (
              <Pressable
                key={a.key}
                onPress={() => { haptic.selection(); setTextAnimation(a.key); }}
                style={({ pressed }) => [
                  styles.animChip,
                  isActive && styles.animChipActive,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                accessibilityLabel={`Text animation ${a.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name={animIcon[a.key]} size={IconGrammar.standard} color={isActive ? colors.brand : colors.textSecondary} aria-hidden={true} />
                <Text style={[styles.animChipLabel, isActive && styles.animChipLabelActive]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Background color — Instagram 2025-2026: colored text background */}
        <Text style={styles.pickerSectionLabel}>Background</Text>
        <View style={styles.colorRow}>
          {TEXT_BG_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setTextBgColor(c); }}
              style={[
                styles.colorOption,
                { backgroundColor: c === 'transparent' ? 'transparent' : c },
                c === 'transparent' && styles.colorOptionTransparent,
                textBgColor === c && styles.colorOptionActive,
              ]}
              accessibilityLabel={`Background ${c === 'transparent' ? 'none' : c}`}
              accessibilityRole="button"
              accessibilityState={{ selected: textBgColor === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {c === 'transparent' && (
                <Ionicons name="close" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} />
              )}
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleAdd} style={[styles.saveBtn, !text.trim() && styles.saveBtnDisabled]} disabled={!text.trim()} accessibilityLabel={isEditing ? 'Update text' : 'Add text'} accessibilityRole="button" accessibilityState={{ disabled: !text.trim() }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Text'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Draw Picker ───────────────────────────────────────────────────
// Instagram/Snapchat parity: freehand drawing with pen, marker,
// highlighter, neon, and eraser. Uses Skia for performant stroke
// rendering and react-native-gesture-handler for pan capture.

const DRAW_TOOLS: Array<{ key: 'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser' | 'chalk'; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'pen', label: 'Pen', icon: 'create-outline' },
  { key: 'marker', label: 'Marker', icon: 'brush-outline' },
  { key: 'highlighter', label: 'Highlight', icon: 'color-fill-outline' },
  { key: 'neon', label: 'Neon', icon: 'flash-outline' },
  { key: 'eraser', label: 'Eraser', icon: 'backspace-outline' },
  { key: 'chalk', label: 'Chalk', icon: 'brush-outline' },
];

const DRAW_COLORS = ['#ffffff', '#000000', '#9b0202', '#215634', '#06489A', '#C9A46A', '#E06666', '#B85566', '#F5D547', '#7B68EE'];
const BRUSH_SIZES = [2, 4, 8, 14, 22];

interface DrawPoint { x: number; y: number; }
interface DrawStroke {
  points: DrawPoint[];
  color: string;
  width: number;
  tool: 'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser' | 'chalk' | 'emoji';
  emoji?: string;
  emojiSize?: number;
  emojiSpacing?: number;
  emojiJitter?: number;
}

function buildSkiaPath(points: DrawPoint[], canvasW: number, canvasH: number): any {
  if (points.length === 0) return null;
  const path = Skia.Path.Make();
  const first = points[0];
  path.moveTo(first.x * canvasW, first.y * canvasH);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = ((prev.x + curr.x) / 2) * canvasW;
    const midY = ((prev.y + curr.y) / 2) * canvasH;
    path.quadTo(prev.x * canvasW, prev.y * canvasH, midX, midY);
  }
  const last = points[points.length - 1];
  path.lineTo(last.x * canvasW, last.y * canvasH);
  return path;
}

const DrawPicker = React.memo(function DrawPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'draw';
  const existingStrokes: DrawStroke[] = editingLayer?.type === 'draw' ? editingLayer.payload.strokes ?? [] : [];

  const [strokes, setStrokes] = useState<DrawStroke[]>(existingStrokes);
  const [redoStack, setRedoStack] = useState<DrawStroke[]>([]);
  const [activeTool, setActiveTool] = useState<'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser' | 'chalk'>('pen');
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [canvasLayout, setCanvasLayout] = useState({ width: 320, height: 400 });
  const [showDrawSpectrum, setShowDrawSpectrum] = useState(false);

  // Current stroke being drawn
  const currentStroke = useSharedValue<DrawStroke | null>(null);
  const renderTick = useSharedValue(0);

  const panGesture = React.useMemo(() => {
    let currentPoints: DrawPoint[] = [];
    return Gesture.Pan()
      .onBegin((e) => {
        currentPoints = [{ x: e.x / canvasLayout.width, y: e.y / canvasLayout.height }];
        currentStroke.value = {
          points: [...currentPoints],
          color: activeTool === 'eraser' ? '#000000' : activeColor,
          width: activeTool === 'highlighter' ? brushSize * 3 : activeTool === 'neon' ? brushSize * 1.5 : brushSize,
          tool: activeTool,
        };
      })
      .onUpdate((e) => {
        currentPoints.push({ x: e.x / canvasLayout.width, y: e.y / canvasLayout.height });
        currentStroke.value = {
          points: [...currentPoints],
          color: activeTool === 'eraser' ? '#000000' : activeColor,
          width: activeTool === 'highlighter' ? brushSize * 3 : activeTool === 'neon' ? brushSize * 1.5 : brushSize,
          tool: activeTool,
        };
        renderTick.value = renderTick.value + 1;
      })
      .onEnd(() => {
        if (currentPoints.length > 1) {
          runOnJS(commitStroke)({
            points: [...currentPoints],
            color: activeTool === 'eraser' ? '#000000' : activeColor,
            width: activeTool === 'highlighter' ? brushSize * 3 : activeTool === 'neon' ? brushSize * 1.5 : brushSize,
            tool: activeTool,
          });
        }
        currentStroke.value = null;
        currentPoints = [];
      })
      .minDistance(1)
      .maxPointers(1);
  }, [activeTool, activeColor, brushSize, canvasLayout.width, canvasLayout.height]);

  const commitStroke = useCallback((stroke: DrawStroke) => {
    setStrokes((prev) => [...prev, stroke]);
  }, []);

  const handleUndo = useCallback(() => {
    haptic.selection();
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const lastStroke = prev[prev.length - 1];
      setRedoStack((redoPrev) => [...redoPrev, lastStroke]);
      return prev.slice(0, -1);
    });
  }, [haptic]);

  const handleRedo = useCallback(() => {
    haptic.selection();
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const strokeToRestore = prev[prev.length - 1];
      setStrokes((strokesPrev) => [...strokesPrev, strokeToRestore]);
      return prev.slice(0, -1);
    });
  }, [haptic]);

  const handleClear = useCallback(() => {
    haptic.medium();
    setStrokes([]);
    setRedoStack([]);
  }, [haptic]);

  const handleDone = useCallback(() => {
    haptic.medium();
    const payload: any = {
      strokes,
      opacity: 1,
    };
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: { ...editingLayer.payload, ...payload },
      } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('draw'), 10),
        type: 'draw',
        width: 0.9,
        height: 0.9,
        payload,
      });
    }
    onClose();
  }, [strokes, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  // Build Skia paths for rendering
  const renderStrokes = useMemo(() => {
    const allStrokes = [...strokes];
    // Include current stroke for live preview
    const live = currentStroke.value;
    if (live && live.points.length > 1) allStrokes.push(live);
    return allStrokes;
  }, [strokes, renderTick]);

  return (
    <PickerShell title={isEditing ? 'Edit Drawing' : 'Draw'} onClose={onClose}>
      <View style={styles.drawBody}>
        {/* Drawing canvas */}
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View
            style={styles.drawCanvasWrap}
            onLayout={(e) => setCanvasLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <GestureDetector gesture={panGesture}>
              <View style={StyleSheet.absoluteFill} collapsable={false}>
                <Canvas style={StyleSheet.absoluteFill}>
                  {renderStrokes.map((stroke, i) => {
                    const skPath = buildSkiaPath(stroke.points, canvasLayout.width, canvasLayout.height);
                    if (!skPath) return null;
                    const isEraser = stroke.tool === 'eraser';
                    const isMarker = stroke.tool === 'marker';
                    const isHighlighter = stroke.tool === 'highlighter';
                    const isNeon = stroke.tool === 'neon';
                    const isChalk = stroke.tool === 'chalk';
                    return (
                      <Path
                        key={i}
                        path={skPath}
                        style="stroke"
                        strokeWidth={stroke.width}
                        color={stroke.color}
                        strokeCap={isChalk ? 'butt' : 'round'}
                        strokeJoin={isChalk ? 'miter' : 'round'}
                        opacity={isHighlighter ? 0.35 : isMarker ? 0.6 : isChalk ? 0.85 : 1}
                        blendMode={isEraser ? "clear" : isNeon ? "screen" : "srcOver"}
                      >
                        {isChalk && (
                          <DashPathEffect intervals={[stroke.width * 1.8, stroke.width * 0.9]} />
                        )}
                      </Path>
                    );
                  })}
                </Canvas>
              </View>
            </GestureDetector>
            {strokes.length === 0 && (
              <View style={styles.drawCanvasHint} pointerEvents="none">
                <Text style={styles.drawCanvasHintText}>Draw with your finger</Text>
              </View>
            )}
            {/* Vertical brush size slider — left side, drag up=thicker */}
            {activeTool !== 'eraser' && (
              <View style={styles.brushSliderWrap} pointerEvents="box-none">
                <Pressable
                  style={styles.brushSliderTrack}
                  onPress={(e) => {
                    const { locationY } = e.nativeEvent;
                    const trackHeight = 120;
                    const ratio = 1 - Math.max(0, Math.min(1, locationY / trackHeight));
                    const newSize = Math.max(2, Math.min(20, Math.round(2 + ratio * 18)));
                    haptic.selection();
                    setBrushSize(newSize);
                  }}
                  accessibilityLabel="Brush size slider"
                  accessibilityRole="adjustable"
                  accessibilityHint="Tap higher to decrease, lower to increase brush size"
                  accessibilityValue={{ min: 2, max: 20, now: brushSize, text: `Brush size ${brushSize}` }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[styles.brushSliderFill, { height: `${(brushSize - 2) / 18 * 100}%` }]} />
                  <View style={[styles.brushSliderHandle, { bottom: `${(brushSize - 2) / 18 * 100}%` }]}>
                    <View style={[styles.brushSliderDot, { width: Math.max(6, Math.min(22, brushSize + 4)), height: Math.max(6, Math.min(22, brushSize + 4)), borderRadius: Radius.full, backgroundColor: activeColor }]} />
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        </GestureHandlerRootView>

        {/* Tool selector */}
        <Text style={styles.pickerSectionLabel}>Brush</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll} contentContainerStyle={styles.brushChipScroll}>
          {DRAW_TOOLS.map((t) => {
            const isActive = activeTool === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => { haptic.selection(); setActiveTool(t.key); }}
                style={({ pressed }) => [
                  styles.brushChip,
                  isActive && styles.brushChipActive,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                accessibilityLabel={`Brush ${t.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name={t.icon} size={IconGrammar.standard} color={isActive ? colors.textInverse : colors.textSecondary} aria-hidden={true} />
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Color selector (hidden for eraser) */}
        {activeTool !== 'eraser' && (
          <>
            <Text style={styles.pickerSectionLabel}>Color</Text>
            <View style={styles.colorRow}>
              {DRAW_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => { haptic.selection(); setActiveColor(c); setShowDrawSpectrum(false); }}
                  onLongPress={() => { haptic.medium(); setActiveColor(c); setShowDrawSpectrum(true); }}
                  style={[styles.colorOption, { backgroundColor: c }, activeColor === c && !showDrawSpectrum && styles.colorOptionActive]}
                  accessibilityLabel={`Draw color ${c}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeColor === c && !showDrawSpectrum }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                />
              ))}
            </View>
            {/* Spectrum picker — long-press any swatch to open */}
            {showDrawSpectrum && (
              <View style={styles.spectrumWrap}>
                <LinearGradient
                  colors={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.spectrumBar}
                >
                  <Pressable
                    style={styles.spectrumOverlay}
                    onPress={(e) => {
                      const { locationX } = e.nativeEvent;
                      const ratio = Math.max(0, Math.min(1, locationX / (screenWidth - Space.md * 2 - 4)));
                      const hue = ratio * 360;
                      setActiveColor(hslToHex(hue, 80, 55));
                    }}
                    accessibilityLabel="Spectrum color picker"
                    accessibilityRole="adjustable"
                    accessibilityHint="Tap to select a color"
                    accessibilityValue={{ text: `Color ${activeColor}` }}
                  />
                </LinearGradient>
                <View style={[styles.spectrumIndicator, { backgroundColor: activeColor }]} />
                <PressScale onPress={() => { haptic.selection(); setShowDrawSpectrum(false); }} style={styles.spectrumClose} accessibilityLabel="Close spectrum" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="chevron-up" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
                </PressScale>
              </View>
            )}
          </>
        )}

        {/* Brush size */}
        <Text style={styles.pickerSectionLabel}>Size</Text>
        <View style={styles.brushSizeRow}>
          {BRUSH_SIZES.map((s) => {
            const isActive = brushSize === s;
            const previewColor = activeTool === 'eraser' ? colors.textSecondary : isActive ? colors.brand : activeColor;
            const dotSize = Math.max(6, Math.min(28, s + 4));
            return (
              <Pressable
                key={s}
                onPress={() => { haptic.selection(); setBrushSize(s); }}
                style={({ pressed }) => [styles.brushSizeOption, isActive && styles.brushSizeOptionActive, pressed && { opacity: 0.7 }]}
                accessibilityLabel={`Brush size ${s}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <View style={[styles.brushSizeDot, { width: dotSize, height: dotSize, backgroundColor: previewColor }]} />
              </Pressable>
            );
          })}
        </View>

        {/* Live stroke preview — shows actual brush diameter in active color */}
        <View style={styles.brushPreviewWrap}>
          <View
            style={[
              styles.brushPreviewDot,
              {
                width: Math.max(4, Math.min(28, brushSize)),
                height: Math.max(4, Math.min(28, brushSize)),
                borderRadius: Math.max(2, Math.min(14, brushSize / 2)),
                backgroundColor: activeTool === 'eraser' ? colors.surfaceAlt : activeColor,
              },
            ]}
          />
          <Text style={styles.brushPreviewLabel}>{brushSize}px</Text>
        </View>

        {/* Actions */}
        <View style={styles.drawActions}>
          <PressScale onPress={handleUndo} disabled={strokes.length === 0} style={[styles.drawActionBtn, ...(strokes.length === 0 ? [{ opacity: 0.4 }] : [])]} accessibilityLabel="Undo stroke" accessibilityState={{ disabled: strokes.length === 0 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-undo-outline" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
            <Text style={styles.drawActionLabel}>Undo</Text>
          </PressScale>
          <PressScale onPress={handleRedo} disabled={redoStack.length === 0} style={[styles.drawActionBtn, ...(redoStack.length === 0 ? [{ opacity: 0.4 }] : [])]} accessibilityLabel="Redo stroke" accessibilityState={{ disabled: redoStack.length === 0 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="refresh-outline" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
            <Text style={styles.drawActionLabel}>Redo</Text>
          </PressScale>
          <PressScale onPress={handleClear} style={styles.drawActionBtn} accessibilityLabel="Clear drawing" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="trash-outline" size={IconGrammar.standard} color={colors.danger} aria-hidden={true} />
            <Text style={[styles.drawActionLabel, { color: colors.danger }]}>Clear</Text>
          </PressScale>
          <PressScale onPress={handleDone} style={[styles.drawDoneBtn, { backgroundColor: colors.brand }]} accessibilityLabel="Done drawing" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.drawDoneBtnText}>Done</Text>
          </PressScale>
        </View>
      </View>
    </PickerShell>
  );
});

// ── GIF Picker ────────────────────────────────────────────────────
// GIPHY-style search: trending GIFs on load, search by query.
// Uses GIPHY public API with configurable key (EXPO_PUBLIC_GIPHY_API_KEY).

const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY?.trim() || 'dc6zaTOxFJmzC';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

const GIF_CATEGORIES: Array<{ key: string; label: string; tag: string }> = [
  { key: 'trending', label: 'Trending', tag: '' },
  { key: 'reactions', label: 'Reactions', tag: 'reactions' },
  { key: 'emotions', label: 'Emotions', tag: 'emotions' },
  { key: 'animals', label: 'Animals', tag: 'animals' },
  { key: 'celebrate', label: 'Celebrate', tag: 'celebrate' },
  { key: 'memes', label: 'Mem', tag: 'memes' },
];

interface GifResult {
  id: string;
  gifUrl: string;
  stillUrl: string;
  altText: string;
  width: number;
  height: number;
}

const GifPicker = React.memo(function GifPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const [results, setResults] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchGifs = useCallback(async (searchQuery: string, category: string) => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const catDef = GIF_CATEGORIES.find((c) => c.key === category);
      const catTag = catDef?.tag ?? '';
      const useTrending = !searchQuery.trim() && (!catTag || category === 'trending');
      const endpoint = searchQuery.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery.trim())}&limit=24&rating=g`
        : useTrending
          ? `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`
          : `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(catTag)}&limit=24&rating=g`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`GIPHY ${res.status}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      const gifs: GifResult[] = (json.data ?? []).map((g: any) => ({
        id: g.id,
        gifUrl: g.images?.fixed_height?.url ?? g.images?.original?.url ?? '',
        stillUrl: g.images?.fixed_height_still?.url ?? g.images?.original_still?.url,
        altText: g.title?.slice(0, 80) ?? 'GIF',
        width: parseInt(g.images?.fixed_height?.width ?? '200', 10),
        height: parseInt(g.images?.fixed_height?.height ?? '200', 10),
      })).filter((g: GifResult) => g.gifUrl);
      setResults(gifs);
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message || 'Failed to load GIFs');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs('', 'trending');
  }, [fetchGifs]);

  // Debounced search — refetch when query or category changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGifs(query, activeCategory);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, activeCategory, fetchGifs]);

  const handleCategorySelect = useCallback((catKey: string) => {
    haptic.selection();
    setActiveCategory(catKey);
    setQuery('');
  }, [haptic]);

  const handleSelect = useCallback((gif: GifResult) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('gif'), 10),
      type: 'gif',
      width: 0.25,
      height: 0.25 * (gif.height / gif.width),
      payload: {
        gifUrl: gif.gifUrl,
        stillUrl: gif.stillUrl,
        altText: gif.altText,
        source: 'giphy',
        opacity: 1,
      },
    });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  const renderGifItem = useCallback<ListRenderItem<GifResult>>(({ item }) => (
    <Pressable
      onPress={() => handleSelect(item)}
      style={styles.gifCell}
      accessibilityLabel={`Select GIF ${item.altText}`}
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Image
        source={{ uri: item.stillUrl || item.gifUrl }}
        style={styles.gifThumb}
        contentFit="cover"
      />
    </Pressable>
  ), [handleSelect, styles]);

  return (
    <PickerShell title="GIF" onClose={onClose} compact>
      {/* Category chips — premium style matching sticker tray */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gifCategoryScroll} contentContainerStyle={styles.gifCategoryContent}>
        {GIF_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => handleCategorySelect(cat.key)}
              style={({ pressed }) => [
                styles.gifCategoryChip,
                isActive && { backgroundColor: colors.brand },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={`GIF category ${cat.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.gifCategoryChipText, isActive && { color: colors.textInverse }]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search GIFs..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search GIFs"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load GIFs</Text>
          <Pressable onPress={() => fetchGifs(query, activeCategory)} style={styles.retryBtn} accessibilityLabel="Retry GIF search" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={renderGifItem}
          style={styles.gifList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No GIFs found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
});

// ── Music Picker ──────────────────────────────────────────────────
// Instagram-style music sticker: search trending tracks via iTunes API
// (free, no auth required). Shows album art + track name + artist.

interface MusicTrack {
  trackId: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  previewUrl: string;
}

const MusicPicker = React.memo(function MusicPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTrack, setPreviewTrack] = useState<MusicTrack | null>(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchTracks = useCallback(async (searchQuery: string) => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = searchQuery.trim()
        ? `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery.trim())}&media=music&limit=25`
        : `https://itunes.apple.com/search?term=top+hits&media=music&limit=25`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`iTunes ${res.status}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      const tracks: MusicTrack[] = (json.results ?? []).map((t: any) => ({
        trackId: String(t.trackId ?? t.collectionId ?? ''),
        trackName: t.trackName ?? t.collectionName ?? 'Unknown Track',
        artistName: t.artistName ?? '',
        artworkUrl: (t.artworkUrl100 ?? t.artworkUrl60 ?? '').replace('100x100', '200x200'),
        previewUrl: t.previewUrl ?? '',
      })).filter((t: MusicTrack) => t.trackId && t.artworkUrl);
      setResults(tracks);
      // Default the live preview to the first track so the sticker is never empty
      if (tracks.length > 0) setPreviewTrack((prev) => prev ?? tracks[0]);
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message || 'Failed to load tracks');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks('');
  }, [fetchTracks]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTracks(query);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, fetchTracks]);

  const handleSelect = useCallback((track: MusicTrack) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('music'), 10),
      type: 'music',
      width: 0.5,
      height: 0.12,
      payload: {
        trackName: track.trackName,
        artistName: track.artistName,
        artworkUrl: track.artworkUrl,
        previewUrl: track.previewUrl,
        trackId: track.trackId,
        opacity: 1,
        volume: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  const renderMusicItem = useCallback<ListRenderItem<MusicTrack>>(({ item }) => (
    <Pressable
      onPress={() => handleSelect(item)}
      onPressIn={() => setPreviewTrack(item)}
      style={({ pressed }) => [styles.musicRow, pressed && { opacity: 0.6 }]}
      accessibilityLabel={`Select ${item.trackName} by ${item.artistName}`}
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Image source={{ uri: item.artworkUrl }} style={styles.musicArtwork} contentFit="cover" />
      <View style={styles.musicInfo}>
        <Text style={styles.musicTrackName} numberOfLines={1}>{item.trackName}</Text>
        <Text style={styles.musicArtistName} numberOfLines={1}>{item.artistName}</Text>
      </View>
      <View style={styles.musicAddBtn}>
        <Ionicons name="checkmark" size={IconGrammar.standard} color={colors.brand} aria-hidden={true} />
      </View>
    </Pressable>
  ), [handleSelect, setPreviewTrack, styles, colors]);

  return (
    <PickerShell title="Music" onClose={onClose}>
      {/* Live sticker preview — shows how the music sticker will look on canvas */}
      <View style={styles.musicPreviewCard}>
        {previewTrack ? (
          <>
            <Image source={{ uri: previewTrack.artworkUrl }} style={styles.musicPreviewArt} contentFit="cover" />
            <View style={styles.musicPreviewInfo}>
              <Text style={styles.musicPreviewTrackName} numberOfLines={1}>{previewTrack.trackName}</Text>
              <Text style={styles.musicPreviewArtistName} numberOfLines={1}>{previewTrack.artistName}</Text>
            </View>
            <View style={styles.musicPreviewPlayBtn}>
              <Ionicons name="play" size={IconGrammar.metadata} color={colors.brand} aria-hidden={true} />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.musicPreviewArt, { backgroundColor: colors.surfaceAlt }]} />
            <View style={styles.musicPreviewInfo}>
              <Text style={styles.musicPreviewTrackName}>Select a track</Text>
              <Text style={styles.musicPreviewArtistName}>Search to preview</Text>
            </View>
            <View style={styles.musicPreviewPlayBtn}>
              <Ionicons name="play" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
            </View>
          </>
        )}
      </View>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search songs, artists..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search music"
        />
      </View>
      {isLoading && (
        <View style={styles.musicLoadingRow}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.musicLoadingText}>Searching...</Text>
        </View>
      )}
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load music</Text>
          <Pressable onPress={() => fetchTracks(query)} style={styles.retryBtn} accessibilityLabel="Retry music search" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item) => item.trackId}
          renderItem={renderMusicItem}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No tracks found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
});

// ── Quiz Picker ───────────────────────────────────────────────────
// Instagram 2026 parity: multiple-choice quiz with correct answer.

const QUIZ_EMOJIS = ['🎯', '🔥', '💡', '❓', '✅', '⭐', '🎨', '👍'];

const QuizPicker = React.memo(function QuizPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'quiz';
  const existing = editingLayer?.type === 'quiz' ? editingLayer.payload : null;

  const [question, setQuestion] = useState(existing?.question ?? '');
  const [options, setOptions] = useState<string[]>(existing?.options?.map((o: any) => o.label) ?? ['', '']);
  const [correctIdx, setCorrectIdx] = useState<number>(() => {
    if (existing?.correctOptionId && existing?.options) {
      return existing.options.findIndex((o: any) => o.id === existing.correctOptionId);
    }
    return 0;
  });
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯');
  const [timerMs, setTimerMs] = useState<number | null>(existing?.timerMs ?? null);

  const QUIZ_TIMER_OPTIONS = [
    { label: 'No timer', value: null as number | null },
    { label: '15s', value: 15000 },
    { label: '30s', value: 30000 },
    { label: '1m', value: 60000 },
    { label: '5m', value: 300000 },
  ];

  const handleAdd = useCallback(() => {
    if (!question.trim() || options.filter(o => o.trim()).length < 2) return;
    haptic.medium();
    const cleanOptions = options.filter(o => o.trim()).slice(0, 4);
    const optionObjs = cleanOptions.map((label, i) => ({ id: `opt_${i}_${Date.now()}`, label: label.trim() }));
    const payload: any = {
      question: question.trim(),
      options: optionObjs,
      correctOptionId: optionObjs[correctIdx]?.id ?? optionObjs[0].id,
      emoji,
      ...(timerMs ? { timerMs } : {}),
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('quiz'), 10),
        type: 'quiz',
        width: 0.7,
        height: 0.25,
        payload,
      });
    }
    onClose();
  }, [question, options, correctIdx, emoji, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Quiz' : 'Add Quiz'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        {/* Live preview — mini quiz sticker */}
        <View style={styles.quizPreviewWrap}>
          <View style={styles.quizPreviewHeader}>
            <Text style={styles.quizPreviewEmoji}>{emoji}</Text>
            <Text style={styles.quizPreviewQuestion} numberOfLines={2}>
              {question.trim() || 'Ask a question...'}
            </Text>
          </View>
          {options.filter(o => o.trim()).slice(0, 4).map((opt, i) => (
            <View key={i} style={[styles.quizPreviewOption, correctIdx === i && styles.quizPreviewOptionCorrect]}>
              <Text style={styles.quizPreviewOptionText} numberOfLines={1}>{opt.trim()}</Text>
              {correctIdx === i && (
                <Ionicons name="checkmark-circle" size={IconGrammar.metadata} color={colors.success} aria-hidden={true} />
              )}
            </View>
          ))}
          {options.filter(o => o.trim()).length === 0 && (
            <View style={styles.quizPreviewOption}>
              <Text style={[styles.quizPreviewOptionText, { opacity: 0.5 }]}>Add options...</Text>
            </View>
          )}
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Ask a question..."
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={100}
          autoFocus
          accessibilityLabel="Quiz question"
        />
        <Text style={styles.pickerSectionLabel}>Options (tap to mark correct)</Text>
        {options.map((opt, i) => (
          <View key={i} style={styles.quizOptionRow}>
            <Pressable
              onPress={() => { haptic.selection(); setCorrectIdx(i); }}
              style={[styles.quizCorrectDot, correctIdx === i && { backgroundColor: colors.success }]}
              accessibilityLabel={`Mark option ${i + 1} as correct`}
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {correctIdx === i && <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />}
            </Pressable>
            <TextInput
              style={[styles.textInput, { flex: 1, minHeight: 44 }]}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.textMuted}
              value={opt}
              onChangeText={(v) => setOptions(prev => prev.map((o, idx) => idx === i ? v : o))}
              maxLength={50}
              accessibilityLabel={`Quiz option ${i + 1}`}
            />
            {options.length > 2 && (
              <Pressable
                onPress={() => {
                  haptic.warning();
                  setOptions(prev => prev.filter((_, idx) => idx !== i));
                  if (correctIdx >= i && correctIdx > 0) setCorrectIdx(correctIdx - 1);
                }}
                style={styles.quizRemoveBtn}
                accessibilityLabel={`Remove option ${i + 1}`}
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close-circle" size={IconGrammar.standard} color={colors.danger} aria-hidden={true} />
              </Pressable>
            )}
          </View>
        ))}
        {options.length < 4 && (
          <Pressable
            onPress={() => { haptic.selection(); setOptions(prev => [...prev, '']); }}
            style={styles.quizAddOptionBtn}
            accessibilityLabel="Add option"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="add-circle-outline" size={IconGrammar.standard} color={colors.brand} aria-hidden={true} />
            <Text style={styles.quizAddOptionText}>Add Option</Text>
          </Pressable>
        )}
        <Text style={styles.pickerSectionLabel}>Emoji</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {QUIZ_EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => { haptic.selection(); setEmoji(e); }}
              style={[styles.styleOption, emoji === e && styles.styleOptionActive]}
              accessibilityLabel={`Emoji ${e}`}
              accessibilityRole="button"
              accessibilityState={{ selected: emoji === e }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ fontSize: Type.title.size }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {/* Timer selection */}
        <Text style={styles.pickerSectionLabel}>Timer</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {QUIZ_TIMER_OPTIONS.map((t) => {
            const isActive = timerMs === t.value;
            return (
              <Pressable
                key={t.label}
                onPress={() => { haptic.selection(); setTimerMs(t.value); }}
                style={({ pressed }) => [
                  styles.timerChip,
                  isActive && { backgroundColor: colors.brand, borderColor: colors.brand },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel={`Timer: ${t.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.timerChipText, isActive && { color: colors.scrimTextPrimary }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={handleAdd}
          disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
          style={[styles.saveBtn, (!question.trim() || options.filter(o => o.trim()).length < 2) && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update quiz' : 'Add quiz'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !question.trim() || options.filter(o => o.trim()).length < 2 }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Quiz'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Question Picker ───────────────────────────────────────────────
// Instagram 2026 parity: open-ended question box sticker.

const QuestionPicker = React.memo(function QuestionPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'question';
  const existing = editingLayer?.type === 'question' ? editingLayer.payload : null;

  const [prompt, setPrompt] = useState(existing?.prompt ?? '');
  const [placeholder, setPlaceholder] = useState(existing?.placeholder ?? 'Type something...');
  const [bgColor, setBgColor] = useState(existing?.backgroundColor ?? '#9b0202');

  const QUESTION_BG_COLORS = ['#9b0202', '#215634', '#06489A', '#6B3245', '#1a1a1a', '#C9A46A'];

  const handleAdd = useCallback(() => {
    if (!prompt.trim()) return;
    haptic.medium();
    const payload: any = {
      prompt: prompt.trim(),
      placeholder: placeholder.trim() || 'Type something...',
      backgroundColor: bgColor,
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('question'), 10),
        type: 'question',
        width: 0.6,
        height: 0.12,
        payload,
      });
    }
    onClose();
  }, [prompt, placeholder, bgColor, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Question' : 'Ask Me'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={[styles.questionPreviewWrap, { backgroundColor: bgColor }]}>
          <View style={styles.questionPreviewIconRow}>
            <Ionicons name="chatbubble-ellipses" size={IconGrammar.metadata} color="rgba(255,255,255,0.7)" aria-hidden={true} />
          </View>
          <Text style={styles.questionPreviewPrompt}>
            {prompt.trim() || 'Ask me a question'}
          </Text>
          <View style={styles.questionPreviewInputRow}>
            <Text style={styles.questionPreviewPlaceholder}>
              {placeholder.trim() || 'Type something...'}
            </Text>
            <View style={styles.questionPreviewSendDot} />
          </View>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Question prompt..."
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          maxLength={100}
          autoFocus
          accessibilityLabel="Question prompt"
        />
        <TextInput
          style={styles.textInput}
          placeholder="Placeholder text..."
          placeholderTextColor={colors.textMuted}
          value={placeholder}
          onChangeText={setPlaceholder}
          maxLength={80}
          accessibilityLabel="Question placeholder"
        />
        <Text style={styles.pickerSectionLabel}>Background</Text>
        <View style={styles.colorRow}>
          {QUESTION_BG_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setBgColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, bgColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Background ${c}`}
              accessibilityRole="button"
              accessibilityState={{ selected: bgColor === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!prompt.trim()}
          style={[styles.saveBtn, !prompt.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update question' : 'Add question'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !prompt.trim() }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Question'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Emoji Slider Picker ───────────────────────────────────────────
// Instagram 2026 parity: emoji slider for intensity measurement.

const SLIDER_EMOJIS = ['😍', '🔥', '💯', '😂', '🤔', '👍', '❤️', '✨', '🎨', '🛍️'];

const EmojiSliderPicker = React.memo(function EmojiSliderPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'emojiSlider';
  const existing = editingLayer?.type === 'emojiSlider' ? editingLayer.payload : null;

  const [question, setQuestion] = useState(existing?.question ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '😍');
  const [endLabel, setEndLabel] = useState(existing?.endLabel ?? '');
  const [sliderColor, setSliderColor] = useState(existing?.sliderColor ?? '#C9A46A');

  const SLIDER_COLORS = ['#C9A46A', '#9b0202', '#215634', '#06489A', '#6B3245', '#E06666'];

  const handleAdd = useCallback(() => {
    if (!question.trim()) return;
    haptic.medium();
    const payload: any = {
      question: question.trim(),
      emoji,
      endLabel: endLabel.trim(),
      sliderColor,
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('emojiSlider'), 10),
        type: 'emojiSlider',
        width: 0.6,
        height: 0.1,
        payload,
      });
    }
    onClose();
  }, [question, emoji, endLabel, sliderColor, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Slider' : 'Emoji Slider'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.sliderPreviewWrap}>
          <Text style={styles.sliderPreviewQuestion}>
            {question.trim() || 'How much do you love it?'}
          </Text>
          <View style={styles.sliderPreviewRow}>
            <Text style={styles.sliderPreviewEmoji}>{emoji}</Text>
            <View style={styles.sliderPreviewTrack}>
              <View style={[styles.sliderPreviewFill, { width: '60%', backgroundColor: sliderColor }]} />
              <View style={[styles.sliderPreviewHandle, { left: '60%', backgroundColor: sliderColor }]} />
            </View>
          </View>
          {endLabel.trim() ? (
            <Text style={styles.sliderPreviewEndLabel}>{endLabel.trim()}</Text>
          ) : null}
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Ask something..."
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={80}
          autoFocus
          accessibilityLabel="Slider question"
        />
        <TextInput
          style={styles.textInput}
          placeholder="End label (optional)..."
          placeholderTextColor={colors.textMuted}
          value={endLabel}
          onChangeText={setEndLabel}
          maxLength={20}
          accessibilityLabel="Slider end label"
        />
        <Text style={styles.pickerSectionLabel}>Emoji</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {SLIDER_EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => { haptic.selection(); setEmoji(e); }}
              style={[styles.styleOption, emoji === e && styles.styleOptionActive]}
              accessibilityLabel={`Emoji ${e}`}
              accessibilityRole="button"
              accessibilityState={{ selected: emoji === e }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ fontSize: Type.title.size }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.pickerSectionLabel}>Slider Color</Text>
        <View style={styles.colorRow}>
          {SLIDER_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setSliderColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, sliderColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Slider color ${c}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sliderColor === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!question.trim()}
          style={[styles.saveBtn, !question.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update slider' : 'Add slider'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !question.trim() }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Slider'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Countdown Picker ──────────────────────────────────────────────
// Instagram 2026 parity: countdown to a date/time sticker.

const CountdownPicker = React.memo(function CountdownPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'countdown';
  const existing = editingLayer?.type === 'countdown' ? editingLayer.payload : null;

  const [label, setLabel] = useState(existing?.label ?? '');
  const [endDate, setEndDate] = useState(() => {
    if (existing?.endDateTime) return new Date(existing.endDateTime);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [color, setColor] = useState(existing?.color ?? '#C9A46A');

  const COUNTDOWN_COLORS = ['#C9A46A', '#9b0202', '#215634', '#06489A', '#6B3245', '#1a1a1a'];

  const handleAdd = useCallback(() => {
    if (!label.trim()) return;
    haptic.medium();
    const payload: any = {
      label: label.trim(),
      endDateTime: endDate.toISOString(),
      color,
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('countdown'), 10),
        type: 'countdown',
        width: 0.5,
        height: 0.12,
        payload,
      });
    }
    onClose();
  }, [label, endDate, color, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  const formatDate = (d: Date) => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return d.toLocaleDateString('en-US', opts);
  };

  return (
    <PickerShell title={isEditing ? 'Edit Countdown' : 'Countdown'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={[styles.textPreview, { backgroundColor: color }]}>
          <Text style={{ color: '#fff', fontFamily: Typography.family.semibold, fontSize: Type.bodyStrong.size }}>
            {label.trim() || 'Event countdown'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontFamily: Typography.family.medium, fontSize: Type.title.size, marginTop: Space.xs }}>
            {formatDate(endDate)}
          </Text>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Countdown label..."
          placeholderTextColor={colors.textMuted}
          value={label}
          onChangeText={setLabel}
          maxLength={40}
          autoFocus
          accessibilityLabel="Countdown label"
        />
        <Text style={styles.pickerSectionLabel}>End Date & Time</Text>
        <Pressable
          onPress={() => {
            haptic.selection();
            // Simple date adjustment: cycle through next 7 days at 6pm
            const d = new Date(endDate);
            d.setDate(d.getDate() + 1);
            if (d.getDate() === 1) d.setDate(endDate.getDate() - 6);
            setEndDate(d);
          }}
          style={styles.countdownDateBtn}
          accessibilityLabel="Adjust end date"
          accessibilityHint="Cycles to the next day"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="calendar-outline" size={IconGrammar.standard} color={colors.brand} aria-hidden={true} />
          <Text style={styles.countdownDateText}>{formatDate(endDate)}</Text>
          <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {COUNTDOWN_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, color === c && styles.colorOptionActive]}
              accessibilityLabel={`Countdown color ${c}`}
              accessibilityRole="button"
              accessibilityState={{ selected: color === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!label.trim()}
          style={[styles.saveBtn, !label.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update countdown' : 'Add countdown'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !label.trim() }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Countdown'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Shape Picker ───────────────────────────────────────────────────

const SHAPES: Array<{ shape: 'circle' | 'square' | 'line' | 'arrow' | 'star' | 'heart'; icon: string; label: string }> = [
  { shape: 'circle', icon: 'ellipse-outline', label: 'Circle' },
  { shape: 'square', icon: 'square-outline', label: 'Square' },
  { shape: 'line', icon: 'remove', label: 'Line' },
  { shape: 'arrow', icon: 'arrow-up', label: 'Arrow' },
  { shape: 'star', icon: 'star', label: 'Star' },
  { shape: 'heart', icon: 'heart', label: 'Heart' },
];

const SHAPE_COLORS = ['#ffffff', '#000000', '#9b0202', '#215634', '#06489A', '#C9A46A', '#E06666', '#7B68EE'];

const ShapePicker = React.memo(function ShapePicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [activeColor, setActiveColor] = useState('#ffffff');
  const handleSelect = useCallback((shape: typeof SHAPES[0]) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('shape'), 5),
      type: 'decorative',
      width: 0.15,
      height: 0.15,
      payload: { shape: shape.shape, color: activeColor, opacity: 1 },
    });
    onClose();
  }, [onAddLayer, onClose, activeColor, haptic]);

  const renderShapePreview = (shape: string) => {
    switch (shape) {
      case 'circle':
        return <View style={{ width: 32, height: 32, borderRadius: Radius.full, backgroundColor: activeColor }} />;
      case 'square':
        return <View style={{ width: 32, height: 32, borderRadius: Radius.sm, backgroundColor: activeColor }} />;
      case 'line':
        return <View style={{ width: 32, height: 4, backgroundColor: activeColor }} />;
      case 'arrow':
        return (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: activeColor }} />
          </View>
        );
      case 'star':
        return <Ionicons name="star" size={IconGrammar.hero} color={activeColor} aria-hidden={true} />;
      case 'heart':
        return <Ionicons name="heart" size={IconGrammar.hero} color={activeColor} aria-hidden={true} />;
      default:
        return null;
    }
  };

  return (
    <PickerShell title="Add Shape" onClose={onClose} compact>
      <View style={styles.shapeGrid}>
        {SHAPES.map((s) => (
          <Pressable
            key={s.shape}
            onPress={() => handleSelect(s)}
            style={({ pressed }) => [styles.shapeOption, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
            accessibilityLabel={`Add ${s.label}`}
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.shapePreviewBox}>
              {renderShapePreview(s.shape)}
            </View>
            <Text style={styles.shapeLabel}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.pickerSectionLabel}>Color</Text>
      <View style={styles.colorRow}>
        {SHAPE_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => { haptic.selection(); setActiveColor(c); }}
            style={[styles.colorOption, { backgroundColor: c }, activeColor === c && styles.colorOptionActive]}
            accessibilityLabel={`Shape color ${c}`}
            accessibilityRole="button"
            accessibilityState={{ selected: activeColor === c }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          />
        ))}
      </View>
    </PickerShell>
  );
});

// ── Vote Picker ────────────────────────────────────────────────────

const VotePicker = React.memo(function VotePicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [timerMs, setTimerMs] = useState<number | null>(null);

  const TIMER_OPTIONS = [
    { label: 'No timer', value: null as number | null },
    { label: '1h', value: 3600000 },
    { label: '6h', value: 21600000 },
    { label: '24h', value: 86400000 },
    { label: '3d', value: 259200000 },
  ];

  const canSave = question.trim().length > 0 && options.filter(o => o.trim().length > 0).length >= 2;

  const updateOption = (index: number, value: string) => {
    setOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const addOption = () => {
    if (options.length < 4) {
      setOptions(prev => [...prev, '']);
      haptic.selection();
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(prev => prev.filter((_, i) => i !== index));
      haptic.warning();
    }
  };

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    haptic.medium();
    const validOptions = options
      .map(o => o.trim())
      .filter(o => o.length > 0)
      .map(label => ({ id: createStableId('opt'), label }));
    onAddLayer({
      ...baseLayer(createStableId('vote'), 10),
      type: 'vote',
      width: 0.5,
      height: 0.2,
      payload: {
        question: question.trim(),
        options: validOptions,
        ...(timerMs ? { timerMs } : {}),
      },
    });
    onClose();
  }, [question, options, timerMs, canSave, onAddLayer, onClose]);

  return (
    <PickerShell title="Add Style Vote" onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        {/* Live preview — mini vote sticker */}
        <View style={styles.votePreviewWrap}>
          <Text style={styles.votePreviewQuestion} numberOfLines={2}>
            {question.trim() || 'Which outfit is better?'}
          </Text>
          <View style={[styles.votePreviewOptions, { flexWrap: 'wrap' }]}>
            {options.filter(o => o.trim().length > 0).length > 0 ? (
              options.map((opt, i) => (
                opt.trim() ? (
                  <View key={i} style={[styles.votePreviewOption, { backgroundColor: withAlpha(colors.brand, 0.13), borderColor: withAlpha(colors.brand, 0.33) }]}>
                    <Text style={styles.votePreviewOptionText} numberOfLines={1}>{opt.trim()}</Text>
                  </View>
                ) : null
              ))
            ) : (
              <>
                <View style={[styles.votePreviewOption, { backgroundColor: withAlpha(colors.brand, 0.13), borderColor: withAlpha(colors.brand, 0.33) }]}>
                  <Text style={styles.votePreviewOptionText} numberOfLines={1}>Option 1</Text>
                </View>
                <View style={[styles.votePreviewOption, { backgroundColor: withAlpha(colors.brand, 0.13), borderColor: withAlpha(colors.brand, 0.33) }]}>
                  <Text style={styles.votePreviewOptionText} numberOfLines={1}>Option 2</Text>
                </View>
              </>
            )}
          </View>
          {timerMs && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'center' }}>
              <Ionicons name="timer-outline" size={IconGrammar.badge} color={colors.textSecondary} aria-hidden={true} />
              <Text style={{ fontFamily: Typography.family.medium, fontSize: 10, color: colors.textSecondary }}>
                {timerMs >= 86400000 ? `${Math.floor(timerMs / 86400000)}d` : timerMs >= 3600000 ? `${Math.floor(timerMs / 3600000)}h` : `${Math.floor(timerMs / 60000)}m`}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionLabel}>Question</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. Which outfit is better?"
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={100}
          autoFocus
          accessibilityLabel="Vote question"
        />
        {options.map((opt, i) => (
          <View key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.sectionLabel}>Option {i + 1}</Text>
              {options.length > 2 && (
                <Pressable onPress={() => removeOption(i)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={`Remove option ${i + 1}`} accessibilityRole="button">
                  <Ionicons name="close-circle" size={IconGrammar.standard} color={colors.danger} aria-hidden={true} />
                </Pressable>
              )}
            </View>
            <TextInput
              style={styles.textInput}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.textMuted}
              value={opt}
              onChangeText={(v) => updateOption(i, v)}
              maxLength={50}
              accessibilityLabel={`Vote option ${i + 1}`}
            />
          </View>
        ))}
        {options.length < 4 && (
          <Pressable
            onPress={addOption}
            style={({ pressed }) => [styles.addOptionBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Add option"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="add-circle-outline" size={IconGrammar.standard} color={colors.brand} aria-hidden={true} />
            <Text style={styles.addOptionBtnText}>Add Option ({options.length}/4)</Text>
          </Pressable>
        )}
        {/* Timer selection */}
        <Text style={styles.sectionLabel}>Timer</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TIMER_OPTIONS.map((t) => {
            const isActive = timerMs === t.value;
            return (
              <Pressable
                key={t.label}
                onPress={() => { haptic.selection(); setTimerMs(t.value); }}
                style={({ pressed }) => [
                  styles.timerChip,
                  isActive && { backgroundColor: colors.brand, borderColor: colors.brand },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel={`Timer: ${t.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.timerChipText, isActive && { color: colors.scrimTextPrimary }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel="Add vote" accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={styles.saveBtnText}>Add Vote</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Unified Sticker Tray ──────────────────────────────────────────
// Instagram-pattern: ONE sticker entry point that opens a tray with
// search + categories. Replaces the cluttered dock of individual
// sticker tools (Poll, Quiz, Ask, Slider, Countdown, Mention, GIF, Elements).
//
// Categories:
//   Interactive: Poll, Quiz, Question, Emoji Slider, Countdown
//   Mentions:    @Mention, Location, Hashtag
//   Media:       GIF, Music, Link
//   Utility:     Time, Weather, Shapes

interface StickerCategoryDef {
  key: string;
  label: string;
  stickers: StickerDef[];
}

interface StickerDef {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  emoji?: string;
  mode: AssetPickerMode;
  description?: string;
}

const STICKER_CATEGORIES: StickerCategoryDef[] = (
  [
    {
      key: 'interactive',
      label: 'Interactive',
      stickers: [
        { key: 'poll', label: 'Poll', icon: 'stats-chart-outline', mode: 'vote', description: '2-option vote' },
        { key: 'product', label: 'Item', icon: 'pricetag-outline', mode: 'product', description: 'Tag a listing' },
        { key: 'look', label: 'Look', icon: 'shirt-outline', mode: 'look', description: 'Tag a look' },
        { key: 'quiz', label: 'Quiz', icon: 'help-circle-outline', mode: 'quiz', description: 'Trivia with answer' },
        { key: 'question', label: 'Ask', icon: 'chatbubble-outline', mode: 'question', description: 'Open Q&A' },
        { key: 'emojiSlider', label: 'Slider', icon: 'happy-outline', mode: 'emojiSlider', description: 'Emoji rating' },
        { key: 'countdown', label: 'Countdown', icon: 'time-outline', mode: 'countdown', description: 'Count to a date' },
      ],
    },
    {
      key: 'mentions',
      label: 'Tags',
      stickers: [
        { key: 'mention', label: '@Mention', icon: 'at-outline', mode: 'mention', description: 'Tag a user' },
        { key: 'location', label: 'Location', icon: 'location-outline', mode: 'location', description: 'Tag a place' },
        { key: 'hashtag', label: 'Hashtag', icon: 'pricetag-outline', mode: 'hashtag', description: 'Topic tag' },
      ],
    },
    {
      key: 'media',
      label: 'Media',
      stickers: [
        { key: 'gif', label: 'GIF', icon: 'image-outline', mode: 'gif', description: 'Animated sticker' },
        { key: 'music', label: 'Music', icon: 'musical-notes-outline', mode: 'music', description: 'Song sticker' },
        { key: 'link', label: 'Link', icon: 'link-outline', mode: 'link', description: 'Clickable URL' },
      ],
    },
    {
      key: 'utility',
      label: 'Utility',
      stickers: [
        { key: 'time', label: 'Time', icon: 'time-outline', mode: 'time', description: 'Current timestamp' },
        { key: 'weather', label: 'Weather', icon: 'partly-sunny-outline', mode: 'weather', description: 'Conditions' },
        { key: 'shape', label: 'Shapes', icon: 'shapes-outline', mode: 'shape', description: 'Decorative shapes' },
      ],
    },
  ] as StickerCategoryDef[]
).map((cat) => ({
  ...cat,
  // Filter stickers by the capability registry. Visual layers (gif,
  // time, weather, shape) remain visible because they render from the
  // composition document. Interactive stickers whose backend support
  // is not verified are hidden — no tool may promise an interaction
  // the backend cannot persist or serve.
  stickers: cat.stickers.filter((s) => {
    const layerType = s.mode;
    if (isVisualLayer(layerType)) return true;
    const capId = getCapabilityForLayerType(layerType);
    if (!capId) return true;
    return isCapabilitySupported(capId);
  }),
})).filter((cat) => cat.stickers.length > 0);

const StickerTray = React.memo(function StickerTray({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('interactive');

  // Filter stickers by search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return STICKER_CATEGORIES;
    const q = search.toLowerCase();
    return STICKER_CATEGORIES
      .map((cat) => ({
        ...cat,
        stickers: cat.stickers.filter((s) =>
          s.label.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.stickers.length > 0);
  }, [search]);

  const activeCategoryDef = filteredCategories.find((c) => c.key === activeCategory) ?? filteredCategories[0];

  // StickerTray navigates to a specific picker via local state.
  // onClose of the sub-picker returns to the tray (not the whole picker).
  const [subMode, setSubMode] = useState<AssetPickerMode | null>(null);

  if (subMode) {
    // Render the specific picker, passing through onAddLayer.
    // onClose goes back to the sticker tray (not the whole picker).
    return (
      <AssetPickerContent
        mode={subMode}
        onClose={() => setSubMode(null)}
        onAddLayer={onAddLayer}
        editingLayer={null}
      />
    );
  }

  return (
    <SheetContainer visible={true} onClose={onClose} maxHeight={0.85}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Stickers</Text>
        <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close stickers" accessibilityHint="Closes the sticker tray" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} aria-hidden={true} />
        </PressScale>
      </View>

      {/* Search bar */}
      <View style={styles.stickerSearchWrap}>
        <Ionicons name="search-outline" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
        <TextInput
          style={styles.stickerSearchInput}
          placeholder="Search stickers..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Search stickers"
        />
        {search.length > 0 && (
          <PressScale onPress={() => setSearch('')} style={styles.stickerSearchClear} accessibilityLabel="Clear search" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={IconGrammar.standard} color={colors.textMuted} aria-hidden={true} />
          </PressScale>
        )}
      </View>

      {/* Category chips */}
      {!search.trim() && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerCategoryScroll} contentContainerStyle={styles.stickerCategoryContent}>
          {STICKER_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => { haptic.selection(); setActiveCategory(cat.key); }}
                style={[styles.stickerCategoryChip, isActive && { backgroundColor: colors.brand }]}
                accessibilityLabel={`Category ${cat.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.stickerCategoryChipText, isActive && { color: colors.textInverse }]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Sticker grid */}
      <ScrollView style={styles.stickerGridScroll} contentContainerStyle={styles.stickerGridContent}>
        {filteredCategories.length === 0 ? (
          <View style={styles.stickerEmptyState}>
            <Ionicons name="search-outline" size={IconGrammar.hero} color={colors.textMuted} aria-hidden={true} />
            <Text style={styles.stickerEmptyText}>No stickers found</Text>
          </View>
        ) : (
          (search.trim() ? filteredCategories : [activeCategoryDef]).map((cat) => (
            <View key={cat.key} style={styles.stickerCategorySection}>
              {search.trim() && (
                <Text style={styles.stickerCategoryTitle}>{cat.label}</Text>
              )}
              <View style={styles.stickerGrid}>
                {cat.stickers.map((sticker) => (
                  <Pressable
                    key={sticker.key}
                    onPress={() => { haptic.selection(); setSubMode(sticker.mode); }}
                    style={({ pressed }) => [styles.stickerCell, pressed && { opacity: 0.7 }]}
                    accessibilityLabel={`Add ${sticker.label} sticker`}
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name={sticker.icon} size={IconGrammar.hero} color={colors.brand} aria-hidden={true} />
                    <Text style={styles.stickerCellLabel} numberOfLines={1}>{sticker.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SheetContainer>
  );
});

// ── Link Picker ───────────────────────────────────────────────────

const LinkPicker = React.memo(function LinkPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'link';
  const existingPayload = editingLayer?.type === 'link' ? editingLayer.payload : null;

  const [url, setUrl] = useState(existingPayload?.url ?? '');
  const [ctaText, setCtaText] = useState(existingPayload?.ctaText ?? 'Link');
  const [bgColor, setBgColor] = useState(existingPayload?.backgroundColor ?? '#C9A46A');

  const canSave = url.trim().length > 0 && (url.startsWith('http://') || url.startsWith('https://'));

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    const payload: any = {
      url: url.trim(),
      ctaText: ctaText.trim() || 'Link',
      backgroundColor: bgColor,
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('link'), 10),
        type: 'link',
        width: 0.5,
        height: 0.08,
        payload,
      });
    }
    haptic.medium();
    onClose();
  }, [url, ctaText, bgColor, canSave, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Link' : 'Add Link'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="link-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>{ctaText || 'Link'}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>URL</Text>
        <TextInput
          style={styles.textInput}
          placeholder="https://..."
          placeholderTextColor={colors.textMuted}
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Link URL"
        />
        <Text style={styles.pickerSectionLabel}>Button Text</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Link"
          placeholderTextColor={colors.textMuted}
          value={ctaText}
          onChangeText={setCtaText}
          maxLength={40}
          accessibilityLabel="Link button text"
        />
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {['#C9A46A', '#9b0202', '#215634', '#06489A', '#000000', '#ffffff'].map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setBgColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, bgColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Link color ${c}`}
              accessibilityRole="button"
              accessibilityState={{ selected: bgColor === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel={isEditing ? 'Update link' : 'Add link'} accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Link'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Location Picker ───────────────────────────────────────────────

const LocationPicker = React.memo(function LocationPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'location';
  const existingPayload = editingLayer?.type === 'location' ? editingLayer.payload : null;

  const [placeName, setPlaceName] = useState(existingPayload?.placeName ?? '');

  const canSave = placeName.trim().length > 0;

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    const payload: any = {
      placeName: placeName.trim(),
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('location'), 10),
        type: 'location',
        width: 0.4,
        height: 0.06,
        payload,
      });
    }
    haptic.medium();
    onClose();
  }, [placeName, canSave, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Location' : 'Add Location'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="location-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>{placeName || 'Location'}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>Place Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. London, UK"
          placeholderTextColor={colors.textMuted}
          value={placeName}
          onChangeText={setPlaceName}
          maxLength={80}
          accessibilityLabel="Location name"
        />
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel={isEditing ? 'Update location' : 'Add location'} accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Location'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Hashtag Picker ────────────────────────────────────────────────

const HashtagPicker = React.memo(function HashtagPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'hashtag';
  const existingPayload = editingLayer?.type === 'hashtag' ? editingLayer.payload : null;

  const [tag, setTag] = useState(existingPayload?.tag ?? '');

  const canSave = tag.trim().length > 0;

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    const cleanTag = tag.trim().replace(/^#/, '');
    const payload: any = {
      tag: cleanTag,
      backgroundColor: '#C9A46A',
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('hashtag'), 10),
        type: 'hashtag',
        width: 0.4,
        height: 0.06,
        payload,
      });
    }
    haptic.medium();
    onClose();
  }, [tag, canSave, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Hashtag' : 'Add Hashtag'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="pricetag-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>#{tag.replace(/^#/, '') || 'hashtag'}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>Hashtag</Text>
        <TextInput
          style={styles.textInput}
          placeholder="thryftverse"
          placeholderTextColor={colors.textMuted}
          value={tag}
          onChangeText={setTag}
          maxLength={100}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Hashtag"
        />
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel={isEditing ? 'Update hashtag' : 'Add hashtag'} accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Hashtag'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Time Picker ───────────────────────────────────────────────────

const TimePicker = React.memo(function TimePicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'time';
  const existingPayload = editingLayer?.type === 'time' ? editingLayer.payload : null;

  const [format, setFormat] = useState<'time' | 'date' | 'datetime'>(existingPayload?.format ?? 'time');
  const now = new Date();
  const previewStr = format === 'time'
    ? now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : format === 'date'
    ? now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : now.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const handleAdd = useCallback(() => {
    const payload: any = {
      displayTime: new Date().toISOString(),
      format,
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('time'), 10),
        type: 'time',
        width: 0.3,
        height: 0.06,
        payload,
      });
    }
    haptic.medium();
    onClose();
  }, [format, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Time' : 'Add Time'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="time-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>{previewStr}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>Format</Text>
        <View style={styles.alignmentRow}>
          {([
            { key: 'time' as const, label: 'Time', icon: 'time-outline' as const },
            { key: 'date' as const, label: 'Date', icon: 'calendar-outline' as const },
            { key: 'datetime' as const, label: 'Both', icon: 'calendar-number-outline' as const },
          ] as const).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => { haptic.selection(); setFormat(f.key); }}
              style={[styles.alignmentOption, format === f.key && styles.alignmentOptionActive]}
              accessibilityLabel={`Time format ${f.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: format === f.key }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={f.icon} size={IconGrammar.standard} color={format === f.key ? colors.brand : colors.textSecondary} aria-hidden={true} />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={handleAdd} style={styles.saveBtn} accessibilityLabel={isEditing ? 'Update time' : 'Add time'} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Time'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Weather Picker ────────────────────────────────────────────────

const WeatherPicker = React.memo(function WeatherPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'weather';
  const existingPayload = editingLayer?.type === 'weather' ? editingLayer.payload : null;

  const [temperature, setTemperature] = useState(existingPayload?.temperature ?? 22);
  const [condition, setCondition] = useState(existingPayload?.condition ?? 'Sunny');
  const [emoji, setEmoji] = useState(existingPayload?.emoji ?? '☀️');
  const [locationName, setLocationName] = useState(existingPayload?.locationName ?? '');

  const WEATHER_OPTIONS = [
    { condition: 'Sunny', emoji: '☀️' },
    { condition: 'Partly Cloudy', emoji: '⛅' },
    { condition: 'Cloudy', emoji: '☁️' },
    { condition: 'Rainy', emoji: '🌧️' },
    { condition: 'Stormy', emoji: '⛈️' },
    { condition: 'Snowy', emoji: '❄️' },
    { condition: 'Foggy', emoji: '🌫️' },
    { condition: 'Windy', emoji: '💨' },
  ];

  const handleAdd = useCallback(() => {
    const payload: any = {
      temperature,
      condition,
      emoji,
      locationName: locationName.trim(),
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('weather'), 10),
        type: 'weather',
        width: 0.35,
        height: 0.08,
        payload,
      });
    }
    haptic.medium();
    onClose();
  }, [temperature, condition, emoji, locationName, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Weather' : 'Add Weather'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        {/* Premium weather preview pill */}
        <View style={styles.weatherPreviewPill}>
          <Text style={styles.weatherPreviewEmoji}>{emoji}</Text>
          <View style={styles.weatherPreviewInfo}>
            <Text style={styles.weatherPreviewTemp}>{temperature}°</Text>
            <Text style={styles.weatherPreviewCondition}>{condition}</Text>
          </View>
          {locationName.trim().length > 0 && (
            <View style={styles.weatherPreviewLocation}>
              <Ionicons name="location-outline" size={IconGrammar.badge} color="rgba(255,255,255,0.7)" aria-hidden={true} />
              <Text style={styles.weatherPreviewLocationText} numberOfLines={1}>{locationName.trim()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.pickerSectionLabel}>Condition</Text>
        <View style={styles.weatherGrid}>
          {WEATHER_OPTIONS.map((w) => {
            const isActive = condition === w.condition;
            return (
              <Pressable
                key={w.condition}
                onPress={() => { haptic.selection(); setCondition(w.condition); setEmoji(w.emoji); }}
                style={({ pressed }) => [
                  styles.weatherCell,
                  isActive && styles.weatherCellActive,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                accessibilityLabel={`Weather ${w.condition}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.weatherCellEmoji, isActive && { color: '#fff' }]}>{w.emoji}</Text>
                <Text style={[styles.weatherCellLabel, isActive && { color: '#fff' }]} numberOfLines={1}>{w.condition}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.inputCardLabel}>Temperature</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.inputCardText}
            placeholder="22"
            placeholderTextColor={colors.textMuted}
            value={String(temperature)}
            onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n)) setTemperature(n); }}
            keyboardType="numeric"
            accessibilityLabel="Temperature"
          />
          <Text style={styles.inputCardSuffix}>°C</Text>
        </View>
        <Text style={styles.inputCardLabel}>Location</Text>
        <View style={styles.inputCard}>
          <Ionicons name="location-outline" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
          <TextInput
            style={styles.inputCardText}
            placeholder="London, UK"
            placeholderTextColor={colors.textMuted}
            value={locationName}
            onChangeText={setLocationName}
            maxLength={80}
            accessibilityLabel="Weather location"
          />
        </View>
        <Pressable onPress={handleAdd} style={styles.saveBtn} accessibilityLabel={isEditing ? 'Update weather' : 'Add weather'} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Weather'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});

// ── Styles ─────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors, screenWidth: number) {
  const THUMB_SIZE = Math.floor((screenWidth - Space.md * 2 - Space.xs * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  return StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md, paddingVertical: Space.sm },
  title: { fontFamily: Typography.family.semibold, fontSize: Type.subtitle.size, color: colors.textPrimary },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.sm },
  mediaOptions: { flexDirection: 'row', justifyContent: 'center', gap: Space.lg, paddingVertical: Space.xl },
  mediaOption: { alignItems: 'center', gap: 8, minWidth: 80 },
  mediaOptionLabel: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  // ── Album/source disclosure ──
  albumDisclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  albumDisclosureText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    flex: 1,
  },
  albumPickerDropdown: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    marginHorizontal: Space.md,
    marginBottom: Space.xs,
    overflow: 'hidden',
  },
  albumPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    minHeight: 40,
  },
  albumPickerItemText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    flex: 1,
  },
  // ── Category tabs ──
  categoryTabRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  categoryTabIndicator: {
    position: 'absolute',
    top: Space.xs,
    bottom: 0,
    borderRadius: Radius.md,
    height: 36,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Space.sm,
    zIndex: 1,
  },
  categoryTabLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  // ── Limited-access banner ──
  limitedAccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.sm,
  },
  limitedAccessText: {
    flex: 1,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  // ── Selection preview rail ──
  selectionPreviewRail: {
    paddingVertical: Space.sm,
  },
  selectionPreviewScroll: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
  },
  selectionPreviewItem: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  selectionPreviewThumb: {
    width: '100%',
    height: '100%',
  },
  selectionPreviewOrder: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionPreviewOrderText: {
    fontFamily: Typography.family.bold,
    fontSize: 10,
  },
  selectionPreviewRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  selectionPreviewReorderLeft: {
    position: 'absolute',
    left: 2,
    top: '50%',
    marginTop: -9,
  },
  selectionPreviewReorderRight: {
    position: 'absolute',
    right: 2,
    bottom: 2,
  },
  // ── Media grid ──
  mediaGridContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  mediaGridRow: { gap: Space.xs, marginBottom: Space.xs },
  mediaGridCell: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaGridThumb: {
    width: '100%',
    height: '100%',
  },
  mediaGridVideoBadge: {
    position: 'absolute',
    bottom: Space.xs,
    left: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Space.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  mediaGridDuration: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.medium,
  },
  // Selection overlay — subtle tint + border highlight (iOS Photos pattern).
  // The border communicates selection more clearly than a heavy dark overlay.
  mediaGridSelectedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: Radius.md,
  },
  mediaGridSelectionBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  mediaGridSelectionText: {
    color: '#000',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  addBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
  },
  addBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
  },
  mediaGridFooter: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  mediaLoadingState: {
    paddingVertical: Space.xxl,
    alignItems: 'center',
  },
  mediaEmptyState: {
    paddingVertical: Space.xxl,
    alignItems: 'center',
    gap: Space.md,
  },
  mediaEmptyText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  mediaPermissionState: {
    paddingVertical: Space.xxl,
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  mediaPermissionTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    marginTop: Space.sm,
  },
  mediaPermissionText: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    textAlign: 'center',
    lineHeight: 22,
  },
  mediaPermissionBtn: {
    paddingHorizontal: Space.lg,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Space.sm,
  },
  mediaPermissionBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: Space.sm, gap: 8 },
  searchIcon: {},
  searchInput: {
    flex: 1, borderWidth: Stroke.standard, borderColor: colors.border, borderRadius: Radius.md,
    paddingHorizontal: Space.md, paddingVertical: Space.sm, fontSize: Type.body.size, color: colors.textPrimary,
  },
  // ── Product picker source tabs ──
  resultList: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultThumb: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  resultThumbImg: { width: '100%', height: '100%' },
  resultAvatar: { width: 40, height: 40, borderRadius: Radius.full, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  resultAvatarText: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.textSecondary },
  resultInfo: { flex: 1, gap: 2 },
  resultName: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  resultPrice: { fontFamily: Typography.family.bold, fontSize: Type.caption.size, color: colors.brand },
  resultSubtext: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: colors.textMuted },
  loadingBody: { paddingVertical: Space.xl, alignItems: 'center' },
  emptyState: { paddingVertical: Space.xl, alignItems: 'center' },
  emptyText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textMuted },
  errorBody: { paddingVertical: Space.xl, alignItems: 'center', gap: Space.sm },
  errorText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textMuted },
  retryBtn: { paddingHorizontal: Space.lg, paddingVertical: Space.sm, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  retryBtnText: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.brand },
  textPickerBody: { paddingHorizontal: Space.md, paddingBottom: Space.xl, gap: Space.sm },
  // Live preview area — dark canvas mimicking the poster/look background
  textPreview: {
    minHeight: 90,
    borderRadius: Radius.lg,
    backgroundColor: '#0d0d0d',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  textPreviewText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  sectionLabel: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: {
    borderWidth: Stroke.standard, borderColor: colors.border, borderRadius: Radius.lg,
    paddingHorizontal: Space.md, paddingVertical: Space.md, fontSize: Type.body.size, color: colors.textPrimary, minHeight: 52,
  },
  saveBtn: { height: 48, borderRadius: Radius.lg, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: colors.textInverse, fontFamily: Typography.family.semibold, fontSize: Type.bodyStrong.size, letterSpacing: 0.3 },
  pickerSectionLabel: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Space.xs },
  styleScroll: { marginHorizontal: -Space.md, paddingHorizontal: Space.md },
  styleOption: { paddingHorizontal: Space.md + 2, paddingVertical: Space.sm + 2, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm, backgroundColor: colors.surfaceAlt },
  styleOptionActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.09), borderWidth: Stroke.emphasis },
  styleOptionText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  styleOptionTextActive: { color: colors.brand },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorOption: { width: 44, height: 44, borderRadius: Radius.full, borderWidth: 2, borderColor: 'transparent', elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  colorOptionActive: { borderColor: colors.brand, shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  colorOptionTransparent: { borderWidth: Stroke.standard, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  alignmentRow: { flexDirection: 'row', gap: Space.sm },
  alignmentOption: { width: 44, height: 44, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  alignmentOptionActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.08) },
  shapeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.md, paddingVertical: Space.lg, paddingHorizontal: Space.md },
  shapeOption: { alignItems: 'center', gap: 6, width: 80, paddingVertical: Space.sm },
  shapeLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary },
  // ── Draw picker ──
  drawBody: { paddingHorizontal: Space.md, paddingBottom: Space.xl, gap: Space.xs },
  drawCanvasWrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: Radius.lg,
    backgroundColor: '#161616',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  drawCanvasHint: {
    position: 'absolute',
    bottom: Space.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  drawCanvasHintText: {
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    color: 'rgba(255,255,255,0.28)',
    letterSpacing: 0.3,
  },
  brushSizeRow: { flexDirection: 'row', gap: Space.md, alignItems: 'center', paddingVertical: Space.xs },
  brushSizeOption: { width: 44, height: 44, borderRadius: Radius.full, justifyContent: 'center', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  brushSizeOptionActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.08) },
  brushSizeDot: { borderRadius: Radius.full },
  brushPreviewWrap: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.xs },
  brushPreviewDot: { elevation: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  brushPreviewLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary },
  drawActions: { flexDirection: 'row', alignItems: 'center', gap: Space.md, marginTop: Space.md },
  drawActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Space.md, paddingVertical: Space.sm, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  drawActionLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary },
  drawDoneBtn: { paddingHorizontal: Space.xl, paddingVertical: Space.sm, borderRadius: Radius.full, marginLeft: 'auto' },
  drawDoneBtnText: { fontFamily: Typography.family.semibold, fontSize: Type.bodyStrong.size, color: '#fff' },
  // ── GIF picker ──
  gifList: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  gifRow: { gap: Space.xs, marginBottom: Space.xs },
  gifCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  gifThumb: { width: '100%', height: '100%' },
  // ── Music picker ──
  musicPreviewCard: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginHorizontal: Space.md, marginBottom: Space.sm, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  musicPreviewArt: { width: 48, height: 48, borderRadius: Radius.md },
  musicPreviewInfo: { flex: 1, gap: 2 },
  musicPreviewTrackName: { fontFamily: Typography.family.semibold, fontSize: Type.bodyStrong.size, color: colors.textPrimary },
  musicPreviewArtistName: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: colors.textSecondary },
  musicPreviewPlayBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  musicLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.sm, paddingVertical: Space.sm },
  musicLoadingText: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm, paddingHorizontal: Space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  musicArtwork: { width: 56, height: 56, borderRadius: Radius.md, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  musicInfo: { flex: 1, gap: 2 },
  musicTrackName: { fontFamily: Typography.family.semibold, fontSize: Type.bodyStrong.size, color: colors.textPrimary },
  musicArtistName: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: colors.textSecondary },
  musicAddBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  // ── Quiz picker ──
  quizOptionRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.xs },
  quizCorrectDot: { width: 28, height: 28, borderRadius: Radius.full, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  quizRemoveBtn: { padding: Space.xs },
  quizAddOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Space.sm },
  quizAddOptionText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.brand },
  // ── Countdown picker ──
  countdownDateBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.md, borderWidth: Stroke.standard, borderColor: colors.border },
  countdownDateText: { flex: 1, fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  // ── Sticker tray ──
  stickerSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.sm, backgroundColor: colors.surfaceAlt, borderRadius: Radius.lg, marginHorizontal: Space.md, marginBottom: Space.sm },
  stickerSearchInput: { flex: 1, fontSize: Type.body.size, color: colors.textPrimary, fontFamily: Typography.family.regular, paddingVertical: Space.xs },
  stickerSearchClear: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  stickerCategoryScroll: { marginHorizontal: -Space.md, marginBottom: Space.xs },
  stickerCategoryContent: { paddingHorizontal: Space.md, gap: 8 },
  stickerCategoryChip: { paddingHorizontal: 14, paddingVertical: Space.sm, borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  stickerCategoryChipText: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary },
  stickerGridScroll: { flex: 1 },
  stickerGridContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  stickerCategorySection: { marginBottom: Space.lg },
  stickerCategoryTitle: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Space.sm },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  stickerCell: { width: 80, height: 80, borderRadius: Radius.lg, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', gap: Space.xs, borderWidth: Stroke.standard, borderColor: colors.borderSubtle },
  stickerCellLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textPrimary },
  stickerEmptyState: { paddingVertical: Space.xxl, alignItems: 'center', gap: Space.md },
  stickerEmptyText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textMuted },
  // ── Sticker preview pill (shared by Link/Location/Hashtag/Time/Weather) ──
  stickerPreviewPill: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.lg, backgroundColor: 'rgba(201,164,106,0.9)', alignSelf: 'center', marginBottom: Space.sm },
  stickerPreviewPillText: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: '#fff' },
  stickerPreviewPillEmoji: { fontSize: Type.priceList.size },
  // ── Weather picker ──
  weatherPreviewPill: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.xl, backgroundColor: 'rgba(201,164,106,0.95)', alignSelf: 'center', marginBottom: Space.sm, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3, minWidth: 180 },
  weatherPreviewEmoji: { fontSize: Type.display.size },
  weatherPreviewInfo: { gap: 0 },
  weatherPreviewTemp: { fontFamily: Typography.family.bold, fontSize: Type.subtitle.size, color: '#fff' },
  weatherPreviewCondition: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: 'rgba(255,255,255,0.85)' },
  weatherPreviewLocation: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  weatherPreviewLocationText: { fontFamily: Typography.family.medium, fontSize: Type.meta.size, color: 'rgba(255,255,255,0.7)' },
  weatherGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  weatherCell: { width: 80, height: 80, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', gap: 4 },
  weatherCellActive: { backgroundColor: colors.brand },
  weatherCellEmoji: { fontSize: Type.priceHero.size },
  weatherCellLabel: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary, textAlign: 'center' },
  inputCardLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary, marginBottom: 6, marginTop: Space.sm },
  inputCard: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginBottom: Space.xs },
  inputCardText: { flex: 1, fontSize: Type.body.size, color: colors.textPrimary, fontFamily: Typography.family.regular, paddingVertical: 2 },
  inputCardSuffix: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.textSecondary },
  // ── Spectrum color picker ──
  spectrumWrap: { marginTop: Space.sm, gap: Space.xs },
  spectrumBar: { height: 36, borderRadius: Radius.full, overflow: 'hidden', position: 'relative', elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  spectrumOverlay: { ...StyleSheet.absoluteFill },
  spectrumIndicator: { position: 'absolute', top: -4, width: 28, height: 28, borderRadius: Radius.full, borderWidth: 2, borderColor: '#fff', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4, left: '50%', marginLeft: -14 },
  spectrumClose: { alignSelf: 'center', paddingVertical: Space.xs },
  // ── Vertical brush size slider ──
  brushSliderWrap: { position: 'absolute', left: Space.sm, top: '50%', marginTop: -60, zIndex: 10, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  brushSliderTrack: { width: 28, height: 120, borderRadius: Radius.full, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  brushSliderFill: { width: '100%', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full },
  brushSliderHandle: { position: 'absolute', left: '50%', marginLeft: -11, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  brushSliderDot: { borderWidth: Stroke.standard, borderColor: 'rgba(255,255,255,0.4)' },
  // ── Text effect chips (visual preview) ──
  effectChip: { width: 56, height: 56, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', gap: 2 },
  effectChipActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.09), borderWidth: Stroke.emphasis },
  effectChipSample: { fontFamily: Typography.family.bold, fontSize: Type.priceList.size, lineHeight: 24 },
  effectChipLabel: { fontFamily: Typography.family.medium, fontSize: 9, color: colors.textSecondary },
  effectChipLabelActive: { color: colors.brand },
  // ── Text animation chips (visual preview) ──
  animChip: { width: 48, height: 56, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', gap: 4 },
  animChipActive: { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, 0.09), borderWidth: Stroke.emphasis },
  animChipLabel: { fontFamily: Typography.family.medium, fontSize: 9, color: colors.textSecondary, textAlign: 'center' },
  animChipLabelActive: { color: colors.brand },
  // ── Draw brush chips (premium tool selection) ──
  brushChipScroll: { gap: Space.sm, paddingVertical: Space.xs },
  brushChip: { width: 48, height: 48, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', marginRight: Space.sm },
  brushChipActive: { backgroundColor: colors.brand },
  // ── Shape preview box ──
  shapePreviewBox: { width: 56, height: 56, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  // ── GIF category chips ──
  gifCategoryScroll: { marginHorizontal: -Space.md, marginBottom: Space.sm },
  gifCategoryContent: { paddingHorizontal: Space.md, gap: 8 },
  gifCategoryChip: { paddingHorizontal: 14, paddingVertical: Space.sm, borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  gifCategoryChipText: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary },
  // ── Vote preview ──
  votePreviewWrap: { backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginBottom: Space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  votePreviewQuestion: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.textPrimary, marginBottom: Space.sm, textAlign: 'center' },
  votePreviewOptions: { flexDirection: 'row', gap: Space.sm },
  votePreviewOption: { flex: 1, paddingVertical: Space.sm, paddingHorizontal: Space.sm, borderRadius: Radius.md, borderWidth: Stroke.standard, alignItems: 'center' },
  votePreviewOptionText: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textPrimary },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Space.sm, marginBottom: Space.xs },
  addOptionBtnText: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.brand },
  timerChip: { paddingHorizontal: 14, paddingVertical: Space.sm, borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm },
  timerChipText: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary },
  // ── Quiz preview ──
  quizPreviewWrap: { backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Space.md, marginBottom: Space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: Space.xs },
  quizPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.xs },
  quizPreviewEmoji: { fontSize: 22 },
  quizPreviewQuestion: { flex: 1, fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.textPrimary },
  quizPreviewOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Space.sm, paddingHorizontal: Space.md, borderRadius: Radius.md, backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  quizPreviewOptionCorrect: { borderColor: colors.success, backgroundColor: withAlpha(colors.success, 0.08) },
  quizPreviewOptionText: { flex: 1, fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textPrimary },
  // ── Question preview (improved) ──
  questionPreviewWrap: { borderRadius: Radius.xl, padding: Space.md + 2, marginBottom: Space.sm, gap: Space.sm, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  questionPreviewIconRow: { marginBottom: Space.xs },
  questionPreviewPrompt: { fontFamily: Typography.family.semibold, fontSize: Type.bodyStrong.size, color: '#fff', lineHeight: Type.bodyStrong.size * 1.3 },
  questionPreviewInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md, paddingVertical: Space.sm, paddingHorizontal: Space.md },
  questionPreviewPlaceholder: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: 'rgba(255,255,255,0.6)' },
  questionPreviewSendDot: { width: 24, height: 24, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  // ── Emoji slider preview (improved) ──
  sliderPreviewWrap: { backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Space.md + 2, marginBottom: Space.sm, gap: Space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  sliderPreviewQuestion: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.textPrimary, textAlign: 'center' },
  sliderPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  sliderPreviewEmoji: { fontSize: Type.display.size },
  sliderPreviewTrack: { flex: 1, height: 8, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt, position: 'relative' },
  sliderPreviewFill: { height: '100%', borderRadius: Radius.sm },
  sliderPreviewHandle: { position: 'absolute', top: -6, width: 20, height: 20, borderRadius: Radius.full, marginLeft: -10, borderWidth: 2, borderColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  sliderPreviewEndLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary, textAlign: 'center' },
  // ── Product source tabs ──
  productTabBar: { flexDirection: 'row', paddingHorizontal: Space.md, paddingVertical: Space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  productTabBarContent: { gap: Space.xs, paddingVertical: Space.xs },
  productTab: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingVertical: Space.sm - 2, paddingHorizontal: Space.md, borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  productTabActive: { borderColor: colors.brand, backgroundColor: colors.brandSubtle },
  productTabLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary },
  });
}
