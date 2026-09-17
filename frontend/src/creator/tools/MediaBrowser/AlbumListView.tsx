/**
 * Album list for the MediaBrowser "Albums" tab: AlbumRow (loads its own
 * cover thumbnail) and AlbumListView (All Photos + device albums).
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import { StaticStateIcon } from './MediaBrowserStates';
import type { MediaBrowserStyles } from './mediaBrowserStyles';

// ── AlbumRow — loads its own cover thumbnail (first asset in album) ──

interface AlbumRowProps {
  album: MediaLibrary.Album;
  isActive: boolean;
  onSelect: (albumId: string | null) => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

function AlbumRow({ album, isActive, onSelect, colors, styles }: AlbumRowProps) {
  const [coverUri, setCoverUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    MediaLibrary.getAssetsAsync({ album: album.id, first: 1, mediaType: ['photo', 'video'] })
      .then((result) => {
        if (!cancelled && result.assets.length > 0) {
          setCoverUri(result.assets[0].uri);
        }
      })
      .catch(() => {
        // Cover is optional — placeholder will render.
      });
    return () => { cancelled = true; };
  }, [album.id]);

  return (
    <Pressable
      style={styles.albumRow}
      onPress={() => onSelect(album.id)}
      accessibilityLabel={`${album.title} album, ${album.assetCount} items`}
      accessibilityHint="Shows this album's media"
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <View style={[styles.albumThumb, { backgroundColor: colors.surfaceAlt }]}>
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={styles.albumThumbImage}
            contentFit="cover"
            transition={120}
            recyclingKey={album.id}
          />
        ) : (
          <AppIcon name="images-outline" size={IconSize.lg} color="textMuted" opticalCenter={true} accessible={false} />
        )}
      </View>
      <View style={styles.albumRowTextCol}>
        <Text
          style={[
            styles.albumRowText,
            { color: isActive ? colors.brand : colors.textPrimary },
          ]}
          numberOfLines={1}
        >
          {album.title}
        </Text>
        <Text style={[styles.albumRowSubtext, { color: colors.textMuted }]}>
          {album.assetCount} items
        </Text>
      </View>
      {isActive && <AppIcon name="check" size={IconSize.sm} color="brand" opticalCenter={true} accessible={false} />}
    </Pressable>
  );
}

// ── AlbumListView — shown when "Albums" tab is active ───────────────

interface AlbumListViewProps {
  albums: MediaLibrary.Album[];
  activeAlbumId: string | null;
  onSelectAlbum: (albumId: string | null) => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function AlbumListView({
  albums,
  activeAlbumId,
  onSelectAlbum,
  colors,
  styles }: AlbumListViewProps) {
  if (albums.length === 0) {
    return (
      <View style={styles.centerState}>
        <StaticStateIcon name="folder-open-outline" size={IconSize.hero} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No albums found
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.albumList} contentContainerStyle={styles.albumListContent}>
      <Pressable
        style={styles.albumRow}
        onPress={() => onSelectAlbum(null)}
        accessibilityLabel="All Photos album"
        accessibilityHint="Shows all photos"
        accessibilityRole="button"
        accessibilityState={{ selected: activeAlbumId === null }}
      >
        <View style={[styles.albumThumb, { backgroundColor: colors.brandSubtle }]}>
          <AppIcon name="images-outline" size={IconSize.lg} color="brand" opticalCenter={true} accessible={false} />
        </View>
        <View style={styles.albumRowTextCol}>
          <Text
            style={[
              styles.albumRowText,
              { color: activeAlbumId === null ? colors.brand : colors.textPrimary },
            ]}
          >
            All Photos
          </Text>
          <Text style={[styles.albumRowSubtext, { color: colors.textMuted }]}>
            Everything in your library
          </Text>
        </View>
        {activeAlbumId === null && <AppIcon name="check" size={IconSize.sm} color="brand" opticalCenter={true} accessible={false} />}
      </Pressable>
      {albums.slice(0, 30).map((album) => (
        <AlbumRow
          key={album.id}
          album={album}
          isActive={activeAlbumId === album.id}
          onSelect={onSelectAlbum}
          colors={colors}
          styles={styles}
        />
      ))}
    </ScrollView>
  );
}
