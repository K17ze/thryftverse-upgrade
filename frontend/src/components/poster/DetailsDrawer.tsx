import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  ScrollView,
  Animated,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { Listing } from '../../data/mockData';
import { CachedImage } from '../CachedImage';
import { getListingCoverUri } from '../../utils/media';
import { Typography, Radius, Type, Space } from '../../theme/designTokens';
import { KeyboardAwareScrollView } from '../../platform/keyboard/KeyboardProvider';
import { AnimatedPressable } from '../AnimatedPressable';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
      <AnimatedPressable
        key={item.id}
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        onPress={() => onListingSelect(item.id)}
        scaleValue={0.96}
        activeOpacity={0.85}
        hapticFeedback="selection"
        accessibilityLabel={`Tag listing: ${item.title}${selected ? ', selected' : ''}`}
        accessibilityHint={`Tags ${item.title} to the poster`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
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
            <Ionicons name="checkmark" size={12} color={colors.background} />
          </View>
        )}
      </AnimatedPressable>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <AnimatedPressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
          hapticFeedback="light"
          accessibilityLabel="Close details drawer"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          { transform: [{ translateY }] },
        ]}
      >
        <View style={styles.keyboardWrap}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <KeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
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
              <View style={styles.expiryRow} accessibilityRole="radiogroup" accessibilityLabel="Expiry duration">
                {EXPIRY_OPTIONS.map((h) => (
                  <AnimatedPressable
                    key={h}
                    style={[
                      styles.expiryPill,
                      expiryHours === h && styles.expiryPillActive,
                    ]}
                    onPress={() => onExpiryChange(h)}
                    scaleValue={0.95}
                    activeOpacity={0.85}
                    hapticFeedback="selection"
                    accessibilityLabel={`${h} hours`}
                    accessibilityHint={`Sets the poster to expire in ${h} hours`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: expiryHours === h }}
                  >
                    <Text
                      style={[
                        styles.expiryPillText,
                        expiryHours === h && styles.expiryPillTextActive,
                      ]}
                    >
                      {h}h
                    </Text>
                  </AnimatedPressable>
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
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={200}
                textAlignVertical="top"
                accessibilityLabel="Caption"
                accessibilityHint="Enter a caption for your poster"
              />
              <Text style={styles.charCount}>{caption.length}/200</Text>
            </View>

            {/* Publish */}
            <AnimatedPressable
              style={[styles.publishBtn, isPublishing && styles.publishBtnDisabled]}
              onPress={onPublish}
              disabled={isPublishing}
              scaleValue={0.97}
              activeOpacity={0.85}
              hapticFeedback="medium"
              accessibilityLabel="Publish poster"
              accessibilityHint="Publishes your poster to your followers"
              accessibilityRole="button"
              accessibilityState={{ disabled: isPublishing }}
            >
              {isPublishing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.publishBtnText}>Publishing...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#fff" />
                  <Text style={styles.publishBtnText}>Publish</Text>
                </>
              )}
            </AnimatedPressable>
          </KeyboardAwareScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: colors.background,
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
    borderRadius: Radius.sm,
    backgroundColor: colors.border,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listingRow: {
    gap: 10,
    paddingBottom: Space.xs,
  },
  listingCard: {
    width: 100,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listingCardSelected: {
    borderColor: colors.brand,
    borderWidth: 2,
  },
  listingImage: {
    width: '100%',
    height: 90,
  },
  listingMeta: {
    padding: Space.sm,
  },
  listingTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    paddingVertical: 20,
  },
  expiryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expiryPill: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  expiryPillActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand + '15',
  },
  expiryPillText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  expiryPillTextActive: {
    color: colors.brand,
    fontFamily: Typography.family.bold,
  },
  captionInput: {
    minHeight: 80,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    textAlign: 'right',
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: Radius.xl,
    paddingVertical: 14,
    marginTop: Space.sm,
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: '#fff',
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.bold,
  },
});
}