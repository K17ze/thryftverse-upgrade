import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
  Keyboard,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { CreatorProvider, useCreator } from './CreatorContext';
import type { CreatorLayer } from './composition';
import { CreatorCanvas } from './CreatorCanvas';
import { CreatorLayersSheet } from './CreatorLayersSheet';
import { CreatorToolDock } from './CreatorToolDock';
import { CreatorPublishSheet } from './CreatorPublishSheet';
import { CreatorSettingsSheet } from './CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from './CreatorAssetPicker';
import { CreatorTemplateBrowser } from './CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from './CreatorPreviewOverlay';
import { CreatorEntryScreen } from './CreatorEntryScreen';
import { PressScale } from './CreatorAnimations';
import type { CreatorTemplate } from './templates';

const { width: SCREEN_W } = Dimensions.get('window');

function layerTypeLabel(type: CreatorLayer['type']): string {
  switch (type) {
    case 'media': return 'Media';
    case 'text': return 'Text';
    case 'product': return 'Product';
    case 'mention': return 'Mention';
    case 'look': return 'Look';
    case 'vote': return 'Vote';
    case 'decorative': return 'Shape';
    default: return 'Layer';
  }
}

function CreatorStudioInner() {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { document, activePageIndex, setActivePageIndex, selectedLayerId, selectLayer, canUndo, canRedo, undo, redo, isDirty, removeLayer, duplicateLayer, reorderLayer, updateLayer, addLayer, addPage, removePage, duplicatePage, commitLayerTransform, autosaveStatus, isLoadingDraft, setDocument, saveDraft } = useCreator();

  const [showLayers, setShowLayers] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [entryComplete, setEntryComplete] = useState(false);

  // Show entry screen when document is empty and not loading a draft/template
  const hasContent = document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft;

  const page = document.pages[activePageIndex];
  const isLook = document.type === 'look';
  const isPoster = document.type === 'poster';

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Full-screen immersive canvas (Instagram Stories pattern) ──────
  // The canvas fills the ENTIRE screen. Chrome floats over it with
  // gradient/blur overlays. No padding, no card, no reserved space.
  //
  // For Poster (9:16): canvas = full screen width, height = width / ratio.
  //   On most phones this fills the full height. The canvas IS the stage.
  // For Look (4:5): canvas = full screen width, height = width / ratio.
  //   4:5 is squarer, so there will be space above/below — the canvas
  //   centers vertically and the background fills the rest.
  const canvasWidth = screenWidth;
  const canvasHeight = useMemo(() => {
    const h = Math.floor(screenWidth / document.canvas.aspectRatio);
    // For 9:16 poster, cap at screen height so it doesn't overflow
    return Math.min(h, screenHeight);
  }, [screenWidth, document.canvas.aspectRatio, screenHeight]);

  // Canvas is vertically centered if shorter than screen
  const canvasVerticalOffset = useMemo(() => {
    if (canvasHeight >= screenHeight) return 0;
    return Math.floor((screenHeight - canvasHeight) / 2);
  }, [canvasHeight, screenHeight]);

  // Truthful back — offers Save Draft / Discard / Keep Editing when dirty.
  // This is honest: the draft is actually persisted to the draft service.
  const handleBack = useCallback(() => {
    if (!isDirty) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Save draft?',
      'Your changes haven\'t been published yet.',
      [
        {
          text: 'Save draft',
          onPress: async () => {
            try {
              await saveDraft();
              navigation.goBack();
            } catch {
              Alert.alert('Could not save draft', 'Please try again.');
            }
          },
        },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        { text: 'Keep editing', style: 'cancel' },
      ],
    );
  }, [isDirty, navigation, saveDraft]);

  // Keyboard shortcuts (web/tablet only)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if ((isMeta && e.key === 'z' && e.shiftKey) || (isMeta && e.key === 'y')) {
        e.preventDefault();
        if (canRedo) redo();
      } else if (e.key === 'Escape') {
        if (showPreview) setShowPreview(false);
        else if (showOverflow) setShowOverflow(false);
        else if (showPublish) setShowPublish(false);
        else if (showTemplates) setShowTemplates(false);
        else if (showLayers) setShowLayers(false);
        else if (showSettings) setShowSettings(false);
        else if (pickerMode) { setPickerMode(null); setEditingLayer(null); }
        else if (selectedLayerId) selectLayer(null);
        else handleBack();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId) {
        e.preventDefault();
        removeLayer(selectedLayerId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canUndo, canRedo, undo, redo, showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // Hardware back button — intercept to close sheets first
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showPreview) { setShowPreview(false); return true; }
        if (showOverflow) { setShowOverflow(false); return true; }
        if (showPublish) { setShowPublish(false); return true; }
        if (showTemplates) { setShowTemplates(false); return true; }
        if (showLayers) { setShowLayers(false); return true; }
        if (showSettings) { setShowSettings(false); return true; }
        if (pickerMode) { setPickerMode(null); setEditingLayer(null); return true; }
        if (selectedLayerId) { selectLayer(null); return true; }
        return false;
      };
      return onBackPress;
    }, [showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer])
  );

  const handleCanvasPress = useCallback(() => {
    Keyboard.dismiss();
    selectLayer(null);
  }, [selectLayer]);

  const handleLayerPress = useCallback((layerId: string) => {
    selectLayer(layerId);
  }, [selectLayer]);

  const selectedLayer = page?.layers.find((l) => l.id === selectedLayerId) ?? null;

  // Compact draft status label for the top bar centre
  const draftStatusLabel = useMemo(() => {
    if (isLoadingDraft) return 'Loading…';
    if (autosaveStatus === 'saving') return 'Saving…';
    if (autosaveStatus === 'failed') return 'Save failed';
    return null;
  }, [isLoadingDraft, autosaveStatus]);

  // Handle media selection from entry screen — add all layers to the
  // first page, then enter the editor.
  const handleEntryMediaSelected = useCallback((layers: CreatorLayer[]) => {
    layers.forEach((layer) => addLayer(layer));
    setEntryComplete(true);
  }, [addLayer]);

  const handleEntryBlankStart = useCallback(() => {
    setEntryComplete(true);
  }, []);

  const handleEntryClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (showEntryScreen) {
    return (
      <CreatorEntryScreen
        documentType={document.type}
        onClose={handleEntryClose}
        onMediaSelected={handleEntryMediaSelected}
        onBlankStart={handleEntryBlankStart}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Full-screen canvas ────────────────────────────────────────── */}
      {/* The canvas fills the entire screen. All chrome floats over it
          with gradient/blur overlays. This is the Instagram Stories
          pattern: media dominates, chrome recedes. */}
      <View style={styles.canvasStage}>
        <View style={{ position: 'absolute', top: canvasVerticalOffset, left: 0, right: 0 }}>
          <CreatorCanvas
            document={document}
            page={page}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            mode="edit"
            selectedLayerId={selectedLayerId}
            onLayerPress={handleLayerPress}
            onCanvasPress={handleCanvasPress}
            onLayerTransformChange={(layerId, updates) => commitLayerTransform(layerId, updates, 'Transform layer')}
            onLayerDoubleTap={(layerId) => {
              const l = page?.layers.find((x) => x.id === layerId);
              if (l?.type === 'text') {
                setEditingLayer(l);
                setPickerMode('text');
              }
            }}
            onLayerLongPress={(layerId) => {
              selectLayer(layerId);
              setShowLayers(true);
            }}
          />
        </View>
      </View>

      {/* ── Floating top bar with gradient fade ──────────────────────── */}
      {/* Semi-transparent gradient from black to transparent, like
          Instagram Stories. Chrome floats over the canvas. */}
      <View style={[styles.topBarContainer, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
          style={styles.topBarGradient}
        >
          {/* Page progress dots (poster) — Instagram-style segments at top */}
          {isPoster && document.pages.length > 1 && (
            <View style={styles.pageDotsRow}>
              {document.pages.map((p, i) => (
                <PressScale
                  key={p.id}
                  onPress={() => { selectLayer(null); setActivePageIndex(i); }}
                  onLongPress={() => {
                    if (document.pages.length > 1) {
                      Alert.alert(
                        `Page ${i + 1}`,
                        undefined,
                        [
                          { text: 'Duplicate', onPress: () => duplicatePage(i) },
                          { text: 'Delete', style: 'destructive', onPress: () => removePage(i) },
                          { text: 'Cancel', style: 'cancel' },
                        ],
                      );
                    }
                  }}
                  style={styles.pageDotSegment}
                  accessibilityLabel={`Page ${i + 1}`}
                >
                  <View style={[
                    styles.pageDotFill,
                    i === activePageIndex
                      ? { backgroundColor: '#fff' }
                      : { backgroundColor: 'rgba(255,255,255,0.3)' },
                  ]} />
                </PressScale>
              ))}
            </View>
          )}

          <View style={styles.topBarRow}>
            {selectedLayer ? (
              /* During selection: Done · object name · More (audit 9.3) */
              <>
                <PressScale
                  onPress={() => selectLayer(null)}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                >
                  <Text style={styles.doneText}>Done</Text>
                </PressScale>

                <View style={styles.topCenter}>
                  <Text style={styles.titleText} numberOfLines={1}>
                    {layerTypeLabel(selectedLayer.type)}
                  </Text>
                </View>

                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => setShowOverflow(true)}
                    style={styles.topBtn}
                    accessibilityLabel="More options"
                  >
                    <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                  </PressScale>
                </View>
              </>
            ) : (
              /* Default: Back · center draft status · Preview/Next (audit 9.3) */
              <>
                <PressScale
                  onPress={handleBack}
                  style={styles.topBtn}
                  accessibilityLabel="Back"
                >
                  <Ionicons name="close" size={28} color="#fff" />
                </PressScale>

                {/* Centre: type label + status */}
                <View style={styles.topCenter}>
                  {draftStatusLabel ? (
                    <Text style={styles.statusText} numberOfLines={1}>
                      {draftStatusLabel}
                    </Text>
                  ) : (
                    <Text style={styles.titleText} numberOfLines={1}>
                      {isLook ? 'Look' : 'Poster'}
                      {isDirty ? ' ·' : ''}
                    </Text>
                  )}
                </View>

                {/* Right: Preview + Next */}
                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => setShowPreview(true)}
                    style={styles.topBtn}
                    accessibilityLabel="Preview"
                  >
                    <Ionicons name="eye-outline" size={24} color="#fff" />
                  </PressScale>
                  <PressScale
                    onPress={() => setShowPublish(true)}
                    style={styles.nextBtn}
                    accessibilityLabel="Next"
                    scale={0.97}
                  >
                    <Text style={styles.nextBtnText}>Next</Text>
                  </PressScale>
                </View>
              </>
            )}
          </View>
        </LinearGradient>
      </View>

      {/* ── Add page button (poster) — floating, right side ──────────── */}
      {isPoster && document.pages.length < 10 && (
        <PressScale
          onPress={() => { selectLayer(null); addPage(); }}
          style={[styles.addPageFloat, { top: insets.top + 60 }]}
          accessibilityLabel="Add page"
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.3)']}
            style={styles.addPageFloatGradient}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </LinearGradient>
        </PressScale>
      )}

      {/* ── Floating bottom rail with gradient fade ──────────────────── */}
      {/* Semi-transparent gradient from transparent to black, with
          blur. The tool dock sits on top of this gradient. */}
      <View style={[styles.bottomRailContainer, { paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
          style={styles.bottomRailGradient}
        >
          <CreatorToolDock
            selectedLayer={selectedLayer}
            onPublish={() => setShowPublish(true)}
            onSettings={() => setShowSettings(true)}
            onToolPress={(tool) => setPickerMode(tool)}
            onEditLayer={(layer) => {
              setEditingLayer(layer);
              if (layer.type === 'text') setPickerMode('text');
              else if (layer.type === 'media') setPickerMode('media');
              else if (layer.type === 'product') setPickerMode('product');
              else if (layer.type === 'mention') setPickerMode('mention');
            }}
            onDeleteLayer={(id) => removeLayer(id)}
            onDuplicateLayer={(id) => duplicateLayer(id)}
            onReorderLayer={(id, dir) => reorderLayer(id, dir)}
            onMore={() => setShowOverflow(true)}
            floating={true}
          />
        </LinearGradient>
      </View>

      {/* ── Overflow menu ────────────────────────────────────────────── */}
      {showOverflow && (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View
            style={[
              styles.overflowMenu,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                bottom: insets.bottom + 72,
              },
            ]}
          >
            <OverflowItem
              icon="arrow-undo"
              label="Undo"
              disabled={!canUndo}
              colors={colors}
              onPress={() => { undo(); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="arrow-redo"
              label="Redo"
              disabled={!canRedo}
              colors={colors}
              onPress={() => { redo(); setShowOverflow(false); }}
            />
            <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
            <OverflowItem
              icon="at-outline"
              label="Mention"
              colors={colors}
              onPress={() => { setPickerMode('mention'); setShowOverflow(false); }}
            />
            {isLook ? (
              <OverflowItem
                icon="shirt-outline"
                label="Look"
                colors={colors}
                onPress={() => { setPickerMode('look'); setShowOverflow(false); }}
              />
            ) : (
              <OverflowItem
                icon="stats-chart-outline"
                label="Vote"
                colors={colors}
                onPress={() => { setPickerMode('vote'); setShowOverflow(false); }}
              />
            )}
            <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
            <OverflowItem
              icon="layers-outline"
              label="Layers"
              colors={colors}
              onPress={() => { setShowLayers(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="grid-outline"
              label="Templates"
              colors={colors}
              onPress={() => { setShowTemplates(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="document-text-outline"
              label="Drafts"
              colors={colors}
              onPress={() => { navigation.navigate('CreatorDraftList'); setShowOverflow(false); }}
            />
            <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
            <OverflowItem
              icon="settings-outline"
              label="Settings"
              colors={colors}
              onPress={() => { setShowSettings(true); setShowOverflow(false); }}
            />
          </View>
        </Pressable>
      )}

      {/* ── Sheets ────────────────────────────────────────────────────── */}
      <CreatorPreviewOverlay
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        onPublish={() => {
          setShowPreview(false);
          setShowPublish(true);
        }}
      />
      <CreatorLayersSheet visible={showLayers} onClose={() => setShowLayers(false)} />
      <CreatorPublishSheet visible={showPublish} onClose={() => setShowPublish(false)} />
      <CreatorSettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} />
      <CreatorTemplateBrowser
        visible={showTemplates}
        documentType={document.type}
        hasExistingWork={document.pages.some((p) => p.layers.length > 0)}
        onClose={() => setShowTemplates(false)}
        onApply={(template: CreatorTemplate) => {
          const doc = template.build();
          setDocument(doc);
        }}
      />
      <CreatorAssetPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? 'media'}
        editingLayer={editingLayer}
        onClose={() => { setPickerMode(null); setEditingLayer(null); }}
        onAddLayer={(layer) => {
          if (editingLayer) {
            updateLayer(editingLayer.id, layer, 'Edit layer');
          } else {
            addLayer(layer);
          }
        }}
      />
    </View>
  );
}

// ── Overflow menu item ─────────────────────────────────────────────

interface OverflowItemProps {
  icon: string;
  label: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onPress: () => void;
  disabled?: boolean;
}

function OverflowItem({ icon, label, colors, onPress, disabled }: OverflowItemProps) {
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      style={[styles.overflowItem, disabled ? { opacity: 0.4 } : {}]}
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon as any}
        size={22}
        color={disabled ? colors.textMuted : colors.textPrimary}
      />
      <Text
        style={[
          styles.overflowItemText,
          { color: disabled ? colors.textMuted : colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </PressScale>
  );
}

export function CreatorStudioScreen() {
  const route = useRoute<any>();
  const initialType = route.params?.type === 'poster' ? 'poster' : 'look';
  const draftId = route.params?.draftId as string | undefined;
  const templateId = route.params?.templateId as string | undefined;
  const sourceDocumentId = route.params?.sourceDocumentId as string | undefined;

  return (
    <CreatorProvider initialType={initialType} draftId={draftId} templateId={templateId} sourceDocumentId={sourceDocumentId}>
      <CreatorStudioInner />
    </CreatorProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // ── Full-screen canvas stage ──
  canvasStage: {
    ...StyleSheet.absoluteFill,
  },
  // ── Floating top bar ──
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBarGradient: {
    paddingHorizontal: Space.sm,
    paddingBottom: Space.md,
  },
  // ── Page progress dots (Instagram-style segments) ──
  pageDotsRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Space.xs,
    paddingBottom: Space.sm,
  },
  pageDotSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  pageDotFill: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  // ── Top bar row ──
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: '#fff',
  },
  doneText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: '#fff',
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: 'rgba(255,255,255,0.8)',
  },
  nextBtn: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  nextBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: '#000',
  },
  // ── Add page floating button ──
  addPageFloat: {
    position: 'absolute',
    right: Space.sm,
    zIndex: 90,
  },
  addPageFloatGradient: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Floating bottom rail ──
  bottomRailContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomRailGradient: {
    paddingTop: Space.md,
  },
  // ── Overflow menu ──
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
  },
  overflowMenu: {
    position: 'absolute',
    right: Space.sm,
    minWidth: 220,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 48,
  },
  overflowItemText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.bodyEmphasis.size,
  },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs,
  },
});
