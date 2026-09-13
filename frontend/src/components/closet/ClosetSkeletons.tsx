import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius, AspectRatio } from '../../theme/designTokens';

// ── Mosaic skeleton geometry — matches ClosetMediaMosaic tile dimensions so
//    the loading skeleton preserves the final 3:4 portrait silhouette and
//    avoids layout shift when media decodes (AGENTS.md §14, §16). ──
const SKEL_COLUMNS = 3;
const SKEL_GAP = Space.sm;
const SKEL_PADDING = Space.md;

// ── Board card skeleton geometry — matches ClosetBoardCard 2-column grid ──
const BOARD_COLS = 2;
const BOARD_GAP = Space.sm;

/** 3-column media mosaic loading skeleton (Saved / Wishlist tabs). */
export function ClosetMosaicSkeleton() {
  const { width: SCREEN_W } = useWindowDimensions();
  const tileW =
    (SCREEN_W - SKEL_PADDING * 2 - SKEL_GAP * (SKEL_COLUMNS - 1)) / SKEL_COLUMNS;
  const tileH = tileW / AspectRatio.portrait;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <SkeletonLoader width={tileW} height={tileH} borderRadius={Radius.lg} />
        <SkeletonLoader width={tileW} height={tileH} borderRadius={Radius.lg} />
        <SkeletonLoader width={tileW} height={tileH} borderRadius={Radius.lg} />
      </View>
      <View style={styles.row}>
        <SkeletonLoader width={tileW} height={tileH} borderRadius={Radius.lg} />
        <SkeletonLoader width={tileW} height={tileH} borderRadius={Radius.lg} />
        <SkeletonLoader width={tileW} height={tileH} borderRadius={Radius.lg} />
      </View>
    </View>
  );
}

/** 2-column board card loading skeleton (Collections tab). */
export function ClosetBoardSkeleton() {
  const { width: SCREEN_W } = useWindowDimensions();
  const cardW = (SCREEN_W - Space.md * 2 - BOARD_GAP) / BOARD_COLS;
  const cardH = cardW / AspectRatio.portrait + 8;
  return (
    <View style={styles.boardWrap}>
      <View style={styles.row}>
        <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.lg} />
        <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.lg} />
      </View>
      <View style={styles.row}>
        <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.lg} />
        <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.lg} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SKEL_PADDING,
    gap: SKEL_GAP,
    marginTop: Space.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between' },
  boardWrap: {
    paddingHorizontal: Space.md,
    gap: BOARD_GAP,
    marginTop: Space.sm } });
