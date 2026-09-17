import React from 'react';
import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Elevation, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── Music layer content ────────────────────────────────────────────
// Music sticker: album art + track name + artist.
export function MusicLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'music' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: Radius.lg,
        backgroundColor: colors.mediaOverlayScrim,
        minWidth: 160,
        maxWidth: '100%' }}
      accessibilityLabel={`Music, ${payload.trackName}${payload.artistName ? ` by ${payload.artistName}` : ''}`}
      accessibilityRole="button"
      accessibilityHint="Plays the attached track when published"
    >
      {payload.artworkUrl ? (
        <ExpoImage
          source={{ uri: payload.artworkUrl }}
          style={{
            width: 40,
            height: 40,
            borderRadius: Radius.sm,
            ...Elevation.modal }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={payload.artworkUrl}
          enforceEarlyResizing
        />
      ) : (
        <View style={{
          width: 40,
          height: 40,
          borderRadius: Radius.sm,
          backgroundColor: 'rgba(201,164,106,0.2)',
          justifyContent: 'center',
          alignItems: 'center' }}>
          <Ionicons name="musical-notes" size={IconGrammar.metadata} color="rgba(201,164,106,0.8)" aria-hidden={true} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.caption.size, color: colors.scrimTextPrimary }} numberOfLines={1}>
          {payload.trackName}
        </Text>
        {payload.artistName ? (
          <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: colors.scrimTextSecondary }} numberOfLines={1}>
            {payload.artistName}
          </Text>
        ) : null}
      </View>
      <View style={{
        width: 22,
        height: 22,
        borderRadius: Radius.full,
        backgroundColor: colors.scrimTextTertiary,
        justifyContent: 'center',
        alignItems: 'center' }}>
        <Ionicons name="play" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
      </View>
    </View>
  );
}
