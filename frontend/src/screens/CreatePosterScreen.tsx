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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { MOCK_LISTINGS, MOCK_USERS, Listing } from '../data/mockData';
import { mockArrayOrEmpty } from '../utils/mockGate';
import type { Poster } from '../data/posters';
import { POSTER_TEMPLATES, PosterTemplate } from '../data/posters';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';

import CameraCapture from '../components/poster/CameraCapture';
import CreativeToolbar, { CreativeTool } from '../components/poster/CreativeToolbar';
import BottomControlBar from '../components/poster/BottomControlBar';
import TextOverlayCanvas, { TextLayer } from '../components/poster/TextOverlayCanvas';
import DetailsDrawer, { PosterMode } from '../components/poster/DetailsDrawer';
import BackgroundPicker from '../components/poster/BackgroundPicker';
import StickerPicker, { StickerItem } from '../components/poster/StickerPicker';
import DrawingCanvas, { BrushStroke } from '../components/poster/DrawingCanvas';
import LayoutPicker, { LayoutType } from '../components/poster/LayoutPicker';
import FilterStrip, { ImageFilter, getFilterOverlay } from '../components/poster/FilterStrip';
import MultiPhotoCollage from '../components/poster/MultiPhotoCollage';
import TemplatePicker from '../components/poster/TemplatePicker';
import { Typography } from '../constants/typography';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function useCountdownLabel(targetDate?: string): string {
  const [label, setLabel] = React.useState('');

  React.useEffect(() => {
    if (!targetDate) {
      setLabel('');
      return;
    }
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
  const route = useRoute<RouteProp<RootStackParamList, 'CreatePoster'>>();
  const { show } = useToast();
  const { listings } = useBackendData();

  const currentUser = useStore((state) => state.currentUser);
  const addPoster = useStore((state) => state.addPoster);
  const uploaderId = currentUser?.id ?? MOCK_USERS[0]?.id ?? 'u1';

  const allListingOptions = React.useMemo(
    () => (listings.length ? listings : mockArrayOrEmpty(MOCK_LISTINGS)),
    [listings]
  );

  // ── State ──
  const [posterMode, setPosterMode] = React.useState<PosterMode>('marketplace');
  const [selectedImageUri, setSelectedImageUri] = React.useState<string | null>(null);
  const [blankBackgroundColor, setBlankBackgroundColor] = React.useState<string | null>(null);

  const [textLayers, setTextLayers] = React.useState<TextLayer[]>([]);
  const [activeTool, setActiveTool] = React.useState<CreativeTool>(null);

  const [caption, setCaption] = React.useState('');
  const [expiryHours, setExpiryHours] = React.useState(24);
  const [selectedListingId, setSelectedListingId] = React.useState('');

  const [showDetails, setShowDetails] = React.useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = React.useState(false);
  const [showStickerPicker, setShowStickerPicker] = React.useState(false);
  const [showLayoutPicker, setShowLayoutPicker] = React.useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);

  const [recentPhotos, setRecentPhotos] = React.useState<MediaLibrary.Asset[]>([]);
  const [mediaLibPermission] = MediaLibrary.usePermissions();

  const [canvasSize, setCanvasSize] = React.useState({ width: SCREEN_W, height: SCREEN_H });

  // Image transform state (pan / zoom)
  const [imgScale, setImgScale] = React.useState(1);
  const [imgTranslateX, setImgTranslateX] = React.useState(0);
  const [imgTranslateY, setImgTranslateY] = React.useState(0);

  // Creative state
  const [stickers, setStickers] = React.useState<StickerItem[]>([]);
  const [drawings, setDrawings] = React.useState<BrushStroke[]>([]);
  const [layout, setLayout] = React.useState<LayoutType>('single');
  const [filter, setFilter] = React.useState<ImageFilter>('normal');
  const [showFilterStrip, setShowFilterStrip] = React.useState(false);
  const [collagePhotos, setCollagePhotos] = React.useState<string[]>([]);
  const [activeTemplateId, setActiveTemplateId] = React.useState<string | undefined>();

  // Pinch tracking refs
  const initialPinchDistRef = React.useRef(0);
  const initialScaleRef = React.useRef(1);
  const initialTranslateRef = React.useRef({ x: 0, y: 0 });
  const activePointersRef = React.useRef(0);

  // ── Init listing selection ──
  React.useEffect(() => {
    const mine = allListingOptions.filter((l) => l.sellerId === uploaderId);
    const pool = posterMode === 'co-own' ? mine : allListingOptions;
    if (pool.length && !selectedListingId) {
      setSelectedListingId(pool[0].id);
    }
  }, [allListingOptions, posterMode, selectedListingId, uploaderId]);

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
      // canvas handles
    } else if (activeTool === 'background') {
      setShowBackgroundPicker(true);
      setActiveTool(null);
    } else if (activeTool === 'stickers') {
      setShowStickerPicker(true);
      setActiveTool(null);
    } else if (activeTool === 'draw') {
      // stays active
    } else if (activeTool === 'layout') {
      setShowLayoutPicker(true);
      setActiveTool(null);
    }
  }, [activeTool]);

  // ── Template application ──
  const applyTemplate = (template: PosterTemplate) => {
    setActiveTemplateId(template.id);
    setLayout(template.layout as LayoutType);
    if (template.backgroundColor) {
      setBlankBackgroundColor(template.backgroundColor);
      setSelectedImageUri(null);
    }
    if (template.filter) {
      setFilter(template.filter as ImageFilter);
    }

    if (template.textLayers) {
      const layers: TextLayer[] = template.textLayers.map((tl, i) => ({
        id: `tpl_text_${i}_${Date.now()}`,
        text: tl.text,
        color: tl.color,
        fontFamily: (tl.fontFamily as any) ?? 'bold',
        fontSize: tl.fontSize ?? 24,
        x: tl.x,
        y: tl.y,
        backgroundColor: tl.backgroundColor,
        alignment: (tl.alignment as any) ?? 'center',
        rotation: 0,
      }));
      setTextLayers(layers);
    }

    if (template.stickers) {
      const stickerItems: StickerItem[] = template.stickers.map((s, i) => ({
        id: `tpl_sticker_${i}_${Date.now()}`,
        type: s.type,
        content: s.content,
        color: s.color,
        x: s.x,
        y: s.y,
      }));
      setStickers(stickerItems);
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
      onStartShouldSetPanResponder: () => !!selectedImageUri && layout === 'single',
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        if (!selectedImageUri || layout !== 'single') return false;
        return activePointersRef.current >= 2 || Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3;
      },
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.changedTouches;
        activePointersRef.current = touches.length;

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
          const nextX = initialTranslateRef.current.x + gesture.dx;
          const nextY = initialTranslateRef.current.y + gesture.dy;
          const clamped = clampTranslate(imgScale, nextX, nextY);
          setImgTranslateX(clamped.x);
          setImgTranslateY(clamped.y);
        }
      },
      onPanResponderRelease: () => {
        activePointersRef.current = 0;
      },
      onPanResponderTerminate: () => {
        activePointersRef.current = 0;
      },
    }),
    [selectedImageUri, layout, imgScale, imgTranslateX, imgTranslateY, canvasSize.width, canvasSize.height]
  );

  // Reset transform when image changes
  React.useEffect(() => {
    setImgScale(1);
    setImgTranslateX(0);
    setImgTranslateY(0);
  }, [selectedImageUri]);

  // ── Capture handlers ──
  const handlePhotoCapture = (uri: string) => {
    setSelectedImageUri(uri);
    setBlankBackgroundColor(null);
    setCollagePhotos([uri]);
    setLayout('single');
  };

  const handleGalleryPress = async () => {
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
      const asset = result.assets[0];
      setSelectedImageUri(asset.uri);
      setBlankBackgroundColor(null);
      setCollagePhotos([asset.uri]);
      setLayout('single');
    }
  };

  const handleRecentPhotoPress = (uri: string) => {
    setSelectedImageUri(uri);
    setBlankBackgroundColor(null);
    setCollagePhotos([uri]);
    setLayout('single');
  };

  // ── Sticker handlers ──
  const handleStickerSelect = (sticker: StickerItem) => {
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
    setStickers((prev) => prev.filter((s) => s.id !== id));
  };

  // ── Publish ──
  const handlePublish = () => {
    const trimmedCaption = caption.trim();
    const trimmedStoryText = textLayers[0]?.text.trim() ?? '';
    const selectedListing = allListingOptions.find((l) => l.id === selectedListingId);

    const posterImageUri =
      posterMode === 'blank'
        ? undefined
        : selectedImageUri ??
          (selectedListing
            ? allListingOptions.find((l) => l.id === selectedListingId)?.images?.[0]
            : undefined);

    const listingIdForPoster = posterMode === 'blank' ? '' : (selectedListingId || '');

    const newPoster: Poster = {
      id: `poster_${Date.now()}`,
      uploaderId,
      listingId: listingIdForPoster,
      image: posterImageUri || '',
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
      layout: layout === 'single' ? undefined : layout,
      filter: filter === 'normal' ? undefined : filter,
      templateId: activeTemplateId,
    };

    setIsPublishing(true);
    setTimeout(() => {
      addPoster(newPoster);
      show('Poster published!', 'success');
      setIsPublishing(false);
      navigation.replace('PosterViewer', { posterId: newPoster.id });
    }, 600);
  };

  // ── Reset / close ──
  const handleClose = () => {
    if (selectedImageUri || blankBackgroundColor) {
      setSelectedImageUri(null);
      setBlankBackgroundColor(null);
      setTextLayers([]);
      setStickers([]);
      setDrawings([]);
      setCaption('');
      setFilter('normal');
      setLayout('single');
      setCollagePhotos([]);
      setActiveTemplateId(undefined);
      setImgScale(1);
      setImgTranslateX(0);
      setImgTranslateY(0);
    } else {
      navigation.goBack();
    }
  };

  const isBlankMode = posterMode === 'blank';
  const hasCanvas = !!selectedImageUri || !!blankBackgroundColor;
  const isCollage = layout !== 'single';
  const filterOverlay = getFilterOverlay(filter);

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
        ) : isBlankMode && blankBackgroundColor ? (
          <View style={[styles.blankCanvas, { backgroundColor: blankBackgroundColor }]} />
        ) : isCollage ? (
          <MultiPhotoCollage
            layout={layout}
            photos={collagePhotos}
            onPhotosChange={setCollagePhotos}
            canvasSize={canvasSize}
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

        {/* Filter overlay (simple, reliable) */}
        {hasCanvas && filterOverlay.opacity > 0 && filterOverlay.color && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: filterOverlay.color, opacity: filterOverlay.opacity }]} pointerEvents="none" />
        )}

        {hasCanvas && <View style={styles.canvasOverlay} />}
      </View>

      {/* Top bar */}
      {hasCanvas && activeTool !== 'draw' && (
        <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
          <Pressable style={styles.topIconBtn} onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          <View style={styles.topActions}>
            <Pressable
              style={[styles.topActionPill, showTemplatePicker && styles.topActionPillActive]}
              onPress={() => setShowTemplatePicker(true)}
            >
              <Ionicons name="albums-outline" size={16} color="#fff" />
            </Pressable>
            <Pressable
              style={[styles.topActionPill, showDetails && styles.topActionPillActive]}
              onPress={() => setShowDetails(true)}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      )}

      {/* Creative Toolbar (bottom) */}
      {hasCanvas && activeTool !== 'draw' && (
        <CreativeToolbar
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          visible={!showDetails && !showBackgroundPicker && !showStickerPicker && !showLayoutPicker && !showTemplatePicker}
          onFilterToggle={() => setShowFilterStrip((prev) => !prev)}
          filterActive={showFilterStrip}
        />
      )}

      {/* Text Overlay */}
      {hasCanvas && (
        <TextOverlayCanvas
          layers={textLayers}
          onLayersChange={setTextLayers}
          canvasSize={canvasSize}
          isActive={activeTool === 'text'}
        />
      )}

      {/* Drawing Canvas */}
      {hasCanvas && (
        <DrawingCanvas
          strokes={drawings}
          onStrokesChange={setDrawings}
          canvasSize={canvasSize}
          isActive={activeTool === 'draw'}
          onClose={() => setActiveTool(null)}
        />
      )}

      {/* Sticker Overlays (draggable) */}
      {hasCanvas && stickers.length > 0 && activeTool !== 'draw' && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          {stickers.map((sticker) => {
            const pan = createStickerPanResponder(sticker.id);
            return (
              <StickerOverlay
                key={sticker.id}
                sticker={sticker}
                panHandlers={pan.panHandlers}
                onDelete={() => removeSticker(sticker.id)}
                canvasSize={canvasSize}
              />
            );
          })}
        </View>
      )}

      {/* Filter Strip */}
      {hasCanvas && (
        <FilterStrip
          activeFilter={filter}
          onFilterChange={setFilter}
          visible={showFilterStrip}
          previewUri={selectedImageUri ?? undefined}
        />
      )}

      {/* Bottom Control Bar */}
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
      <BackgroundPicker
        visible={showBackgroundPicker}
        currentColor={blankBackgroundColor}
        onSelect={(color) => {
          setBlankBackgroundColor(color);
          if (color) setSelectedImageUri(null);
        }}
        onClose={() => setShowBackgroundPicker(false)}
      />

      <StickerPicker
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onStickerSelect={handleStickerSelect}
      />

      <LayoutPicker
        visible={showLayoutPicker}
        currentLayout={layout}
        onSelect={(newLayout) => {
          setLayout(newLayout);
          if (newLayout !== 'single' && collagePhotos.length === 0 && selectedImageUri) {
            setCollagePhotos([selectedImageUri]);
          }
        }}
        onClose={() => setShowLayoutPicker(false)}
        previewUri={selectedImageUri ?? undefined}
      />

      <TemplatePicker
        visible={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={applyTemplate}
        currentTemplateId={activeTemplateId}
      />

      <DetailsDrawer
        visible={showDetails}
        onClose={() => setShowDetails(false)}
        mode={posterMode}
        onModeChange={(m) => {
          setPosterMode(m);
          if (m === 'blank') {
            setSelectedImageUri(null);
            if (!blankBackgroundColor) setBlankBackgroundColor('#1a1a2e');
          }
        }}
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
  onDelete: () => void;
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
      <Pressable style={styles.stickerDeleteBtn} onPress={onDelete} hitSlop={6}>
        <Ionicons name="close-circle" size={16} color="#ff3b30" />
      </Pressable>
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
  blankCanvas: {
    ...StyleSheet.absoluteFillObject,
  },
  canvasOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
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
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  topActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topActionPillActive: {
    backgroundColor: 'rgba(0,0,0,0.55)',
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
});
