import React from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Pressable,
  Image,
  Dimensions,
  Text,
  PanResponder,
  PanResponderGestureState,
  GestureResponderEvent,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { RootStackParamList } from '../navigation/types';
import { MOCK_LISTINGS } from '../data/mockData';
import { mockArrayOrEmpty } from '../utils/mockGate';
import type { Poster } from '../data/posters';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';

import CameraCapture from '../components/poster/CameraCapture';
import CreativeToolbar, { CreativeTool } from '../components/poster/CreativeToolbar';
import BottomControlBar from '../components/poster/BottomControlBar';
import TextOverlayCanvas, { TextLayer } from '../components/poster/TextOverlayCanvas';
import DetailsDrawer from '../components/poster/DetailsDrawer';
import StickerPicker, { StickerItem } from '../components/poster/StickerPicker';
import DrawingCanvas, { BrushStroke } from '../components/poster/DrawingCanvas';
import { ImageFilter, getFilterOverlay, FILTERS } from '../components/poster/FilterStrip';
import FilterStrip from '../components/poster/FilterStrip';
import { Typography } from '../constants/typography';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function useCountdownLabel(targetDate?: string): string {
  const [label, setLabel] = React.useState('');
  React.useEffect(() => {
    if (!targetDate) { setLabel(''); return; }
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setLabel('Ended'); return; }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setLabel(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);
  return label;
}

export default function CreatePosterScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { show } = useToast();
  const { listings } = useBackendData();

  const currentUser = useStore((state) => state.currentUser);
  const addPoster = useStore((state) => state.addPoster);
  const uploaderId = currentUser?.id ?? null;

  const allListingOptions = React.useMemo(
    () => (listings.length ? listings : mockArrayOrEmpty(MOCK_LISTINGS)),
    [listings]
  );

  // ── Core State ──
  const [selectedImageUri, setSelectedImageUri] = React.useState<string | null>(null);
  const [textLayers, setTextLayers] = React.useState<TextLayer[]>([]);
  const [activeTool, setActiveTool] = React.useState<CreativeTool>(null);
  const [stickers, setStickers] = React.useState<StickerItem[]>([]);
  const [drawings, setDrawings] = React.useState<BrushStroke[]>([]);
  const [filter, setFilter] = React.useState<ImageFilter>('normal');
  const [showStickerPicker, setShowStickerPicker] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isPreview, setIsPreview] = React.useState(false);
  const [showFilterStrip, setShowFilterStrip] = React.useState(false);

  const [recentPhotos, setRecentPhotos] = React.useState<MediaLibrary.Asset[]>([]);
  const [mediaLibPermission] = MediaLibrary.usePermissions();

  const [canvasSize, setCanvasSize] = React.useState({ width: SCREEN_W, height: SCREEN_H });

  // Image transform (pinch/pan)
  const [imgScale, setImgScale] = React.useState(1);
  const [imgTranslateX, setImgTranslateX] = React.useState(0);
  const [imgTranslateY, setImgTranslateY] = React.useState(0);

  // Filter swipe
  const [filterNameVisible, setFilterNameVisible] = React.useState(false);
  const filterNameAnim = React.useRef(new Animated.Value(0)).current;
  const filterIndexRef = React.useRef(0);

  // Pinch tracking refs
  const initialPinchDistRef = React.useRef(0);
  const initialScaleRef = React.useRef(1);
  const initialTranslateRef = React.useRef({ x: 0, y: 0 });
  const activePointersRef = React.useRef(0);
  const swipeStartXRef = React.useRef(0);

  // Publish state
  const [caption, setCaption] = React.useState('');
  const [expiryHours, setExpiryHours] = React.useState(24);
  const [selectedListingId, setSelectedListingId] = React.useState('');

  // ── Init listing selection ──
  React.useEffect(() => {
    if (allListingOptions.length && !selectedListingId) {
      setSelectedListingId(allListingOptions[0].id);
    }
  }, [allListingOptions, selectedListingId]);

  // ── Load recent photos ──
  React.useEffect(() => {
    if (!mediaLibPermission?.granted) return;
    const load = async () => {
      try {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo'],
          first: 15,
          sortBy: MediaLibrary.SortBy.creationTime,
        });
        setRecentPhotos(result.assets);
      } catch { /* silently fail */ }
    };
    load();
  }, [mediaLibPermission?.granted]);

  // ── Tool handling ──
  React.useEffect(() => {
    if (activeTool === 'text') {
      setShowFilterStrip(false);
    } else if (activeTool === 'stickers') {
      setShowStickerPicker(true);
      setActiveTool(null);
      setShowFilterStrip(false);
    } else if (activeTool === 'draw') {
      setShowFilterStrip(false);
    } else if (activeTool === 'filter') {
      setShowFilterStrip(true);
    } else if (activeTool === 'preview') {
      setActiveTool(null);
      setShowFilterStrip(false);
      setIsPreview(true);
    } else {
      setShowFilterStrip(false);
    }
  }, [activeTool]);

  // ── Show filter name briefly ──
  const showFilterName = React.useCallback(() => {
    setFilterNameVisible(true);
    filterNameAnim.setValue(0);
    Animated.sequence([
      Animated.timing(filterNameAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(filterNameAnim, { toValue: 0, duration: 200, useNativeDriver: true, delay: 800 }),
    ]).start(() => setFilterNameVisible(false));
  }, [filterNameAnim]);

  // ── Filter swipe helpers ──
  const getFilterIndex = (name: ImageFilter) => FILTERS.findIndex((f) => f.name === name);
  const setFilterByIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, FILTERS.length - 1));
    const next = FILTERS[clamped]?.name ?? 'normal';
    if (next !== filter) {
      setFilter(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showFilterName();
    }
  };

  // ── Image transform helpers ──
  const clampTranslate = (scale: number, tx: number, ty: number) => {
    const maxW = Math.max(0, (scale - 1) * canvasSize.width * 0.5);
    const maxH = Math.max(0, (scale - 1) * canvasSize.height * 0.5);
    return {
      x: Math.min(Math.max(tx, -maxW), maxW),
      y: Math.min(Math.max(ty, -maxH), maxH),
    };
  };

  const getDistance = (touches: { pageX: number; pageY: number }[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const imagePanResponder = React.useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!selectedImageUri,
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        if (!selectedImageUri) return false;
        return activePointersRef.current >= 2 || Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3;
      },
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.changedTouches;
        activePointersRef.current = touches.length;
        swipeStartXRef.current = touches[0]?.pageX ?? 0;

        if (touches.length >= 2) {
          initialPinchDistRef.current = getDistance(touches as any);
          initialScaleRef.current = imgScale;
          initialTranslateRef.current = { x: imgTranslateX, y: imgTranslateY };
        } else {
          initialTranslateRef.current = { x: imgTranslateX, y: imgTranslateY };
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const touches = evt.nativeEvent.changedTouches;
        activePointersRef.current = touches.length;

        if (touches.length >= 2) {
          const dist = getDistance(touches as any);
          if (initialPinchDistRef.current > 0) {
            const ratio = dist / initialPinchDistRef.current;
            const nextScale = Math.min(Math.max(initialScaleRef.current * ratio, 1), 4);
            const clamped = clampTranslate(nextScale, imgTranslateX, imgTranslateY);
            setImgScale(nextScale);
            setImgTranslateX(clamped.x);
            setImgTranslateY(clamped.y);
          }
        } else if (touches.length === 1) {
          // Single finger: check if it's a horizontal swipe for filters
          const dx = gesture.dx;
          const dy = gesture.dy;

          if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 20) {
            // Horizontal swipe detected - handle filter change on release
          } else {
            const nextX = initialTranslateRef.current.x + dx;
            const nextY = initialTranslateRef.current.y + dy;
            const clamped = clampTranslate(imgScale, nextX, nextY);
            setImgTranslateX(clamped.x);
            setImgTranslateY(clamped.y);
          }
        }
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        activePointersRef.current = 0;
        // Handle filter swipe on release
        if (activePointersRef.current === 0 && Math.abs(gesture.dx) > 60 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2) {
          const currentIdx = getFilterIndex(filter);
          if (gesture.dx > 0) {
            setFilterByIndex(currentIdx - 1);
          } else {
            setFilterByIndex(currentIdx + 1);
          }
        }
      },
      onPanResponderTerminate: () => {
        activePointersRef.current = 0;
      },
    }),
    [selectedImageUri, imgScale, imgTranslateX, imgTranslateY, canvasSize.width, canvasSize.height, filter]
  );

  React.useEffect(() => {
    setImgScale(1);
    setImgTranslateX(0);
    setImgTranslateY(0);
  }, [selectedImageUri]);

  // ── Capture handlers ──
  const handlePhotoCapture = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedImageUri(uri);
  };

  const handleGalleryPress = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow photo library access to select images', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch {
      show('Could not open photo library', 'error');
    }
  };

  const handleRecentPhotoPress = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedImageUri(uri);
  };

  // ── Sticker handlers ──
  const handleStickerSelect = (sticker: StickerItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSticker = {
      ...sticker,
      x: canvasSize.width / 2 - 40,
      y: canvasSize.height / 2 - 20,
    };
    setStickers((prev) => [...prev, newSticker]);
  };

  const createStickerPanResponder = (stickerId: string) => {
    let startX = 0;
    let startY = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const sticker = stickers.find((s) => s.id === stickerId);
        if (sticker) {
          startX = sticker.x ?? canvasSize.width / 2 - 40;
          startY = sticker.y ?? canvasSize.height / 2 - 20;
        }
      },
      onPanResponderMove: (_evt, gestureState: PanResponderGestureState) => {
        setStickers((prev) =>
          prev.map((s) => {
            if (s.id !== stickerId) return s;
            const nextX = Math.min(Math.max((s.x ?? startX) + gestureState.dx, 0), canvasSize.width - 80);
            const nextY = Math.min(Math.max((s.y ?? startY) + gestureState.dy, 0), canvasSize.height - 40);
            return { ...s, x: nextX, y: nextY };
          })
        );
      },
      onPanResponderRelease: () => { /* done */ },
    });
  };

  const removeSticker = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStickers((prev) => prev.filter((s) => s.id !== id));
  };

  // ── Replace / reset background ──
  const handleReplaceBackground = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { show('Allow photo library access to select images', 'error'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setSelectedImageUri(result.assets[0].uri);
        setImgScale(1);
        setImgTranslateX(0);
        setImgTranslateY(0);
      }
    } catch {
      show('Could not open photo library', 'error');
    }
  };

  const handleResetBackground = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedImageUri(null);
    setTextLayers([]);
    setStickers([]);
    setDrawings([]);
    setCaption('');
    setFilter('normal');
    setImgScale(1);
    setImgTranslateX(0);
    setImgTranslateY(0);
    setIsPreview(false);
  };

  // ── Publish ──
  const handlePublish = () => {
    if (!uploaderId) {
      show('Sign in to publish posters', 'error');
      return;
    }
    if (!selectedImageUri) {
      show('Add a photo before publishing', 'error');
      return;
    }
    const trimmedCaption = caption.trim();
    const trimmedStoryText = textLayers[0]?.text.trim() ?? '';

    const newPoster: Poster = {
      id: `poster_${Date.now()}`,
      uploaderId,
      listingId: selectedListingId || '',
      image: selectedImageUri,
      caption: trimmedCaption || trimmedStoryText || 'New poster',
      createdAt: new Date().toISOString(),
      expiryHours,
      storyOverlay:
        textLayers.length > 0
          ? { text: textLayers[0].text, color: textLayers[0].color, position: 'center' }
          : undefined,
      textLayers: textLayers.map((l) => ({
        text: l.text, color: l.color, position: 'center',
        fontFamily: l.fontFamily, fontSize: l.fontSize,
        backgroundColor: l.backgroundColor, alignment: l.alignment,
      })),
      stickers: stickers.map((s) => ({
        id: s.id, type: s.type, content: s.content, color: s.color,
        targetDate: s.targetDate, listingId: s.listingId,
        options: s.options, votes: s.votes,
      })),
      drawings: drawings.map((d) => ({
        id: d.id, points: d.points, color: d.color, width: d.width,
      })),
      filter: filter === 'normal' ? undefined : filter,
    };

    setIsPublishing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addPoster(newPoster);
    setIsPublishing(false);
    navigation.replace('PosterViewer', { posterId: newPoster.id });
  };

  // ── Reset / close ──
  const handleClose = () => {
    if (selectedImageUri) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setSelectedImageUri(null);
      setTextLayers([]);
      setStickers([]);
      setDrawings([]);
      setCaption('');
      setFilter('normal');
      setImgScale(1);
      setImgTranslateX(0);
      setImgTranslateY(0);
    } else {
      navigation.goBack();
    }
  };

  const hasCanvas = !!selectedImageUri;
  const filterOverlay = getFilterOverlay(filter);
  const currentFilterLabel = FILTERS.find((f) => f.name === filter)?.label ?? 'Normal';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Canvas */}
      <View
        style={styles.canvas}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasSize({ width, height });
        }}
      >
        {!hasCanvas ? (
          <CameraCapture
            onPhotoCapture={handlePhotoCapture}
            onClose={handleClose}
          />
        ) : (
          <View style={StyleSheet.absoluteFillObject} {...imagePanResponder.panHandlers}>
            <Image
              source={{ uri: selectedImageUri || undefined }}
              style={{
                width: '100%',
                height: '100%',
                transform: [
                  { scale: imgScale },
                  { translateX: imgTranslateX },
                  { translateY: imgTranslateY },
                ],
              }}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Filter overlay */}
        {hasCanvas && filterOverlay.opacity > 0 && filterOverlay.color && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: filterOverlay.color, opacity: filterOverlay.opacity }]} pointerEvents="none" />
        )}

        {/* Subtle vignette */}
        {hasCanvas && <View style={styles.canvasOverlay} pointerEvents="none" />}

        {/* Filter name toast */}
        {hasCanvas && filterNameVisible && (
          <Animated.View
            style={[styles.filterToast, { opacity: filterNameAnim }]}
            pointerEvents="none"
          >
            <Text style={styles.filterToastText}>{currentFilterLabel}</Text>
          </Animated.View>
        )}
      </View>

      {/* Top bar */}
      {hasCanvas && activeTool !== 'draw' && (
        <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
          {isPreview ? (
            <>
              <Pressable
                style={styles.topIconBtn}
                onPress={() => { setIsPreview(false); setActiveTool(null); }}
                hitSlop={12}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.nextBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDetails(true);
                }}
                hitSlop={12}
              >
                <Text style={styles.nextBtnText}>Publish</Text>
                <Ionicons name="checkmark" size={18} color="#000" />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={styles.topIconBtn}
                onPress={handleClose}
                hitSlop={12}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </Pressable>

              <Pressable
                style={styles.nextBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDetails(true);
                }}
                hitSlop={12}
              >
                <Text style={styles.nextBtnText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color="#000" />
              </Pressable>
            </>
          )}
        </SafeAreaView>
      )}

      {/* Creative Toolbar (bottom) */}
      {hasCanvas && !isPreview && activeTool !== 'draw' && (
        <CreativeToolbar
          activeTool={activeTool}
          onToolSelect={(tool) => {
            if (tool) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTool(tool);
          }}
          visible={!showDetails && !showStickerPicker && !showFilterStrip}
        />
      )}

      {/* Filter Strip */}
      {hasCanvas && showFilterStrip && !isPreview && (
        <FilterStrip
          activeFilter={filter}
          onFilterChange={(f) => { setFilter(f); showFilterName(); }}
          visible={showFilterStrip}
          previewUri={selectedImageUri ?? undefined}
        />
      )}

      {/* Text Overlay */}
      {hasCanvas && (
        <TextOverlayCanvas
          layers={textLayers}
          onLayersChange={setTextLayers}
          canvasSize={canvasSize}
          isActive={!isPreview && activeTool === 'text'}
        />
      )}

      {/* Drawing Canvas */}
      {hasCanvas && (
        <DrawingCanvas
          strokes={drawings}
          onStrokesChange={setDrawings}
          canvasSize={canvasSize}
          isActive={!isPreview && activeTool === 'draw'}
          onClose={() => setActiveTool(null)}
        />
      )}

      {/* Sticker Overlays (draggable only when not preview) */}
      {hasCanvas && stickers.length > 0 && activeTool !== 'draw' && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents={isPreview ? 'none' : 'box-none'}>
          {stickers.map((sticker) => {
            const pan = createStickerPanResponder(sticker.id);
            return (
              <StickerOverlay
                key={sticker.id}
                sticker={sticker}
                panHandlers={isPreview ? {} : pan.panHandlers}
                onDelete={isPreview ? undefined : () => removeSticker(sticker.id)}
                canvasSize={canvasSize}
              />
            );
          })}
        </View>
      )}

      {/* Replace / Reset background buttons (edit mode only) */}
      {hasCanvas && !isPreview && (
        <View style={styles.bgControls} pointerEvents="box-none">
          <Pressable style={styles.bgControlBtn} onPress={handleReplaceBackground} hitSlop={10}>
            <Ionicons name="images-outline" size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.bgControlBtn} onPress={handleResetBackground} hitSlop={10}>
            <Ionicons name="refresh" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Bottom Control Bar (camera only) */}
      {!hasCanvas && (
        <BottomControlBar
          onGalleryPress={handleGalleryPress}
          onFlipCamera={() => {}}
          recentPhotos={recentPhotos}
          onRecentPhotoPress={handleRecentPhotoPress}
          showCameraControls={!hasCanvas}
        />
      )}

      {/* Overlays */}
      <StickerPicker
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onStickerSelect={handleStickerSelect}
      />

      <DetailsDrawer
        visible={showDetails}
        onClose={() => setShowDetails(false)}
        caption={caption}
        onCaptionChange={setCaption}
        expiryHours={expiryHours}
        onExpiryChange={setExpiryHours}
        selectedListingId={selectedListingId}
        onListingSelect={setSelectedListingId}
        listings={allListingOptions}
        onPublish={handlePublish}
        isPublishing={isPublishing}
        currentUserId={uploaderId}
      />
    </View>
  );
}

/** Individual sticker overlay with type-specific rendering */
function StickerOverlay({
  sticker,
  panHandlers,
  onDelete,
  canvasSize,
}: {
  sticker: StickerItem;
  panHandlers: any;
  onDelete?: () => void;
  canvasSize: { width: number; height: number };
}) {
  const countdownLabel = useCountdownLabel(sticker.targetDate);

  const baseStyle = [
    styles.stickerBubble,
    {
      left: sticker.x ?? canvasSize.width / 2 - 40,
      top: sticker.y ?? canvasSize.height / 2 - 20,
    },
    sticker.type === 'mention' && styles.mentionBubble,
    sticker.type === 'hashtag' && styles.hashtagBubble,
    sticker.type === 'poll' && styles.pollBubble,
    sticker.type === 'question' && styles.questionBubble,
    sticker.type === 'shape' && { backgroundColor: sticker.color || '#ff2d55' },
    sticker.type === 'countdown' && styles.countdownBubble,
  ];

  const displayContent = sticker.type === 'countdown' && countdownLabel
    ? countdownLabel
    : sticker.content;

  return (
    <View style={baseStyle} pointerEvents="box-none">
      <View {...panHandlers} pointerEvents="auto" style={styles.stickerDragArea}>
        {sticker.type === 'countdown' && (
          <Ionicons name="timer-outline" size={14} color="#ff3b30" style={{ marginRight: 4 }} />
        )}
        <Text style={styles.stickerText} numberOfLines={3}>
          {displayContent}
        </Text>
      </View>
      {onDelete && (
        <Pressable style={styles.stickerDeleteBtn} onPress={onDelete} hitSlop={6}>
          <Ionicons name="close-circle" size={16} color="#ff3b30" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  canvasOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  filterToast: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  filterToastText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    zIndex: 20,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  nextBtnText: {
    color: '#000',
    fontSize: 14,
    fontFamily: Typography.family.bold,
  },
  stickerBubble: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    maxWidth: 200,
    alignItems: 'center',
    flexDirection: 'row',
  },
  mentionBubble: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  hashtagBubble: {
    backgroundColor: 'rgba(90,200,250,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.5)',
  },
  pollBubble: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: 10,
  },
  questionBubble: {
    backgroundColor: 'rgba(255,149,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.4)',
  },
  countdownBubble: {
    backgroundColor: 'rgba(255,59,48,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.5)',
  },
  stickerDragArea: {
    minWidth: 30,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  stickerText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  stickerDeleteBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgControls: {
    position: 'absolute',
    top: 100,
    right: 12,
    gap: 10,
    zIndex: 18,
  },
  bgControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
});
