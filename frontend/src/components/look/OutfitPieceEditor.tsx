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
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useBackendData } from '../../context/BackendDataContext';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import type { OutfitTag } from './LookMediaComposer';

export interface OutfitPieceEditorProps {
  tags: OutfitTag[];
  onTagsChange: (tags: OutfitTag[]) => void;
}

export function OutfitPieceEditor({ tags, onTagsChange }: OutfitPieceEditorProps) {
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
            placeholderTextColor={Colors.textMuted}
            maxLength={80}
            accessibilityLabel="Outfit piece label"
          />
          <Pressable
            onPress={() => handleRemove(tag.id)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Remove piece"
          >
            <Ionicons name="close" size={20} color={Colors.textMuted} />
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
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
              <Text style={styles.listingPrice}>£{listing.price}</Text>
            </View>
            <Pressable
              onPress={() => handleLinkListing(tag.id, undefined)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Unlink listing"
            >
              <Ionicons name="link" size={18} color={Colors.brand} />
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
            <Ionicons name="pricetag-outline" size={16} color={Colors.textSecondary} />
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
              placeholderTextColor={Colors.textMuted}
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
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.searchResultTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.searchResultPrice}>£{item.price}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={20} color={Colors.brand} />
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
        <Ionicons name="pricetag-outline" size={24} color={Colors.textMuted} />
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

const styles = StyleSheet.create({
  container: {
    gap: Space.sm,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  pieceCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
    borderRadius: 5,
    backgroundColor: Colors.brand,
  },
  labelInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    paddingVertical: 4,
  },
  linkedListing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.sm,
  },
  listingThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  listingTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  listingPrice: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  linkBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  searchSection: {
    gap: Space.sm,
  },
  searchInput: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 6,
  },
  searchResultThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: Colors.surfaceAlt,
  },
  searchResultTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  searchResultPrice: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
  },
  noResults: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
