import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type, Stroke } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useBackendData } from '../../context/BackendDataContext';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import type { OutfitTag } from './LookMediaComposer';

export interface OutfitPieceEditorProps {
  tags: OutfitTag[];
  onTagsChange: (tags: OutfitTag[]) => void;
}

export function OutfitPieceEditor({ tags, onTagsChange }: OutfitPieceEditorProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { listings } = useBackendData();
  const [searchVisibleId, setSearchVisibleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLabelChange = useCallback(
    (tagId: string, label: string) => {
      onTagsChange(tags.map((t) => (t.id === tagId ? { ...t, label } : t)));
    },
    [tags, onTagsChange]
  );

  const handleRemove = useCallback(
    (tagId: string) => {
      onTagsChange(tags.filter((t) => t.id !== tagId));
      haptic.light();
    },
    [tags, onTagsChange, haptic]
  );

  const handleLinkListing = useCallback(
    (tagId: string, listingId: string | undefined) => {
      onTagsChange(tags.map((t) => (t.id === tagId ? { ...t, listingId } : t)));
      setSearchVisibleId(null);
      setSearchQuery('');
      haptic.light();
    },
    [tags, onTagsChange, haptic]
  );

  const filteredListings = searchQuery.trim().length >= 2
    ? listings
        .filter((l) =>
          l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (l.brand ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 8)
    : [];

  const resolveListing = (listingId?: string) => listings.find((l) => l.id === listingId);

  const renderItem = ({ item: tag }: { item: OutfitTag }) => {
    const listing = resolveListing(tag.listingId);
    const isSearching = searchVisibleId === tag.id;

    return (
      <View style={styles.pieceCard}>
        <View style={styles.pieceHeader}>
          <View style={styles.pieceDot} />
          <TextInput
            style={styles.labelInput}
            value={tag.label}
            onChangeText={(text) => handleLabelChange(tag.id, text)}
            placeholder="Piece label (e.g. Vintage Jacket)"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            accessibilityLabel="Outfit piece label"
          />
          <Pressable
            onPress={() => handleRemove(tag.id)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Remove piece"
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {listing ? (
          <View style={styles.linkedListing}>
            {listing.images?.[0] && (
              <CachedImage
                uri={listing.images[0]}
                style={styles.listingThumb}
                contentFit="cover"
              />
            )}
            <View style={{ flex: 1, gap: Space.xs / 2 }}>
              <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
              <Text style={styles.listingPrice}>£{listing.price}</Text>
            </View>
            <Pressable
              onPress={() => handleLinkListing(tag.id, undefined)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Unlink listing"
            >
              <Ionicons name="link" size={18} color={colors.brand} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.linkBtn}
            onPress={() => {
              setSearchVisibleId(isSearching ? null : tag.id);
              setSearchQuery('');
            }}
            accessibilityRole="button"
            accessibilityLabel="Link to marketplace listing"
          >
            <Ionicons name="pricetag-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.linkBtnText}>
              {isSearching ? 'Cancel linking' : 'Link to listing (optional)'}
            </Text>
          </Pressable>
        )}

        {isSearching && (
          <View style={styles.searchSection}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search listings..."
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search listings to link"
            />
            {filteredListings.length > 0 && (
              <FlatList
                data={filteredListings}
                keyExtractor={(l) => l.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.searchResult}
                    onPress={() => handleLinkListing(tag.id, item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Link to ${item.title}`}
                  >
                    {item.images?.[0] && (
                      <CachedImage
                        uri={item.images[0]}
                        style={styles.searchResultThumb}
                        contentFit="cover"
                      />
                    )}
                    <View style={{ flex: 1, gap: Space.xs / 2 }}>
                      <Text style={styles.searchResultTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.searchResultPrice}>£{item.price}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
                  </Pressable>
                )}
                scrollEnabled={false}
              />
            )}
            {searchQuery.trim().length >= 2 && filteredListings.length === 0 && (
              <Text style={styles.noResults}>No listings found</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (tags.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="pricetag-outline" size={24} color={colors.textMuted} />
        <Text style={styles.emptyText}>
          Tap on your photo to tag outfit pieces. Each tag can optionally link to a marketplace listing.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardStickyView
      style={styles.container}
    >
      <FlatList
        data={tags}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
      />
    </KeyboardStickyView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    gap: Space.sm,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
  },
  emptyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  pieceCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    padding: Space.md,
    gap: Space.sm,
  },
  pieceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  pieceDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand,
  },
  labelInput: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    paddingVertical: Space.xs,
  },
  linkedListing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.sm,
  },
  listingThumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
  },
  listingTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  listingPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    color: colors.brand,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs + 2,
  },
  linkBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  searchSection: {
    gap: Space.sm,
  },
  searchInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs + 2,
  },
  searchResultThumb: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  searchResultTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  searchResultPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    color: colors.brand,
  },
  noResults: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: Space.sm,
  },
});
