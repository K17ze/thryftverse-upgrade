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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { PressScale } from './CreatorAnimations';
import type { CreatorTemplate } from './templates';

const { width: SCREEN_W } = Dimensions.get('window');

function CreatorStudioInner() {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const { document, activePageIndex, setActivePageIndex, selectedLayerId, selectLayer, canUndo, canRedo, undo, redo, isDirty, removeLayer, duplicateLayer, reorderLayer, updateLayer, addLayer, addPage, removePage, duplicatePage, commitLayerTransform, autosaveStatus, isLoadingDraft, setDocument, saveDraft } = useCreator();

  const [showLayers, setShowLayers] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const page = document.pages[activePageIndex];
  const isLook = document.type === 'look';

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Canvas dimensions — computed once, stable layout. The canvas area
  // is fixed (non-scrolling) so the editing surface never shifts under
  // the user's finger when the keyboard opens or sheets appear.
  const canvasWidth = useMemo(() => {
    const maxW = screenWidth - 32;
    // Reserve space for top bar (~56), page strip (~80 for poster), bottom dock (~64)
    const reservedH = isLook ? 56 + 64 + 16 : 56 + 80 + 64 + 16;
    const maxH = screenHeight - reservedH;
    const ratio = document.canvas.aspectRatio;
    if (maxW / ratio <= maxH) {
      return Math.floor(maxW);
    }
    return Math.floor(maxH * ratio);
  }, [screenWidth, screenHeight, document.canvas.aspectRatio, isLook]);

  const canvasHeight = useMemo(() => {
    return Math.floor(canvasWidth / document.canvas.aspectRatio);
  }, [canvasWidth, document.canvas.aspectRatio]);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Simplified top bar: Back · Status · Next ─────────────────── */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <PressScale
          onPress={handleBack}
          style={styles.topBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </PressScale>

        {/* Compact centre: type label + dirty indicator / status */}
        <View style={styles.topCenter}>
          <Text style={[styles.titleText, { color: colors.textPrimary }]} numberOfLines={1}>
            {isLook ? 'Look' : 'Poster'}
          </Text>
          {draftStatusLabel ? (
            <Text style={[styles.statusText, { color: autosaveStatus === 'failed' ? colors.danger : colors.textMuted }]} numberOfLines={1}>
              {draftStatusLabel}
            </Text>
          ) : isDirty ? (
            <View style={[styles.dirtyDot, { backgroundColor: colors.brand }]} />
          ) : null}
        </View>

        {/* Right: Preview + Next */}
        <View style={styles.topRight}>
          <PressScale
            onPress={() => setShowPreview(true)}
            style={styles.topBtn}
            accessibilityLabel="Preview"
          >
            <Ionicons name="eye-outline" size={24} color={colors.textPrimary} />
          </PressScale>
          <PressScale
            onPress={() => setShowPublish(true)}
            style={[styles.nextBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Next"
            scale={0.97}
          >
            <Text style={[styles.nextBtnText, { color: colors.textInverse }]}>Next</Text>
          </PressScale>
        </View>
      </View>

      {/* Page strip (poster only) — compact, below top bar */}
      {document.type === 'poster' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.pageStrip, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.pageStripContent}
        >
          {document.pages.map((p, i) => {
            const thumbW = 44;
            const thumbH = Math.floor(thumbW / document.canvas.aspectRatio);
            return (
              <PressScale
                key={p.id}
                onPress={() => {
                  selectLayer(null);
                  setActivePageIndex(i);
                }}
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
                style={[
                  styles.pageThumb,
                  { height: thumbH, backgroundColor: colors.surfaceAlt },
                  i === activePageIndex
                    ? { borderColor: colors.brand, borderWidth: 2 }
                    : { borderColor: colors.borderSubtle, borderWidth: 1 },
                ]}
                accessibilityLabel={`Page ${i + 1}`}
              >
                <CreatorCanvas
                  document={document}
                  page={p}
                  canvasWidth={thumbW}
                  canvasHeight={thumbH}
                  mode="view"
                />
              </PressScale>
            );
          })}
          {document.pages.length < 10 && (
            <PressScale
              onPress={() => {
                selectLayer(null);
                addPage();
              }}
              style={[styles.addPageBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceAlt }]}
              accessibilityLabel="Add page"
            >
              <Ionicons name="add" size={20} color={colors.textMuted} />
            </PressScale>
          )}
        </ScrollView>
      )}

      {/* ── Fixed canvas stage (non-scrolling) ────────────────────────── */}
      <View style={[styles.canvasArea, { backgroundColor: colors.background }]}>
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

      {/* ── Contextual bottom rail ────────────────────────────────────── */}
      {/* Replaces both the rainbow tool dock and the separate selection
          toolbar. The rail adapts to selection state: when nothing is
          selected it shows add-tools; when a layer is selected it shows
          edit/reorder/copy/delete. Overflow menu holds undo/redo/layers/
          templates/drafts/settings. */}
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
      />

      {/* ── Overflow menu (undo/redo/layers/templates/drafts/settings) ── */}
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
    </SafeAreaView>
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
  },
  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
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
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  dirtyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  nextBtn: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: Radius.sm,
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
  },
  // ── Page strip ──
  pageStrip: {
    maxHeight: 80,
  },
  pageStripContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'center',
    paddingVertical: Space.sm,
  },
  pageThumb: {
    width: 44,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  addPageBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Canvas ──
  canvasArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: Space.sm,
  },
  // ── Overflow menu ──
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  overflowMenu: {
    position: 'absolute',
    bottom: 72,
    right: Space.sm,
    minWidth: 220,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
    // Shadow — deeper elevation for floating menu
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
