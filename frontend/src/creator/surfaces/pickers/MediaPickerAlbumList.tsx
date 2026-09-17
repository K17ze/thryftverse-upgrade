/**
 * MediaPickerAlbumList — album picker dropdown triggered from the
 * "Albums" tab. 48pt rows, no thumbnails. Row: album name + count +
 * chevron. Includes the "All Photos" reset row.
 *
 * Extracted from MediaPicker.tsx (pure move — no behavior change).
 */

import React from 'react';
import { Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Space } from '../../../theme/designTokens';
import { type ThemeColors } from '../../../theme/ThemeContext';
import { createStyles } from './pickerShared';

export function MediaPickerAlbumList({
  albums,
  activeAlbumId,
  onSelectAlbum,
  colors,
  styles }: {
  albums: MediaLibrary.Album[];
  activeAlbumId: string | null;
  onSelectAlbum: (albumId: string | null) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <ScrollView style={styles.albumPickerDropdown} contentContainerStyle={{ paddingBottom: Space.sm }}>
      <Pressable
        style={styles.albumPickerItem}
        onPress={() => onSelectAlbum(null)}
        accessibilityLabel="All Photos album"
        accessibilityHint="Shows all photos"
        accessibilityRole="button"
        accessibilityState={{ selected: activeAlbumId === null }}
      >
        <Text style={[styles.albumPickerItemText, { color: activeAlbumId === null ? colors.brand : colors.textPrimary }]} numberOfLines={1}>
          All Photos
        </Text>
        <Text style={styles.albumPickerItemCount}>{''}</Text>
        <Ionicons name={activeAlbumId === null ? 'checkmark' : 'chevron-forward'} size={16} color={activeAlbumId === null ? colors.brand : colors.textMuted} aria-hidden={true} />
      </Pressable>
      {albums.slice(0, 12).map((album) => (
        <Pressable
          key={album.id}
          style={styles.albumPickerItem}
          onPress={() => onSelectAlbum(album.id)}
          accessibilityLabel={`${album.title} album`}
          accessibilityHint="Shows this album's media"
          accessibilityRole="button"
          accessibilityState={{ selected: activeAlbumId === album.id }}
        >
          <Text style={[styles.albumPickerItemText, { color: activeAlbumId === album.id ? colors.brand : colors.textPrimary }]} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={styles.albumPickerItemCount}>{album.assetCount}</Text>
          <Ionicons name={activeAlbumId === album.id ? 'checkmark' : 'chevron-forward'} size={16} color={activeAlbumId === album.id ? colors.brand : colors.textMuted} aria-hidden={true} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
