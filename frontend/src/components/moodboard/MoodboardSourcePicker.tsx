/**
 * MoodboardSourcePicker — bottom-panel source surface for the moodboard
 * editor.
 *
 * Three sources share one rail surface behind a minimal segmented control
 * (text labels + a selection underline — not pills):
 *   Listings — marketplace picker items (existing PickerTile)
 *   Looks    — the user's published looks: real covers, a small play glyph
 *              on video, tile width derived from the look's own aspect
 *   Photos   — a single honest "Import" tile that mounts MediaBrowserSheet
 *              (allowVideos, maxSelections 10, camera tile); confirmed
 *              assets enter the import job tray above the tabs
 *
 * Data ownership stays where it already lives: listing items arrive via
 * props from the screen's board hook; looks are fetched lazily on first
 * visit to the tab (never eagerly); photo imports run through
 * useMoodboardImport, which the screen composes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import type { ImageContentFit } from 'expo-image';

import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Stroke,
  GlyphShadow } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { HorizontalRail } from '../HorizontalRail';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { PremiumSkeletonTile } from '../discover/PremiumSkeletonTile';
import { useHaptic } from '../../hooks/useHaptic';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useStore } from '../../store/useStore';
import {
  fetchLooksFromApi,
  type LookApiItem } from '../../services/looksApi';
import {
  addItemToMoodboard,
  type MoodboardItem } from '../../services/moodboardApi';
import {
  MediaBrowserSheet } from '../../creator/tools/MediaBrowser';
import {
  PickerTile,
  PICKER_TILE_SIZE,
  PICKER_TILE_GAP } from './MoodboardPickerTile';
import { MoodboardImportTray } from './MoodboardImportTray';
import type { MoodboardImportController } from './useMoodboardImport';

// ── Tabs ──
type SourceTab = 'listings' | 'looks' | 'photos';
const SOURCE_TABS: ReadonlyArray<{ key: SourceTab; label: string }> = [
  { key: 'listings', label: 'Listings' },
  { key: 'looks', label: 'Looks' },
  { key: 'photos', label: 'Photos' },
];

// ── Look tile geometry ──
const LOOK_TILE_HEIGHT = 88;
const LOOK_TILE_MIN_W = 56;
const LOOK_TILE_MAX_W = 150;
const LOOKS_PAGE_SIZE = 30;
const PHOTOS_MAX_SELECTIONS = 10;
const COVER_FIT: ImageContentFit = 'cover';
const SPINNER_SIZE = 'small' as const;
const POINTER_NONE = 'none' as const;

/** Terse copy — kept out of JSX so literals stay extractable in one place. */
const COPY = {
  importLabel: 'Import',
  listingsEmpty: 'No items available to add',
  looksEmpty: 'No published looks',
  looksError: 'Couldn’t load your looks',
  looksAddError: 'Couldn’t add this look',
  retry: 'Retry',
  offlineNote: 'Offline — uploads start when you reconnect',
} as const;

// ---------------------------------------------------------------------------
// useMyLooks — published looks for the current user, fetched once per
// creator id on first visit to the Looks tab.
// ---------------------------------------------------------------------------
type MyLooksState =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: LookApiItem[] };

function useMyLooks(enabled: boolean) {
  const creatorId = useStore((state) => state.currentUser?.id ?? '');
  const [state, setState] = useState<MyLooksState>({ status: 'idle' });
  // The creator id the last fetch was issued for — a later sign-in re-fetches.
  const fetchedForRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!creatorId) {
      // No signed-in user — nothing to fetch; the empty state is honest.
      setState({ status: 'ready', items: [] });
      return;
    }
    setState({ status: 'loading' });
    try {
      const response = await fetchLooksFromApi({
        creatorId,
        status: 'published',
        limit: LOOKS_PAGE_SIZE,
      });
      setState({ status: 'ready', items: response.items });
    } catch {
      setState({ status: 'error' });
    }
  }, [creatorId]);

  useEffect(() => {
    if (!enabled || fetchedForRef.current === creatorId) return;
    fetchedForRef.current = creatorId;
    void load();
  }, [enabled, creatorId, load]);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  return { state, retry };
}

function lookCoverUri(look: LookApiItem): string {
  // Video looks serve m3u8 in mediaUrl — the JPEG poster is the cover.
  return look.posterUrl ?? look.mediaUrl;
}

function lookAspect(look: LookApiItem): number {
  if (look.coverAspectRatio != null && look.coverAspectRatio > 0) {
    return look.coverAspectRatio;
  }
  if (look.mediaWidth != null && look.mediaHeight != null && look.mediaHeight > 0) {
    return look.mediaWidth / look.mediaHeight;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Panes
// ---------------------------------------------------------------------------
function ListingsPane({
  items,
  onAddListing,
}: {
  items: MoodboardItem[];
  onAddListing: (item: MoodboardItem) => void;
}) {
  const { colors } = useAppTheme();
  if (items.length === 0) {
    return (
      <View style={styles.paneEmpty}>
        <Text style={[styles.paneEmptyText, { color: colors.textMuted }]}>
          {COPY.listingsEmpty}
        </Text>
      </View>
    );
  }
  return (
    <HorizontalRail
      contentContainerStyle={styles.railContent}
      showsHorizontalScrollIndicator={false}
    >
      {items.map((item) => (
        <PickerTile key={item.id} item={item} onPress={() => onAddListing(item)} />
      ))}
    </HorizontalRail>
  );
}

function LookTile({
  look,
  pending,
  onPress,
}: {
  look: LookApiItem;
  pending: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const width = Math.round(
    Math.min(LOOK_TILE_MAX_W, Math.max(LOOK_TILE_MIN_W, LOOK_TILE_HEIGHT * lookAspect(look))),
  );
  return (
    <AnimatedPressable
      style={styles.lookTile}
      onPress={onPress}
      disabled={pending}
      activeOpacity={0.85}
      scaleValue={0.96}
      accessibilityRole="button"
      accessibilityLabel={`Add look ${look.title || 'media'} to moodboard`}
      accessibilityHint="Adds this look to the center of the canvas"
    >
      <CachedImage
        uri={lookCoverUri(look)}
        style={[styles.lookCover, { width, height: LOOK_TILE_HEIGHT }]}
        contentFit={COVER_FIT}
        accessible={false}
      />
      {look.mediaType === 'video' && (
        <View style={styles.playGlyph} pointerEvents={POINTER_NONE}>
          <AppIcon
            name="play"
            size={IconSize.sm}
            color={colors.scrimTextPrimary}
            glyphStyle={GlyphShadow.glyph}
            accessible={false}
          />
        </View>
      )}
      {pending && (
        <View
          style={[styles.lookPending, { backgroundColor: colors.mediaOverlayScrim }]}
          pointerEvents={POINTER_NONE}
        >
          <ActivityIndicator size={SPINNER_SIZE} color={colors.scrimTextPrimary} />
        </View>
      )}
    </AnimatedPressable>
  );
}

function LooksPane({
  state,
  pendingLookId,
  onSelectLook,
  onRetry,
  notice,
}: {
  state: MyLooksState;
  pendingLookId: string | null;
  onSelectLook: (lookId: string) => void;
  onRetry: () => void;
  notice: string | null;
}) {
  const { colors } = useAppTheme();
  if (state.status === 'error') {
    return (
      <View style={styles.paneEmpty}>
        <Text style={[styles.paneEmptyText, { color: colors.textMuted }]}>
          {COPY.looksError}
        </Text>
        <AnimatedPressable
          onPress={onRetry}
          activeOpacity={0.7}
          scaleValue={0.97}
          accessibilityRole="button"
          accessibilityLabel="Retry loading looks"
          accessibilityHint="Fetches your published looks again"
        >
          <Text style={[styles.retryText, { color: colors.textPrimary }]}>
            {COPY.retry}
          </Text>
        </AnimatedPressable>
      </View>
    );
  }
  if (state.status !== 'ready') {
    return (
      <View style={styles.skeletonRail}>
        {Array.from({ length: 4 }).map((_, index) => (
          <PremiumSkeletonTile
            key={index}
            width={PICKER_TILE_SIZE}
            height={LOOK_TILE_HEIGHT}
            borderRadius={Radius.md}
          />
        ))}
      </View>
    );
  }
  if (state.items.length === 0) {
    return (
      <View style={styles.paneEmpty}>
        <Text style={[styles.paneEmptyText, { color: colors.textMuted }]}>
          {COPY.looksEmpty}
        </Text>
      </View>
    );
  }
  return (
    <View>
      <HorizontalRail
        contentContainerStyle={styles.railContent}
        showsHorizontalScrollIndicator={false}
      >
        {state.items.map((look) => (
          <LookTile
            key={look.id}
            look={look}
            pending={pendingLookId === look.id}
            onPress={() => onSelectLook(look.id)}
          />
        ))}
      </HorizontalRail>
      {notice && (
        <Text style={[styles.noticeText, { color: colors.danger }]}>{notice}</Text>
      )}
    </View>
  );
}

function PhotosPane({
  isOffline,
  onOpenBrowser,
}: {
  isOffline: boolean;
  onOpenBrowser: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.photosPane}>
      <AnimatedPressable
        style={styles.importTile}
        onPress={onOpenBrowser}
        activeOpacity={0.85}
        scaleValue={0.96}
        accessibilityRole="button"
        accessibilityLabel="Import photos or videos"
        accessibilityHint="Opens your photo library to add media to the canvas"
      >
        <View
          style={[
            styles.importTileInner,
            { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
          ]}
        >
          <AppIcon
            name="images-outline"
            size={IconSize.lg}
            color={colors.textPrimary}
            accessible={false}
          />
        </View>
        <Text style={[styles.importLabel, { color: colors.textPrimary }]}>
          {COPY.importLabel}
        </Text>
      </AnimatedPressable>
      {isOffline && (
        <Text style={[styles.offlineNote, { color: colors.textMuted }]}>
          {COPY.offlineNote}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface MoodboardSourcePickerProps {
  moodboardId: string;
  pickerItems: MoodboardItem[];
  onAddListing: (item: MoodboardItem) => void;
  /**
   * Optional override for the look-add mutation (e.g. screen-level
   * telemetry). When omitted, the picker adds the look itself via
   * addItemToMoodboard({ source: 'look' }).
   */
  onAddLook?: (lookId: string) => void | Promise<void>;
  importHook: MoodboardImportController;
  /** Board refresh callback — fired after an item lands on the board. */
  onItemAdded: () => void | Promise<void>;
}

export function MoodboardSourcePicker({
  moodboardId,
  pickerItems,
  onAddListing,
  onAddLook,
  importHook,
  onItemAdded,
}: MoodboardSourcePickerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const [tab, setTab] = useState<SourceTab>('listings');
  const [browserVisible, setBrowserVisible] = useState(false);
  const [pendingLookId, setPendingLookId] = useState<string | null>(null);
  const [looksNotice, setLooksNotice] = useState<string | null>(null);
  const { state: looksState, retry: retryLooks } = useMyLooks(tab === 'looks');

  const handleSelectTab = useCallback(
    (next: SourceTab) => {
      if (next === tab) return;
      haptic.selection();
      setTab(next);
    },
    [tab, haptic],
  );

  const handleSelectLook = useCallback(
    async (lookId: string) => {
      if (pendingLookId) return;
      haptic.selection();
      setPendingLookId(lookId);
      setLooksNotice(null);
      try {
        if (onAddLook) {
          await onAddLook(lookId);
        } else {
          await addItemToMoodboard(moodboardId, { source: 'look', lookId });
        }
        await onItemAdded();
      } catch {
        haptic.error();
        setLooksNotice(COPY.looksAddError);
      } finally {
        setPendingLookId(null);
      }
    },
    [pendingLookId, haptic, onAddLook, moodboardId, onItemAdded],
  );

  return (
    <View style={styles.picker}>
      {/* Import job tray — visible only while upload jobs exist */}
      <MoodboardImportTray
        jobs={importHook.jobs}
        isOffline={isOffline}
        onRetry={importHook.retry}
        onDismiss={importHook.dismiss}
      />

      {/* Source tabs — text labels + selection underline */}
      <View style={[styles.tabBar, { borderBottomColor: colors.borderSubtle }]}>
        {SOURCE_TABS.map((sourceTab) => {
          const active = tab === sourceTab.key;
          return (
            <AnimatedPressable
              key={sourceTab.key}
              style={styles.tabButton}
              onPress={() => handleSelectTab(sourceTab.key)}
              activeOpacity={0.7}
              scaleValue={0.97}
              accessibilityRole="tab"
              accessibilityLabel={sourceTab.label}
              accessibilityHint={`Shows ${sourceTab.label.toLowerCase()} you can add to the canvas`}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.textPrimary : colors.textMuted },
                ]}
              >
                {sourceTab.label}
              </Text>
              <View
                style={[
                  styles.tabIndicator,
                  { backgroundColor: active ? colors.textPrimary : 'transparent' },
                ]}
              />
            </AnimatedPressable>
          );
        })}
      </View>

      {/* Active source pane */}
      {tab === 'listings' && (
        <ListingsPane items={pickerItems} onAddListing={onAddListing} />
      )}
      {tab === 'looks' && (
        <LooksPane
          state={looksState}
          pendingLookId={pendingLookId}
          onSelectLook={(lookId) => void handleSelectLook(lookId)}
          onRetry={retryLooks}
          notice={looksNotice}
        />
      )}
      {tab === 'photos' && (
        <PhotosPane isOffline={isOffline} onOpenBrowser={() => setBrowserVisible(true)} />
      )}

      {/* Camera-roll browser — real gallery, real assets only */}
      <MediaBrowserSheet
        visible={browserVisible}
        onClose={() => setBrowserVisible(false)}
        onConfirm={(assets) => importHook.enqueue(assets)}
        maxSelections={PHOTOS_MAX_SELECTIONS}
        showCameraTile
        allowVideos
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Static styles — theme colors are applied inline at the call site
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  picker: {
    gap: Space.xs },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.lg,
    paddingHorizontal: Space.md,
    borderBottomWidth: Stroke.hairline },
  tabButton: {
    alignItems: 'center',
    paddingTop: Space.xs },
  tabLabel: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    paddingBottom: Space.sm },
  tabIndicator: {
    height: Stroke.emphasis,
    alignSelf: 'stretch' },
  railContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.sm,
    gap: PICKER_TILE_GAP },
  skeletonRail: {
    flexDirection: 'row',
    gap: PICKER_TILE_GAP,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.sm },
  paneEmpty: {
    minHeight: LOOK_TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  paneEmptyText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: TypographyV2.caption.fontFamily },
  retryText: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: TypographyV2.captionElevated.fontFamily },
  noticeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs },
  lookTile: {
    position: 'relative' },
  lookCover: {
    borderRadius: Radius.md },
  playGlyph: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  lookPending: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  photosPane: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.sm },
  importTile: {
    alignItems: 'flex-start',
    gap: Space.xs / 2 },
  importTileInner: {
    width: PICKER_TILE_SIZE,
    height: PICKER_TILE_SIZE,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  importLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  offlineNote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    flexShrink: 1 } });
