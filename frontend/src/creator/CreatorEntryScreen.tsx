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
import { useAppTheme } from '../theme/ThemeContext';
import type { CreatorInitialMedia } from '../navigation/types';
import CreatorCamera from './CreatorCamera';
import { PressScale, SheetContainer } from './CreatorAnimations';
import { MediaBrowserSheet, type SelectedAsset } from './tools/MediaBrowser';
import { CreatorDraftService, type DraftMeta } from './drafts';
import { useHaptic } from '../hooks/useHaptic';

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
}

export function CreatorEntryScreen({
  documentType,
  onClose,
  onMediaSelected,
  onBlankStart,
  onOpenDraft,
}: CreatorEntryScreenProps) {
  const insets = useSafeAreaInsets();
  const isPoster = documentType === 'poster';
  const haptic = useHaptic();
  const { colors } = useAppTheme();

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
        mode={documentType}
        onCapture={handleCapture}
        onCaptureBatch={handleCaptureBatch}
        onGallery={() => { haptic.selection(); setShowPhotos(true); }}
        onClose={onClose}
      />

      {/* "Aa" text-mode button — Instagram "Create" pattern, top-right.
          Stays as a small top-right button on the camera. */}
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

      {/* Drafts button — small affordance in the camera top bar, next to
          close (top-left). Only shown when draft resumption is supported
          and drafts exist. Not a prominent section. */}
      {hasDrafts && (
        <Pressable
          style={[styles.draftsBtn, { top: insets.top + 8, left: 60 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => { haptic.light(); setShowDrafts(true); }}
          accessibilityLabel="Open drafts"
          accessibilityHint="Shows your saved creator drafts"
          accessibilityRole="button"
        >
          <Ionicons name="documents-outline" size={22} color="#fff" />
        </Pressable>
      )}

      {/* ── Photos: MediaBrowserSheet (gallery) ──
          Accessible from the camera's gallery button. Confirms selection
          → onMediaSelected directly (no intermediate action page). */}
      <MediaBrowserSheet
        visible={showPhotos}
        onClose={() => setShowPhotos(false)}
        onConfirm={handlePhotosConfirm}
        maxSelections={isPoster ? 10 : 6}
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
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.draftsList}
          contentContainerStyle={{ paddingBottom: insets.bottom + Space.lg }}
          showsVerticalScrollIndicator={false}
        >
          {drafts.length === 0 ? (
            <Text style={styles.draftsEmpty}>No drafts yet.</Text>
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
    backgroundColor: '#000',
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

  // Drafts button — small affordance in the camera top bar
  draftsBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },

  // Drafts sheet
  draftsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  draftsSheetTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
  },
  draftsCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftsList: {
    flex: 1,
  },
  draftsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
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
  draftsEmpty: {
    textAlign: 'center',
    paddingTop: Space.xl,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.5)',
  },
});
