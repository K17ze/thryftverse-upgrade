import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import type { PosterSticker as ApiPosterSticker } from '../../services/postersApi';

interface PosterStickerLayerProps {
  stickers: ApiPosterSticker[];
  onStickerPress?: (sticker: ApiPosterSticker) => void;
  onStickerLongPress?: (sticker: ApiPosterSticker) => void;
  editable?: boolean;
  onStickerUpdate?: (id: string, x: number, y: number) => void;
  containerWidth: number;
  containerHeight: number;
  style?: ViewStyle;
}

export function PosterStickerLayer({
  stickers,
  onStickerPress,
  onStickerLongPress,
  editable,
  onStickerUpdate,
  containerWidth,
  containerHeight,
  style,
}: PosterStickerLayerProps) {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
      {stickers.map((sticker) => {
        const left = sticker.x * containerWidth;
        const top = sticker.y * containerHeight;
        const transform = [{ scale: sticker.scale }, { rotate: `${sticker.rotation}deg` }];

        return (
          <View
            key={sticker.id}
            style={[
              styles.stickerBase,
              { left, top, transform },
            ]}
            pointerEvents="auto"
          >
            <Pressable
              onPress={() => onStickerPress?.(sticker)}
              onLongPress={() => onStickerLongPress?.(sticker)}
              delayLongPress={300}
              disabled={!onStickerPress && !onStickerLongPress}
            >
              <StickerContent sticker={sticker} />
            </Pressable>
            {editable && (
              <View style={styles.editHandle}>
                <Ionicons name="move" size={14} color="#fff" />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function StickerContent({ sticker }: { sticker: ApiPosterSticker }) {
  switch (sticker.type) {
    case 'text':
      return (
        <View
          style={[
            styles.textWrap,
            sticker.payload.backgroundColor ? { backgroundColor: sticker.payload.backgroundColor } : null,
            sticker.payload.alignment === 'left' && { alignItems: 'flex-start' },
            sticker.payload.alignment === 'right' && { alignItems: 'flex-end' },
          ]}
        >
          <Text
            style={[
              styles.textSticker,
              { color: sticker.payload.textColor ?? '#ffffff' },
              sticker.payload.textStyle === 'editorial' && { fontFamily: Typography.family.bold, fontSize: Type.title.size },
              sticker.payload.textStyle === 'minimal' && { fontFamily: Typography.family.light, fontSize: Type.body.size },
              sticker.payload.textStyle === 'label' && { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, letterSpacing: 0.5 },
              sticker.payload.textStyle === 'outline' && { fontFamily: Typography.family.medium, fontSize: Type.body.size },
            ]}
          >
            {sticker.payload.text}
          </Text>
        </View>
      );

    case 'mention':
      return (
        <View style={styles.mentionWrap}>
          <Text style={styles.mentionText}>@{sticker.payload.username}</Text>
        </View>
      );

    case 'listing':
      return (
        <View style={styles.listingWrap}>
          {sticker.payload.snapshotImageUrl ? (
            <Text style={styles.listingTitle}>{sticker.payload.snapshotTitle ?? 'View listing'}</Text>
          ) : (
            <View style={styles.listingRow}>
              <Ionicons name="pricetag" size={14} color="#fff" />
              <Text style={styles.listingTitle}>{sticker.payload.snapshotTitle ?? 'Listing'}</Text>
            </View>
          )}
          {sticker.payload.snapshotPriceGbp !== undefined && (
            <Text style={styles.listingPrice}>£{sticker.payload.snapshotPriceGbp.toFixed(0)}</Text>
          )}
        </View>
      );

    case 'look':
      return (
        <View style={styles.lookWrap}>
          <Ionicons name="shirt-outline" size={14} color="#fff" />
          <Text style={styles.lookText}>{sticker.payload.snapshotCaption ?? 'View look'}</Text>
        </View>
      );

    case 'style_vote':
      return (
        <View style={styles.voteWrap}>
          <Text style={styles.voteQuestion}>{sticker.payload.question}</Text>
          {sticker.payload.options?.map((opt) => (
            <View key={opt.id} style={styles.voteOption}>
              <Text style={styles.voteOptionText}>{opt.label}</Text>
            </View>
          ))}
        </View>
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  stickerBase: {
    position: 'absolute',
  },
  editHandle: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  textSticker: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  mentionWrap: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: 4,
  },
  mentionText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  listingWrap: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    gap: 2,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listingTitle: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
  },
  listingPrice: {
    color: Colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: Type.body.size,
  },
  lookWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 4,
  },
  lookText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  voteWrap: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 6,
    minWidth: 160,
  },
  voteQuestion: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  voteOption: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
  },
  voteOptionText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
});
