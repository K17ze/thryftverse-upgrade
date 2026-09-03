/**
 * MoodboardPosterFrame — renders a moodboard canvas inside the poster viewer.
 *
 * Used when a poster story has `contentType === 'moodboard'`. Instead of a
 * single image/video, the viewer shows the moodboard's items arranged on a
 * themed canvas. Pure render surface — no gestures, no editing.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { CachedImage } from '../CachedImage';
import { fetchMoodboardDetail, getThemeById, type Moodboard } from '../../services/moodboardApi';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface MoodboardPosterFrameProps {
  moodboardId: string;
  /** Full screen dimensions passed by the poster viewer. */
  width: number;
  height: number;
}

/** Base item size in pixels before per-item scale is applied. */
const BASE_ITEM_SIZE = 120;

export function MoodboardPosterFrame({ moodboardId, width, height }: MoodboardPosterFrameProps) {
  const { colors } = useAppTheme();
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrored(false);
    fetchMoodboardDetail(moodboardId)
      .then((board) => {
        if (!mounted) return;
        setMoodboard(board);
      })
      .catch(() => mounted && setErrored(true))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [moodboardId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { width, height, backgroundColor: colors.surface },
        canvas: { position: 'absolute', top: 0, left: 0, width, height },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        errorText: {
          color: colors.textSecondary,
          fontSize: TypographyV2.body.size,
          lineHeight: TypographyV2.body.lineHeight },
        titleOverlay: {
          position: 'absolute',
          top: Space.sm,
          left: Space.sm,
          padding: Space.sm,
          backgroundColor: 'rgba(0,0,0,0.4)',
          borderRadius: Radius.sm },
        titleText: {
          color: '#FFFFFF',
          fontSize: TypographyV2.meta.size,
          lineHeight: TypographyV2.meta.lineHeight,
          fontWeight: TypographyV2.meta.weight as '400' | '500' | '600' | '700',
          letterSpacing: TypographyV2.meta.letterSpacing,
          maxWidth: width - Space.sm * 4 } }),
    [width, height, colors],
  );

  const renderItems = useCallback(() => {
    if (!moodboard) return null;
    return moodboard.items.map((item) => {
      const left = item.position.x * width;
      const top = item.position.y * height;
      const size = BASE_ITEM_SIZE * item.position.scale;
      return (
        <CachedImage
          key={item.id}
          uri={item.imageUri}
          style={{
            position: 'absolute',
            left: left - size / 2,
            top: top - size / 2,
            width: size,
            height: size,
            transform: [{ rotate: `${item.position.rotation}deg` }],
            borderRadius: Radius.md }}
        />
      );
    });
  }, [moodboard, width, height]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (errored || !moodboard) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>Could not load moodboard</Text>
      </View>
    );
  }

  const theme = getThemeById(moodboard.theme);

  return (
    <View style={styles.root}>
      <View style={[styles.canvas, { backgroundColor: theme.backgroundColor }]}>
        {renderItems()}
        <View style={styles.titleOverlay}>
          <Text style={styles.titleText} numberOfLines={1}>
            {moodboard.title}
          </Text>
        </View>
      </View>
    </View>
  );
}
