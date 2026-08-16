import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography, Radius, Type, Space } from '../theme/designTokens';
import type { CreatorInitialMedia } from '../navigation/types';
import CreatorCamera from './CreatorCamera';
import { PressScale } from './CreatorAnimations';
import { MediaBrowserSheet, type SelectedAsset } from './tools/MediaBrowser';
import { ProductBrowserSheet, type ProductRef } from './tools/commerce';
import { CreatorTemplateBrowser } from './CreatorTemplateBrowser';
import { CreatorDraftService, type DraftMeta } from './drafts';
import type { CreatorTemplate } from './templates';
import { useHaptic } from '../hooks/useHaptic';

// ── Creator Entry Screen (intent-aware) ────────────────────────────
// Replaces the binary camera/gallery choice with four clear entry
// intents, each a large tappable tile on a full-screen dark canvas:
//
//   Camera    → opens the camera (CreatorCamera)
//   Photos    → opens the MediaBrowserSheet (consolidated media browser)
//   Items     → opens the ProductBrowserSheet (create a Look with items)
//   Templates → opens the CreatorTemplateBrowser
//
// Plus the "Aa" blank text entry as a 5th option at the bottom.
//
// The old gallery grid (inline MediaLibrary pagination, selection state,
// blur bottom bar) has been replaced by the reusable MediaBrowserSheet,
// which consolidates recents/albums/photos/videos tabs, ordered
// multi-select, and permission recovery into one component.

export interface CreatorEntryScreenProps {
  documentType: 'look' | 'poster';
  onClose: () => void;
  /**
   * Returns the selected media in tap/selection order as a typed
   * CreatorInitialMedia[] payload. The caller (CreatorStudioShell) is
   * responsible for deciding how to seed the document — Poster creates
   * one page per asset, Look creates stacked layers on one page.
   */
  onMediaSelected: (media: CreatorInitialMedia[]) => void;
  onBlankStart: () => void;
  /**
   * Optional: apply a template selected from the Templates tile. When
   * not provided, the Templates tile falls back to onBlankStart (the
   * user enters the blank composer where the template browser is also
   * accessible from the composer chrome).
   */
  onApplyTemplate?: (template: CreatorTemplate) => void;
  /**
   * Optional: resume a draft from the "Continue editing" section. When
   * not provided, the section is hidden (truthful UI — no tappable
   * items without a handler).
   */
  onOpenDraft?: (draftId: string) => void;
}

type EntryView = 'tiles' | 'camera';

export function CreatorEntryScreen({
  documentType,
  onClose,
  onMediaSelected,
  onBlankStart,
  onApplyTemplate,
  onOpenDraft,
}: CreatorEntryScreenProps) {
  const insets = useSafeAreaInsets();
  const isPoster = documentType === 'poster';
  const haptic = useHaptic();

  // ── View state: 'tiles' (default intent grid) or 'camera' ──
  const [view, setView] = useState<EntryView>('tiles');

  // ── Sheet visibility ──
  const [showPhotos, setShowPhotos] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // ── Drafts for "Continue editing" ──
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load recent drafts for "Continue editing" (only if resumable)
  useEffect(() => {
    if (!onOpenDraft) return;
    let cancelled = false;
    CreatorDraftService.listDrafts().then((all) => {
      if (cancelled || !mountedRef.current) return;
      const filtered = all
        .filter((d) => d.type === documentType)
        .slice(0, 4);
      setDrafts(filtered);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [documentType, onOpenDraft]);

  // ── Camera capture → typed media payload → enter editor ──
  // Legacy single-URI path (visual search, backward-compatible callers).
  // For poster/look modes, the camera sends a typed batch via
  // onCaptureBatch instead, preserving the correct kind (image/video).
  const handleCapture = useCallback((uri: string) => {
    RNImage.getSize(uri, (imgW: number, imgH: number) => {
      const media: CreatorInitialMedia = {
        id: `capture_${Date.now()}`,
        uri,
        kind: 'image',
        width: imgW,
        height: imgH,
      };
      onMediaSelected([media]);
    }, () => {
      const media: CreatorInitialMedia = {
        id: `capture_${Date.now()}`,
        uri,
        kind: 'image',
      };
      onMediaSelected([media]);
    });
  }, [onMediaSelected]);

  // ── Camera batch capture → typed media payload → enter editor ──
  // The camera sends a CreatorInitialMedia[] batch with the correct kind
  // (image or video) for each capture. This is the primary path for
  // poster/look camera captures — it preserves video kind so recordings
  // are not misclassified as images.
  const handleCaptureBatch = useCallback((captures: CreatorInitialMedia[]) => {
    if (captures.length === 0) return;
    onMediaSelected(captures);
  }, [onMediaSelected]);

  // ── Photos: MediaBrowserSheet confirm → typed media payload ──
  // The MediaBrowserSheet returns SelectedAsset[] in tap order. We
  // convert to CreatorInitialMedia[] preserving kind, dimensions, and
  // video duration, then hand off to the existing onMediaSelected
  // contract — the downstream composer flow is unchanged.
  const handlePhotosConfirm = useCallback((assets: SelectedAsset[]) => {
    setShowPhotos(false);
    if (assets.length === 0) return;
    const media: CreatorInitialMedia[] = assets.map((a, i) => ({
      id: `entry_${i}_${a.uri}`,
      uri: a.uri,
      kind: a.mediaType,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs,
    }));
    haptic.light();
    onMediaSelected(media);
  }, [onMediaSelected, haptic]);

  // ── Items: ProductBrowserSheet select → media payload ──
  // The product's image becomes the initial media layer. The composer
  // receives it via onMediaSelected, preserving the existing contract.
  // For Look, this creates a single-photo collage seeded with the
  // product image; for Poster, it creates a one-frame story.
  const handleProductSelect = useCallback((product: ProductRef) => {
    setShowItems(false);
    const media: CreatorInitialMedia = {
      id: `product_${product.id}`,
      uri: product.imageUri,
      kind: 'image',
    };
    haptic.light();
    onMediaSelected([media]);
  }, [onMediaSelected, haptic]);

  // ── Templates: apply template → enter composer ──
  // When onApplyTemplate is provided, the template document is applied
  // directly. Otherwise, fall back to onBlankStart — the user enters
  // the blank composer where the template browser is accessible from
  // the composer chrome.
  const handleTemplateApply = useCallback((template: CreatorTemplate) => {
    setShowTemplates(false);
    haptic.light();
    if (onApplyTemplate) {
      onApplyTemplate(template);
    } else {
      onBlankStart();
    }
  }, [onApplyTemplate, onBlankStart, haptic]);

  // ── Tile definitions ──
  const tiles: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    description: string;
    onPress: () => void;
  }[] = [
    {
      icon: 'camera-outline',
      label: 'Camera',
      description: isPoster ? 'Capture frames for your story' : 'Capture photos for your look',
      onPress: () => { haptic.selection(); setView('camera'); },
    },
    {
      icon: 'images-outline',
      label: 'Photos',
      description: isPoster ? 'Select photos from your roll' : 'Select photos for your collage',
      onPress: () => { haptic.selection(); setShowPhotos(true); },
    },
    {
      icon: 'pricetag-outline',
      label: 'Items',
      description: isPoster ? 'Feature a listing in your story' : 'Build a look from your listings',
      onPress: () => { haptic.selection(); setShowItems(true); },
    },
    {
      icon: 'grid-outline',
      label: 'Templates',
      description: isPoster ? 'Start from a story template' : 'Start from a look template',
      onPress: () => { haptic.selection(); setShowTemplates(true); },
    },
  ];

  // ═══════════════════════════════════════════════════════════════
  // CAMERA VIEW — full-screen viewfinder, accessed from Camera tile
  // Uses the dedicated CreatorCamera component (like VisualSearchCamera)
  // ═══════════════════════════════════════════════════════════════
  if (view === 'camera') {
    return (
      <View style={styles.container}>
        <CreatorCamera
          mode={documentType}
          onCapture={handleCapture}
          onCaptureBatch={handleCaptureBatch}
          onGallery={() => { haptic.selection(); setView('tiles'); }}
          onClose={onClose}
        />
        {/* "Aa" text-mode button — Instagram "Create" pattern, top-right */}
        <Pressable
          style={[styles.textModeBtn, { top: insets.top + 8, right: 12 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => { haptic.light(); onBlankStart(); }}
          accessibilityLabel="Create text poster"
          accessibilityHint="Starts a blank text poster"
          accessibilityRole="button"
        >
          <Text style={styles.textModeBtnLabel}>Aa</Text>
        </Pressable>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TILES VIEW — intent-aware entry (default)
  // Full-screen dark canvas. 4 large tiles in a 2×2 grid with the
  // "Aa" blank text entry as a 5th option below. If the user has
  // recent drafts and draft resumption is supported, a "Continue
  // editing" section appears above the tiles.
  // ═══════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* Top bar — title + close */}
      <View style={[styles.tilesTopBar, { paddingTop: insets.top + Space.sm }]}>
        <Text style={styles.tilesTitle}>
          {isPoster ? 'New Story' : 'New Look'}
        </Text>
        <Pressable
          style={styles.topIconBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => { haptic.light(); onClose(); }}
          accessibilityLabel="Close"
          accessibilityHint="Closes the creator entry screen"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.tilesScroll}
        contentContainerStyle={[
          styles.tilesContent,
          { paddingBottom: insets.bottom + Space.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Continue editing — recent drafts (only if resumable) */}
        {onOpenDraft && drafts.length > 0 && (
          <View style={styles.draftsSection}>
            <Text style={styles.sectionLabel}>Continue editing</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.draftsScroll}
            >
              {drafts.map((draft) => (
                <PressScale
                  key={draft.id}
                  style={styles.draftCard}
                  accessibilityLabel={`Resume ${draft.title}`}
                  accessibilityHint="Opens this draft in the composer"
                  onPress={() => { haptic.selection(); onOpenDraft(draft.id); }}
                >
                  {draft.thumbnailUri ? (
                    <Image
                      source={{ uri: draft.thumbnailUri }}
                      style={styles.draftThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.draftThumb, styles.draftThumbPlaceholder]}>
                      <Ionicons
                        name={draft.type === 'poster' ? 'film-outline' : 'square-outline'}
                        size={24}
                        color="rgba(255,255,255,0.3)"
                      />
                    </View>
                  )}
                  <Text style={styles.draftTitle} numberOfLines={1}>
                    {draft.title}
                  </Text>
                </PressScale>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Section label */}
        <Text style={styles.sectionLabel}>Create</Text>

        {/* 2×2 intent grid */}
        <View style={styles.tilesGrid}>
          <View style={styles.tileRow}>
            {tiles.slice(0, 2).map((tile) => (
              <PressScale
                key={tile.label}
                style={styles.tile}
                accessibilityLabel={tile.label}
                accessibilityHint={tile.description}
                onPress={tile.onPress}
              >
                <Ionicons name={tile.icon} size={32} color="#fff" />
                <Text style={styles.tileLabel}>{tile.label}</Text>
                <Text style={styles.tileDescription}>{tile.description}</Text>
              </PressScale>
            ))}
          </View>
          <View style={styles.tileRow}>
            {tiles.slice(2, 4).map((tile) => (
              <PressScale
                key={tile.label}
                style={styles.tile}
                accessibilityLabel={tile.label}
                accessibilityHint={tile.description}
                onPress={tile.onPress}
              >
                <Ionicons name={tile.icon} size={32} color="#fff" />
                <Text style={styles.tileLabel}>{tile.label}</Text>
                <Text style={styles.tileDescription}>{tile.description}</Text>
              </PressScale>
            ))}
          </View>
        </View>

        {/* "Aa" blank text entry — 5th option */}
        <Pressable
          style={styles.blankBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => { haptic.light(); onBlankStart(); }}
          accessibilityLabel="Create text poster"
          accessibilityHint="Starts a blank text poster"
          accessibilityRole="button"
        >
          <Text style={styles.blankBtnLabel}>Aa</Text>
          <Text style={styles.blankBtnText}>Start with text</Text>
        </Pressable>
      </ScrollView>

      {/* ── Photos: MediaBrowserSheet ── */}
      <MediaBrowserSheet
        visible={showPhotos}
        onClose={() => setShowPhotos(false)}
        onConfirm={handlePhotosConfirm}
        maxSelections={isPoster ? 10 : 6}
        title="Select photos"
        showCameraTile={false}
        allowVideos
      />

      {/* ── Items: ProductBrowserSheet ── */}
      <ProductBrowserSheet
        visible={showItems}
        onClose={() => setShowItems(false)}
        onProductSelect={handleProductSelect}
      />

      {/* ── Templates: CreatorTemplateBrowser ── */}
      <CreatorTemplateBrowser
        visible={showTemplates}
        documentType={documentType}
        hasExistingWork={false}
        onClose={() => setShowTemplates(false)}
        onApply={handleTemplateApply}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Tiles top bar
  tilesTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
  },
  tilesTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    color: '#fff',
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tiles scroll container
  tilesScroll: {
    flex: 1,
  },
  tilesContent: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
  },

  // Section label (shared by "Continue editing" and "Create")
  sectionLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: Type.captionElevated.letterSpacing,
    marginBottom: Space.md,
    textTransform: 'uppercase',
  },

  // Drafts section — "Continue editing"
  draftsSection: {
    marginBottom: Space.lg,
  },
  draftsScroll: {
    gap: Space.sm,
  },
  draftCard: {
    width: 120,
    gap: Space.xs,
  },
  draftThumb: {
    width: 120,
    height: 150,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  draftThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.7)',
  },

  // 2×2 intent grid
  tilesGrid: {
    gap: Space.md,
  },
  tileRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  tile: {
    flex: 1,
    minHeight: 140,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: Space.xs,
  },
  tileLabel: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: '#fff',
    marginTop: Space.xs,
  },
  tileDescription: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },

  // "Aa" blank text entry — 5th option
  blankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    alignSelf: 'center',
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  blankBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: Typography.family.bold,
  },
  blankBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },

  // Camera view — "Aa" text-mode button (Instagram "Create" pattern)
  textModeBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  textModeBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: Typography.family.bold,
  },
});
