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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { MOCK_LISTINGS, MOCK_USERS, Listing } from '../data/mockData';
import { mockArrayOrEmpty } from '../utils/mockGate';
import type { Poster } from '../data/posters';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';

import CameraCapture from '../components/poster/CameraCapture';
import CreativeToolbar, { CreativeTool } from '../components/poster/CreativeToolbar';
import BottomControlBar, { CaptureMode } from '../components/poster/BottomControlBar';
import TextOverlayCanvas, { TextLayer } from '../components/poster/TextOverlayCanvas';
import DetailsDrawer, { PosterMode } from '../components/poster/DetailsDrawer';
import BackgroundPicker from '../components/poster/BackgroundPicker';
import StickerPicker, { StickerItem } from '../components/poster/StickerPicker';
import DrawingCanvas, { BrushStroke } from '../components/poster/DrawingCanvas';
import LayoutPicker, { LayoutType } from '../components/poster/LayoutPicker';
import FilterStrip, { ImageFilter, getFilterOverlay } from '../components/poster/FilterStrip';
import GLFilterView from '../components/poster/GLFilterView';
import MultiPhotoCollage from '../components/poster/MultiPhotoCollage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
  const [captureMode, setCaptureMode] = React.useState<CaptureMode>('poster');
  const [posterMode, setPosterMode] = React.useState<PosterMode>('marketplace');
  const [selectedImageUri, setSelectedImageUri] = React.useState<string | null>(null);
  const [blankBackgroundColor, setBlankBackgroundColor] = React.useState<string | null>(null);
  const [isVideo, setIsVideo] = React.useState(false);

  const [textLayers, setTextLayers] = React.useState<TextLayer[]>([]);
  const [activeTool, setActiveTool] = React.useState<CreativeTool>(null);

  const [caption, setCaption] = React.useState('');
  const [expiryHours, setExpiryHours] = React.useState(24);
  const [selectedListingId, setSelectedListingId] = React.useState('');

  const [showDetails, setShowDetails] = React.useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = React.useState(false);
  const [showStickerPicker, setShowStickerPicker] = React.useState(false);
  const [showLayoutPicker, setShowLayoutPicker] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);

  const [recentPhotos, setRecentPhotos] = React.useState<MediaLibrary.Asset[]>([]);
  const [mediaLibPermission] = MediaLibrary.usePermissions();

  const [canvasSize, setCanvasSize] = React.useState({ width: SCREEN_W, height: SCREEN_H });

  // New creative state
  const [stickers, setStickers] = React.useState<StickerItem[]>([]);
  const [drawings, setDrawings] = React.useState<BrushStroke[]>([]);
  const [layout, setLayout] = React.useState<LayoutType>('single');
  const [filter, setFilter] = React.useState<ImageFilter>('normal');
  const [showFilterStrip, setShowFilterStrip] = React.useState(false);
  const [collagePhotos, setCollagePhotos] = React.useState<string[]>([]);

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
          mediaType: ['photo', 'video'],
          first: 15,
          sortBy: MediaLibrary.SortBy.creationTime,
        });
        setRecentPhotos(result.assets);
      } catch {
        // silently fail
      }
    };

    load();
  }, [mediaLibPermission?.granted]);

  // ── Tool handling ──
  React.useEffect(() => {
    if (activeTool === 'text') {
      // text tool activated - canvas handles add-layer UI
    } else if (activeTool === 'background') {
      setShowBackgroundPicker(true);
      setActiveTool(null);
    } else if (activeTool === 'stickers') {
      setShowStickerPicker(true);
      setActiveTool(null);
    } else if (activeTool === 'draw') {
      // drawing stays active on the canvas
    } else if (activeTool === 'layout') {
      setShowLayoutPicker(true);
      setActiveTool(null);
    }
  }, [activeTool]);

  // ── Capture handlers ──
  const handlePhotoCapture = (uri: string) => {
    setSelectedImageUri(uri);
    setIsVideo(false);
    setBlankBackgroundColor(null);
    setCollagePhotos([uri]);
    setLayout('single');
  };

  const handleVideoCapture = (uri: string) => {
    setSelectedImageUri(uri);
    setIsVideo(true);
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
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.92,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      setSelectedImageUri(asset.uri);
      setIsVideo(asset.type === 'video');
      setBlankBackgroundColor(null);
      setCollagePhotos([asset.uri]);
      setLayout('single');
    }
  };

  const handleRecentPhotoPress = (uri: string) => {
    setSelectedImageUri(uri);
    setIsVideo(false);
    setBlankBackgroundColor(null);
    setCollagePhotos([uri]);
    setLayout('single');
  };

  const handleFlipCamera = () => {
    // handled inside CameraCapture, this is for BottomControlBar fallback
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
            const nextX = Math.min(
              Math.max((s.x ?? startX) + gestureState.dx, 0),
              canvasSize.width - 80
            );
            const nextY = Math.min(
              Math.max((s.y ?? startY) + gestureState.dy, 0),
              canvasSize.height - 40
            );
            return { ...s, x: nextX, y: nextY };
          })
        );
      },
      onPanResponderRelease: () => {
        // done
      },
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
          ? {
              text: textLayers[0].text,
              color: textLayers[0].color,
              position: 'center',
            }
          : undefined,
      textLayers: textLayers.map((l) => ({
        text: l.text,
        color: l.color,
        position: 'center',
        fontFamily: l.fontFamily,
        fontSize: l.fontSize,
        backgroundColor: l.backgroundColor,
        alignment: l.alignment,
      })),
      stickers: stickers.map((s) => ({
        id: s.id,
        type: s.type,
        content: s.content,
        color: s.color,
      })),
      drawings: drawings.map((d) => ({
        id: d.id,
        points: d.points,
        color: d.color,
        width: d.width,
      })),
      layout: layout === 'single' ? undefined : layout,
      filter: filter === 'normal' ? undefined : filter,
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

      {/* ── Canvas / Camera ── */}
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
            onVideoCapture={handleVideoCapture}
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
        ) : selectedImageUri && filter !== 'normal' && !isVideo ? (
          <GLFilterView uri={selectedImageUri} filter={filter} style={StyleSheet.absoluteFillObject} />
        ) : (
          <Image
            source={{ uri: selectedImageUri || undefined }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        )}

        {/* Filter overlay (for collage / video where GL filter doesn't apply) */}
        {hasCanvas && filterOverlay.opacity > 0 && filterOverlay.color && (isCollage || isVideo) && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: filterOverlay.color,
                opacity: filterOverlay.opacity,
              },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Dark overlay for contrast when editing */}
        {hasCanvas && <View style={styles.canvasOverlay} />}
      </View>

      {/* ── Top bar (when canvas is active) ── */}
      {hasCanvas && activeTool !== 'draw' && (
        <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
          <Pressable style={styles.topIconBtn} onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          <View style={styles.topActions}>
            <Pressable
              style={[styles.topActionPill, showFilterStrip && styles.topActionPillActive]}
              onPress={() => setShowFilterStrip((prev) => !prev)}
            >
              <Ionicons name="color-wand-outline" size={16} color="#fff" />
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

      {/* ── Creative Toolbar ── */}
      {hasCanvas && activeTool !== 'draw' && (
        <CreativeToolbar
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          visible={!showDetails && !showBackgroundPicker && !showStickerPicker && !showLayoutPicker}
        />
      )}

      {/* ── Text Overlay Canvas ── */}
      {hasCanvas && (
        <TextOverlayCanvas
          layers={textLayers}
          onLayersChange={setTextLayers}
          canvasSize={canvasSize}
          isActive={activeTool === 'text'}
        />
      )}

      {/* ── Drawing Canvas ── */}
      {hasCanvas && (
        <DrawingCanvas
          strokes={drawings}
          onStrokesChange={setDrawings}
          canvasSize={canvasSize}
          isActive={activeTool === 'draw'}
          onClose={() => setActiveTool(null)}
        />
      )}

      {/* ── Sticker Overlays (draggable) ── */}
      {hasCanvas && stickers.length > 0 && activeTool !== 'draw' && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          {stickers.map((sticker) => {
            const pan = createStickerPanResponder(sticker.id);
            return (
              <View
                key={sticker.id}
                style={[
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
                ]}
                pointerEvents="box-none"
              >
                <View {...pan.panHandlers} pointerEvents="auto" style={styles.stickerDragArea}>
                  <Text style={styles.stickerText} numberOfLines={3}>
                    {sticker.content}
                  </Text>
                </View>
                <Pressable
                  style={styles.stickerDeleteBtn}
                  onPress={() => removeSticker(sticker.id)}
                  hitSlop={6}
                >
                  <Ionicons name="close-circle" size={16} color="#ff3b30" />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Filter Strip ── */}
      {hasCanvas && (
        <FilterStrip
          activeFilter={filter}
          onFilterChange={setFilter}
          visible={showFilterStrip}
          previewUri={selectedImageUri ?? undefined}
        />
      )}

      {/* ── Bottom Control Bar ── */}
      {!hasCanvas && (
        <BottomControlBar
          mode={captureMode}
          onModeChange={setCaptureMode}
          onGalleryPress={handleGalleryPress}
          onFlipCamera={handleFlipCamera}
          recentPhotos={recentPhotos}
          onRecentPhotoPress={handleRecentPhotoPress}
          showCameraControls={!hasCanvas}
        />
      )}

      {/* ── Background Picker ── */}
      <BackgroundPicker
        visible={showBackgroundPicker}
        currentColor={blankBackgroundColor}
        onSelect={(color) => {
          setBlankBackgroundColor(color);
          if (color) setSelectedImageUri(null);
        }}
        onClose={() => setShowBackgroundPicker(false)}
      />

      {/* ── Sticker Picker ── */}
      <StickerPicker
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onStickerSelect={handleStickerSelect}
      />

      {/* ── Layout Picker ── */}
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

      {/* ── Details Drawer ── */}
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
  stickerDragArea: {
    minWidth: 30,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
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
