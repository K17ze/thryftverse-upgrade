import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography, Radius, Space, EditorMaterial, Stroke} from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { IconGrammar } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { BlurView } from 'expo-blur';
import type { CreatorInitialMedia } from '../navigation/types';
import CreatorCamera from './CreatorCamera';
import type { CaptureViewport } from './capture/CaptureViewport';
import { PressScale, SheetContainer } from './CreatorAnimations';
import { MediaBrowserSheet, type SelectedAsset } from './tools/MediaBrowser';
import { CreatorDraftService, type DraftMeta } from './drafts';
import { useHaptic } from '../hooks/useHaptic';
import { CreatorModeSwitch, type CreatorCaptureMode } from './capture/CreatorModeSwitch';

// ── Relative time formatter for draft "Last edited" timestamps ────────
// Compact, human wording. Falls back to a localized date for old entries.
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Creator Entry Screen (camera-root) ────────────────────────────────
// Per the human-flow reconstruction spec: "Creation is a continuous state,
// not a wizard." The camera is the ROOT creator state — the first and only
// thing the user sees when opening the creator. There is no dashboard, no
// 2×2 tile grid, no intent classification.
//
// From the camera the user can:
//   - capture (photo / video) → enters the editor directly
//   - open the gallery (MediaBrowserSheet) → selects media → editor
//   - switch capture mode (Look / Poster / Search) via the in-camera mode
//     switch — no route transition, just a reframing
//   - open Drafts (small affordance in the camera top bar)
//   - start a blank text poster ("Aa" button, top-right)
//
// Items (ProductBrowserSheet) and Templates (CreatorTemplateBrowser) are
// accessible from inside the editor, NOT from the entry screen.

export type CreatorCameraMode = 'look' | 'poster' | 'visual-search';

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
  /** Switches the canonical composer before any media is committed. */
  onDocumentTypeChange: (type: 'look' | 'poster') => void;
  onBlankStart: () => void;
  /**
   * Optional: apply a template selected from inside the editor. Kept on the
   * props for contract parity but the entry screen no longer hosts the
   * template browser — it lives in the composer chrome.
   */
  onApplyTemplate?: (template: import('./templates').CreatorTemplate) => void;
  /**
   * Optional: resume a draft from the Drafts affordance in the camera top
   * bar. When not provided, the Drafts button is hidden (truthful UI — no
   * tappable control without a handler).
   */
  onOpenDraft?: (draftId: string) => void;
  /**
   * Optional: invoked when the user captures a photo while the in-camera
   * mode switcher is set to "Search" (visual-search). The caller (composer
   * screen) should navigate to the VisualSearch screen with the captured
   * URI. When not provided, the "Search" mode is still selectable but the
   * capture falls back to onMediaSelected.
   */
  onVisualSearchCapture?: (uri: string) => void;
  /**
   * Optional: receives the measured camera viewport so the parent can
   * build the camera→editor transition snapshot with the source content
   * transform (the guide frame rect in screen coordinates).
   */
  onViewportChange?: (viewport: CaptureViewport | null) => void;
}

export function CreatorEntryScreen({
  documentType,
  onClose,
  onMediaSelected,
  onDocumentTypeChange,
  onBlankStart,
  onOpenDraft,
  onVisualSearchCapture,
  onViewportChange }: CreatorEntryScreenProps) {
  const insets = useSafeAreaInsets();
  const isPoster = documentType === 'poster';
  const haptic = useHaptic();
  const { colors } = useAppTheme();

  // ── In-camera mode switcher (Look / Poster / Search) ──
  // The camera is the root creator state; the mode switcher lets the user
  // reframe the capture intent without leaving the viewfinder. Initialized
  // from the documentType prop so the default mode matches the entry intent.
  const [mode, setMode] = useState<CreatorCameraMode>(documentType);

  const handleModeChange = useCallback((nextMode: CreatorCaptureMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'visual-search') {
      setMode(nextMode);
      return;
    }
    if (nextMode !== documentType) {
      // Look and Poster are separate canonical composers. Switch the owner
      // before capture so the selected mode can never publish into the wrong
      // document contract.
      onDocumentTypeChange(nextMode);
      return;
    }
    setMode(nextMode);
  }, [documentType, mode, onDocumentTypeChange]);

  // ── Sheet visibility ──
  const [showPhotos, setShowPhotos] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);

  // ── Drafts for the Drafts affordance ──
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load drafts (only if resumable). Filtered to the current document type
  // so the Drafts list is contextually relevant.
  useEffect(() => {
    if (!onOpenDraft) return;
    let cancelled = false;
    CreatorDraftService.listDrafts().then((all) => {
      if (cancelled || !mountedRef.current) return;
      const filtered = all.filter((d) => d.type === documentType);
      setDrafts(filtered);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [documentType, onOpenDraft]);

  // ── Camera capture → typed media payload → enter editor ──
  // Legacy single-URI path (visual search, backward-compatible callers).
  // For poster/look modes, the camera sends a typed batch via
  // onCaptureBatch instead, preserving the correct kind (image/video).
  // When the in-camera mode switcher is set to "Search" (visual-search),
  // the capture is routed to onVisualSearchCapture so the caller can
  // navigate to the VisualSearch screen instead of entering the editor.
  const handleCapture = useCallback((uri: string) => {
    if (mode === 'visual-search') {
      haptic.light();
      onVisualSearchCapture?.(uri);
      return;
    }
    RNImage.getSize(uri, (imgW: number, imgH: number) => {
      const media: CreatorInitialMedia = {
        id: `capture_${Date.now()}`,
        uri,
        kind: 'image',
        width: imgW,
        height: imgH };
      onMediaSelected([media]);
    }, () => {
      const media: CreatorInitialMedia = {
        id: `capture_${Date.now()}`,
        uri,
        kind: 'image' };
      onMediaSelected([media]);
    });
  }, [mode, onMediaSelected, onVisualSearchCapture, haptic]);

  // ── Camera batch capture → typed media payload → enter editor ──
  // Direct capture → editor: a single capture is sent as a single-element
  // array. No review page, no intermediate action page.
  const handleCaptureBatch = useCallback((captures: CreatorInitialMedia[]) => {
    if (captures.length === 0) return;
    onMediaSelected(captures);
  }, [onMediaSelected]);

  // ── Photos: MediaBrowserSheet confirm → typed media payload ──
  // Direct gallery → editor: the selected assets are converted to
  // CreatorInitialMedia[] and handed to onMediaSelected. No intermediate
  // action page.
  const handlePhotosConfirm = useCallback((assets: SelectedAsset[]) => {
    setShowPhotos(false);
    if (assets.length === 0) return;
    if (mode === 'visual-search') {
      haptic.light();
      onVisualSearchCapture?.(assets[0].uri);
      return;
    }
    const media: CreatorInitialMedia[] = assets.map((a, i) => ({
      id: `entry_${i}_${a.uri}`,
      uri: a.uri,
      kind: a.mediaType,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs }));
    haptic.light();
    onMediaSelected(media);
  }, [mode, onMediaSelected, onVisualSearchCapture, haptic]);

  // ── Drafts: open a draft in the composer ──
  const handleOpenDraft = useCallback((draftId: string) => {
    setShowDrafts(false);
    haptic.selection();
    onOpenDraft?.(draftId);
  }, [onOpenDraft, haptic]);

  const hasDrafts = onOpenDraft && drafts.length > 0;

  return (
    <View style={styles.container}>
      {/* ═══════════════════════════════════════════════════════════════
          CAMERA — the root creator state. Full-screen viewfinder.
          The user lands here immediately — no dashboard, no tiles. ═════ */}
      <CreatorCamera
        mode={mode}
        onCapture={handleCapture}
        onCaptureBatch={handleCaptureBatch}
        onViewportChange={onViewportChange}
        onGallery={() => { haptic.selection(); setShowPhotos(true); }}
        onClose={onClose}
        renderBottomOverlay={() => (
          <View
            pointerEvents="box-none"
            style={[styles.modeSwitcherContainer, { bottom: insets.bottom + 100 }]}
          >
            <CreatorModeSwitch mode={mode} onModeChange={handleModeChange} />
          </View>
        )}
        renderTopRightAccessory={mode === 'poster' ? () => (
          <Pressable
            style={styles.textModeAccessory}
            onPress={() => { haptic.light(); onBlankStart(); }}
            accessibilityLabel="Create text poster"
            accessibilityHint="Starts a blank text poster"
            accessibilityRole="button"
          >
            {/* Glass plate — translucent blur + overlay for on-camera legibility */}
            <BlurView intensity={EditorMaterial.plate.blurIntensity} tint={EditorMaterial.plate.tint} style={[StyleSheet.absoluteFill, { borderRadius: Radius.full }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.plate.overlay, borderRadius: Radius.full }]} />
            <Text style={[styles.textModeBtnLabel, { color: colors.scrimTextPrimary }]}>Aa</Text>
          </Pressable>
        ) : undefined}
      />

      {/* Drafts button — small affordance in the camera top bar, next to
          close (top-left). Only shown when draft resumption is supported
          and drafts exist. Transparent 44pt target (AGENTS.md §4: ordinary
          controls default to transparent) — the top scrim provides legibility
          and the brand-color dot is the status signal. No glass plate. */}
      {hasDrafts && (
        <Pressable
          style={[styles.draftsBtn, { top: insets.top + 8, left: 60 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => { haptic.light(); setShowDrafts(true); }}
          accessibilityLabel="Open drafts"
          accessibilityHint="Shows your saved creator drafts"
          accessibilityRole="button"
        >
          <Ionicons name="documents-outline" size={IconGrammar.standard} color="#fff" />
          {drafts.length > 1 ? (
            <View style={[styles.draftsCountBadge, { backgroundColor: colors.brand }]}>
              <Text style={[styles.draftsCountText, { color: colors.textInverse }]}>{drafts.length}</Text>
            </View>
          ) : (
            <View style={[styles.draftsBadge, { backgroundColor: colors.brand }]} />
          )}
        </Pressable>
      )}

      {/* ── Photos: MediaBrowserSheet (gallery) ──
          Accessible from the camera's gallery button. Confirms selection
          → onMediaSelected directly (no intermediate action page). */}
      <MediaBrowserSheet
        visible={showPhotos}
        onClose={() => setShowPhotos(false)}
        onConfirm={handlePhotosConfirm}
        maxSelections={mode === 'visual-search' ? 1 : isPoster ? 10 : 6}
        title="Select photos"
        showCameraTile={false}
        allowVideos
      />

      {/* ── Drafts sheet — simple list of resumable drafts ── */}
      <SheetContainer
        visible={showDrafts}
        onClose={() => setShowDrafts(false)}
        maxHeight={0.7}
      >
        <View style={styles.draftsSheetHeader}>
          <Text style={styles.draftsSheetTitle}>Drafts</Text>
          <Pressable
            style={styles.draftsCloseBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => setShowDrafts(false)}
            accessibilityLabel="Close drafts"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={IconGrammar.hero} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.draftsList}
          contentContainerStyle={{ paddingBottom: insets.bottom + Space.lg }}
          showsVerticalScrollIndicator={false}
        >
          {drafts.length === 0 ? (
            <Text style={[styles.draftsEmpty, { color: colors.scrimTextSecondary }]}>No drafts yet</Text>
          ) : (
            <View style={styles.draftsGrid}>
              {drafts.map((draft) => (
                <PressScale
                  key={draft.id}
                  style={styles.draftCard}
                  accessibilityLabel={`Resume ${draft.title}`}
                  accessibilityHint="Opens this draft in the composer"
                  onPress={() => handleOpenDraft(draft.id)}
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
                        size={IconGrammar.hero}
                        color="rgba(255,255,255,0.2)"
                      />
                    </View>
                  )}
                  <Text style={[styles.draftTitle, { color: colors.scrimTextPrimary }]} numberOfLines={1}>
                    {draft.title}
                  </Text>
                  {draft.updatedAt ? (
                    <Text style={[styles.draftTimestamp, { color: colors.scrimTextTertiary }]} numberOfLines={1}>
                      {formatRelativeTime(draft.updatedAt)}
                    </Text>
                  ) : null}
                </PressScale>
              ))}
            </View>
          )}
        </ScrollView>
      </SheetContainer>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000' },

  // Camera view — "Aa" text-mode button (Instagram "Create" pattern).
  // Refined chrome: subtle dark fill + hairline white/10 border for
  // definition over bright previews. 44pt hit target, visible glyph only.
  textModeAccessory: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: EditorMaterial.plate.hairline,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' },
  textModeBtnLabel: {
    fontSize: 17,
    fontFamily: Typography.family.semibold },

  // Drafts button — transparent 44pt target (AGENTS.md §4: ordinary controls
  // default to transparent). No fill, no border — the top scrim provides
  // legibility and the brand-color dot is the status signal.
  draftsBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20 },
  // Subtle brand-color dot — signals "there is something to resume".
  draftsBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: 'rgba(0,0,0,0.4)' },
  // Count badge — when there are 2+ drafts, show the number instead of a dot.
  // Uses brand color fill with count text for clearer affordance.
  draftsCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  draftsCountText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold },

  // Drafts sheet
  draftsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.sm },
  draftsSheetTitle: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily },
  draftsCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  draftsList: {
    flex: 1 },
  draftsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    paddingHorizontal: Space.lg },
  draftCard: {
    width: 140,
    gap: Space.xs },
  draftThumb: {
    width: 140,
    height: 175,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.06)' },
  draftThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center' },
  draftTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  draftTimestamp: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  draftsEmpty: {
    textAlign: 'center',
    paddingTop: Space.xl,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },

  // ── In-camera mode switcher (Look / Poster / Search) ──
  // Subtle text-based segmented control rendered into the camera's bottom
  // overlay area, above the shutter. Instagram-style progressive disclosure:
  // the viewfinder is default, modes are a tap away but never dominant.
  // pointerEvents="box-none" so taps pass through to the camera except on
  // the labels themselves.
  modeSwitcherContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center' } });
