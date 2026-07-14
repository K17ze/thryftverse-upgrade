import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { PressScale } from './CreatorAnimations';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface CreatorPreviewOverlayProps {
  visible: boolean;
  onClose: () => void;
  onPublish: () => void;
}

/**
 * Full-screen, chrome-free preview that renders the composition exactly
 * as the viewer will see it. Uses CreatorCanvas in "view" mode — the same
 * renderer used by LookDetailScreen and PosterViewerScreen — so what the
 * user sees here is what gets published.
 *
 * For Poster (multi-page), the user can swipe/cycle through pages.
 * For Look (single-page), the composition fills the screen.
 */
export function CreatorPreviewOverlay({ visible, onClose, onPublish }: CreatorPreviewOverlayProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const [pageIndex, setPageIndex] = useState(0);

  const page = document.pages[pageIndex];
  const pageCount = document.pages.length;
  const isPoster = document.type === 'poster';

  const goNextPage = useCallback(() => {
    setPageIndex((i) => (i < pageCount - 1 ? i + 1 : 0));
  }, [pageCount]);

  const goPrevPage = useCallback(() => {
    setPageIndex((i) => (i > 0 ? i - 1 : pageCount - 1));
  }, [pageCount]);

  if (!visible || !page) return null;

  // Compute canvas dimensions to fill the screen while preserving aspect ratio
  const ratio = document.canvas.aspectRatio;
  let canvasW = SCREEN_W;
  let canvasH = Math.floor(SCREEN_W / ratio);
  if (canvasH > SCREEN_H) {
    canvasH = SCREEN_H;
    canvasW = Math.floor(SCREEN_H * ratio);
  }

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      <StatusBar barStyle="light-content" />

      {/* Full-screen canonical composition render */}
      <View style={styles.canvasWrap}>
        <CreatorCanvas
          document={document}
          page={page}
          canvasWidth={canvasW}
          canvasHeight={canvasH}
          mode="view"
        />
      </View>

      {/* Top bar — minimal, transparent over media */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <PressScale
          onPress={onClose}
          style={styles.topBtn}
          accessibilityLabel="Close preview"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </PressScale>

        <View style={styles.topCenter}>
          <Text style={styles.topLabel}>Preview</Text>
          {pageCount > 1 && (
            <Text style={styles.pageIndicator}>
              {pageIndex + 1} / {pageCount}
            </Text>
          )}
        </View>

        <PressScale
          onPress={onPublish}
          style={styles.publishBtn}
          accessibilityLabel="Publish"
          scale={0.97}
        >
          <Text style={styles.publishBtnText}>Publish</Text>
        </PressScale>
      </SafeAreaView>

      {/* Page navigation for multi-page posters */}
      {isPoster && pageCount > 1 && (
        <View style={styles.pageNavRow}>
          <PressScale
            onPress={goPrevPage}
            style={styles.pageNavBtn}
            accessibilityLabel="Previous page"
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </PressScale>
          <View style={styles.pageDots}>
            {document.pages.map((p, i) => (
              <View
                key={p.id}
                style={[styles.pageDot, i === pageIndex && styles.pageDotActive]}
              />
            ))}
          </View>
          <PressScale
            onPress={goNextPage}
            style={styles.pageNavBtn}
            accessibilityLabel="Next page"
          >
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </PressScale>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    zIndex: 9999,
  },
  canvasWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  topLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: '#fff',
  },
  pageIndicator: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: 'rgba(255,255,255,0.7)',
  },
  publishBtn: {
    paddingHorizontal: Space.md + 4,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: '#000',
  },
  pageNavRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  pageNavBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pageDots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  pageDotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
