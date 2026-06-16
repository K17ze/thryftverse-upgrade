import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import type { Listing } from '../../data/mockData';
import { CachedImage } from '../CachedImage';
import { getListingCoverUri } from '../../utils/media';
import { Typography } from '../../theme/designTokens';

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.55;

interface DetailsDrawerProps {
  visible: boolean;
  onClose: () => void;
  caption: string;
  onCaptionChange: (caption: string) => void;
  expiryHours: number;
  onExpiryChange: (hours: number) => void;
  selectedListingId: string;
  onListingSelect: (id: string) => void;
  listings: Listing[];
  onPublish: () => void;
  isPublishing: boolean;
  currentUserId: string | null;
}

const EXPIRY_OPTIONS = [6, 12, 24, 48] as const;

export default function DetailsDrawer({
  visible,
  onClose,
  caption,
  onCaptionChange,
  expiryHours,
  onExpiryChange,
  selectedListingId,
  onListingSelect,
  listings,
  onPublish,
  isPublishing,
  currentUserId,
}: DetailsDrawerProps) {
  const translateY = React.useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

  const marketplaceListings = React.useMemo(
    () => (currentUserId ? listings.filter((l) => l.sellerId !== currentUserId) : listings),
    [listings, currentUserId]
  );

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: DRAWER_HEIGHT,
          useNativeDriver: true,
          friction: 8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const renderListingCard = (item: Listing) => {
    const selected = item.id === selectedListingId;
    return (
      <Pressable
        key={item.id}
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        onPress={() => onListingSelect(item.id)}
      >
        <CachedImage
          uri={getListingCoverUri(item.images, '')}
          style={styles.listingImage}
          contentFit="cover"
        />
        <View style={styles.listingMeta}>
          <Text style={styles.listingTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        {selected && (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark" size={12} color={Colors.background} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          { transform: [{ translateY }] },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Listings */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tag a Listing</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listingRow}>
                {marketplaceListings.slice(0, 12).map(renderListingCard)}
                {marketplaceListings.length === 0 && (
                  <Text style={styles.emptyText}>No listings available</Text>
                )}
              </ScrollView>
            </View>

            {/* Expiry */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Expires In</Text>
              <View style={styles.expiryRow}>
                {EXPIRY_OPTIONS.map((h) => (
                  <Pressable
                    key={h}
                    style={[
                      styles.expiryPill,
                      expiryHours === h && styles.expiryPillActive,
                    ]}
                    onPress={() => onExpiryChange(h)}
                  >
                    <Text
                      style={[
                        styles.expiryPillText,
                        expiryHours === h && styles.expiryPillTextActive,
                      ]}
                    >
                      {h}h
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Caption */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Caption</Text>
              <TextInput
                style={styles.captionInput}
                value={caption}
                onChangeText={onCaptionChange}
                placeholder="Add a caption..."
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={200}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{caption.length}/200</Text>
            </View>

            {/* Publish */}
            <Pressable
              style={[styles.publishBtn, isPublishing && styles.publishBtnDisabled]}
              onPress={onPublish}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <Text style={styles.publishBtnText}>Publishing...</Text>
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#fff" />
                  <Text style={styles.publishBtnText}>Publish</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  keyboardWrap: {
    flex: 1,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listingRow: {
    gap: 10,
    paddingBottom: 4,
  },
  listingCard: {
    width: 100,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listingCardSelected: {
    borderColor: Colors.brand,
    borderWidth: 2,
  },
  listingImage: {
    width: '100%',
    height: 90,
  },
  listingMeta: {
    padding: 8,
  },
  listingTitle: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    paddingVertical: 20,
  },
  expiryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expiryPill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  expiryPillActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand + '15',
  },
  expiryPillText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  expiryPillTextActive: {
    color: Colors.brand,
    fontFamily: Typography.family.bold,
  },
  captionInput: {
    minHeight: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: Typography.family.regular,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: Typography.family.bold,
  },
});