import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import type { Listing } from '../../domain';
import { CachedImage } from '../CachedImage';
import { getListingCoverUri } from '../../utils/media';
import { Typography, Radius, Type, Space } from '../../theme/designTokens';
import { KeyboardAwareScrollView } from '../../platform/keyboard/KeyboardProvider';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';

/** Spring config shape returned by useMotionConfig().spring.* */
type SpringConfig = { damping: number; stiffness: number; mass: number };

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
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring, isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Reanimated shared values for spring slide-up + backdrop fade
  const translateYSV = useSharedValue(DRAWER_HEIGHT);
  const backdropOpacitySV = useSharedValue(0);
  const closeBtnScaleSV = useSharedValue(1);
  const closeBtnOpacitySV = useSharedValue(0);

  const marketplaceListings = React.useMemo(
    () => (currentUserId ? listings.filter((l) => l.sellerId !== currentUserId) : listings),
    [listings, currentUserId]
  );

  React.useEffect(() => {
    if (visible) {
      // Spring slide-up entrance
      translateYSV.value = withSpring(0, spring.entrance as SpringConfig);
      backdropOpacitySV.value = withTiming(1, { duration: Motion.duration.normal });
      // Staggered close button appearance
      closeBtnOpacitySV.value = withDelay(
        Motion.duration.fast,
        withTiming(1, { duration: Motion.duration.fast })
      );
    } else {
      // Spring slide-down exit
      translateYSV.value = withSpring(DRAWER_HEIGHT, spring.entrance as SpringConfig);
      backdropOpacitySV.value = withTiming(0, { duration: Motion.duration.fast });
      closeBtnOpacitySV.value = withTiming(0, { duration: Motion.duration.fast });
    }
  }, [visible, translateYSV, backdropOpacitySV, closeBtnOpacitySV, spring]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYSV.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacitySV.value,
  }));

  const closeBtnStyle = useAnimatedStyle(() => ({
    opacity: closeBtnOpacitySV.value,
    transform: [{ scale: closeBtnScaleSV.value }],
  }));

  const handleClosePressIn = () => {
    if (isEnabled) {
      closeBtnScaleSV.value = withSpring(0.9, spring.press as SpringConfig);
    }
  };

  const handleClosePressOut = () => {
    if (isEnabled) {
      closeBtnScaleSV.value = withSpring(1, spring.press as SpringConfig);
    }
  };

  const handleListingSelect = (id: string) => {
    haptic.selection();
    onListingSelect(id);
  };

  const handleExpiryChange = (h: number) => {
    haptic.selection();
    onExpiryChange(h);
  };

  const handlePublish = () => {
    haptic.medium();
    onPublish();
  };

  const renderListingCard = (item: Listing) => {
    const selected = item.id === selectedListingId;
    return (
      <AnimatedPressable
        key={item.id}
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        onPress={() => handleListingSelect(item.id)}
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
      {/* Backdrop — BlurView for true glassmorphism depth */}
      <Reanimated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <BlurView
          intensity={40}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <AnimatedPressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
          hapticFeedback="light"
          accessibilityLabel="Close details drawer"
          accessibilityRole="button"
        />
      </Reanimated.View>

      {/* Drawer — spring slide-up from bottom */}
      <Reanimated.View
        style={[
          styles.drawer,
          drawerStyle,
        ]}
      >
        <View style={styles.keyboardWrap}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Close button — spring scale feedback, top-right */}
          <Reanimated.View style={[styles.closeBtnWrap, closeBtnStyle]}>
            <AnimatedPressable
              style={styles.closeBtn}
              onPress={onClose}
              onPressIn={handleClosePressIn}
              onPressOut={handleClosePressOut}
              scaleValue={0.9}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel="Close details drawer"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </AnimatedPressable>
          </Reanimated.View>

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
                    onPress={() => handleExpiryChange(h)}
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
              onPress={handlePublish}
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
      </Reanimated.View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
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
  // Close button — positioned top-right, transparent 44pt hit target
  closeBtnWrap: {
    position: 'absolute',
    top: 8,
    right: Space.sm,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: Type.caption.size,
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
    fontSize: Type.caption.size,
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
    fontSize: Type.caption.size,
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
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
  },
});
}
