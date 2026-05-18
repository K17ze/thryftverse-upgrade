import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { MOCK_LISTINGS, MOCK_USERS, Listing } from '../data/mockData';
import { mockFind, mockArrayOrEmpty } from '../utils/mockGate';
import type { Poster } from '../data/posters';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl, AppSegmentOption } from '../components/ui/AppSegmentControl';

type NavT = StackNavigationProp<RootStackParamList>;
type ListingSource = 'mine' | 'marketplace';
type StoryPosition = 'top' | 'center' | 'bottom';
type CreatePosterRoute = RouteProp<RootStackParamList, 'CreatePoster'>;
type PosterMode = 'marketplace' | 'co-own' | 'auction' | 'blank';

const EXPIRY_OPTIONS = [6, 12, 24, 48] as const;
type ExpiryOption = `${typeof EXPIRY_OPTIONS[number]}h`;

const LISTING_SOURCE_OPTIONS: AppSegmentOption<ListingSource>[] = [
  { value: 'mine', label: 'Mine', accessibilityLabel: 'Show my listings' },
  { value: 'marketplace', label: 'Marketplace', accessibilityLabel: 'Show marketplace listings' },
];

const EXPIRY_SEGMENT_OPTIONS: AppSegmentOption<ExpiryOption>[] = EXPIRY_OPTIONS.map((hours) => ({
  value: `${hours}h` as ExpiryOption,
  label: `${hours}h`,
  accessibilityLabel: `Set poster expiry to ${hours} hours`,
}));

const IS_LIGHT = ActiveTheme === 'light';
const TRADE_ACCENT = Colors.brand;
const HEADER_BORDER = Colors.border;
const HEADER_BUTTON_BG = Colors.surface;
const PANEL_BG = Colors.surface;
const PANEL_BORDER = Colors.border;
const CHIP_BG = Colors.surface;
const CHIP_BORDER = Colors.border;
const CHIP_ACTIVE_BG = IS_LIGHT ? '#ede4d3' : '#2f291f';
const CHIP_ACTIVE_TEXT = TRADE_ACCENT;
const IMAGE_BTN_DISABLED_BG = IS_LIGHT ? Colors.surface : '#101010';
const IMAGE_BTN_DISABLED_BORDER = IS_LIGHT ? Colors.border : '#252525';

export default function CreatePosterScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<CreatePosterRoute>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();

  const currentUser = useStore((state) => state.currentUser);
  const addPoster = useStore((state) => state.addPoster);
  const uploaderId = currentUser?.id ?? MOCK_USERS[0]?.id ?? 'u1';

  const allListingOptions = React.useMemo(
    () => (listings.length ? listings : mockArrayOrEmpty(MOCK_LISTINGS)),
    [listings]
  );

  const [listingSource, setListingSource] = React.useState<ListingSource>('mine');

  const listingOptions = React.useMemo(() => {
    const mine = allListingOptions.filter((item) => item.sellerId === uploaderId);
    const marketplace = allListingOptions.filter((item) => item.sellerId !== uploaderId);

    if (listingSource === 'mine') {
      return (mine.length ? mine : allListingOptions).slice(0, 24);
    }

    return (marketplace.length ? marketplace : allListingOptions).slice(0, 24);
  }, [allListingOptions, listingSource, uploaderId]);

  const [caption, setCaption] = React.useState('');
  const [expiryHours, setExpiryHours] = React.useState(24);
  const [selectedListingId, setSelectedListingId] = React.useState(listingOptions[0]?.id ?? '');
  const [posterImageUri, setPosterImageUri] = React.useState<string | null>(null);
  const [isPickingImage, setIsPickingImage] = React.useState(false);
  const [storyText, setStoryText] = React.useState('');
  const [storyColor, setStoryColor] = React.useState('#ffffff');
  const [storyPosition, setStoryPosition] = React.useState<StoryPosition>('bottom');
  const [posterMode, setPosterMode] = React.useState<PosterMode>('marketplace');
  const [blankBackgroundColor, setBlankBackgroundColor] = React.useState('#1a1a2e');
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const lastAppliedEditorResultAtRef = React.useRef<number | null>(null);

  const expiryOptionValue = `${expiryHours}h` as ExpiryOption;

  const handleExpiryOptionChange = (next: ExpiryOption) => {
    const parsed = Number(next.replace('h', ''));
    if (Number.isFinite(parsed)) {
      setExpiryHours(parsed);
    }
  };

  React.useEffect(() => {
    if (!listingOptions.length) {
      return;
    }

    if (!listingOptions.some((item) => item.id === selectedListingId)) {
      setSelectedListingId(listingOptions[0].id);
    }
  }, [listingOptions, selectedListingId]);

  React.useEffect(() => {
    const storyEditorResult = route.params?.storyEditorResult;

    if (!storyEditorResult) {
      return;
    }

    if (lastAppliedEditorResultAtRef.current === storyEditorResult.updatedAt) {
      return;
    }

    setStoryText(storyEditorResult.text);
    setStoryColor(storyEditorResult.color);
    setStoryPosition(storyEditorResult.position);
    lastAppliedEditorResultAtRef.current = storyEditorResult.updatedAt;
  }, [route.params?.storyEditorResult]);

  const selectedListing = React.useMemo(
    () => listingOptions.find((item) => item.id === selectedListingId),
    [listingOptions, selectedListingId]
  );

  const selectedListingSeller = React.useMemo(
    () => mockFind(MOCK_USERS, (user) => user.id === selectedListing?.sellerId),
    [selectedListing?.sellerId]
  );

  const storyOverlayPositionStyle =
    storyPosition === 'top'
      ? styles.storyOverlayTop
      : storyPosition === 'center'
        ? styles.storyOverlayCenter
        : styles.storyOverlayBottom;

  const previewUri =
    posterMode === 'blank'
      ? null // blank canvas mode uses background color, not image
      : (posterImageUri ??
        (selectedListing
          ? getListingCoverUri(selectedListing.images, 'https://picsum.photos/seed/poster-fallback/600/800')
          : undefined) ??
        'https://picsum.photos/seed/poster-fallback/600/800');

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      show('Allow photo library access to upload posters', 'error');
      return;
    }

    setIsPickingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.9,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPosterImageUri(result.assets[0].uri);
        show('Poster image selected', 'success');
      }
    } catch {
      // Silently fail - user can try again
    } finally {
      setIsPickingImage(false);
    }
  };

  const pickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      show('Allow camera access to shoot posters', 'error');
      return;
    }

    setIsPickingImage(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.9,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPosterImageUri(result.assets[0].uri);
        show('Poster image captured', 'success');
      }
    } catch {
      // Silently fail - user can try again
    } finally {
      setIsPickingImage(false);
    }
  };

  const handlePublish = () => {
    const trimmedCaption = caption.trim();
    const trimmedStoryText = storyText.trim();

    if (!selectedListing) {
      show('Choose a listing first', 'error');
      return;
    }

    if (!trimmedCaption) {
      show('Add a caption to publish', 'error');
      return;
    }

    const sharedFromUserId = selectedListing.sellerId !== uploaderId ? selectedListing.sellerId : undefined;

    const newPoster: Poster = {
      id: `p_user_${Date.now()}`,
      uploaderId,
      listingId: selectedListing.id,
      image: previewUri ?? blankBackgroundColor,
      caption: trimmedCaption,
      createdAt: new Date().toISOString(),
      expiryHours,
      sharedFromUserId,
      storyOverlay: trimmedStoryText
        ? {
            text: trimmedStoryText,
            color: storyColor,
            position: storyPosition,
          }
        : undefined,
    };

    addPoster(newPoster);
    show('Poster is now live', 'success');
    navigation.replace('PosterViewer', { posterId: newPoster.id });
  };

  const handleMessageSelectedSeller = React.useCallback(() => {
    if (!selectedListing) {
      return;
    }

    const partnerUserId = selectedListingSeller?.id ?? selectedListing.sellerId;
    navigation.navigate('Chat', {
      conversationId: `poster_${selectedListing.id}_${partnerUserId}`,
      focusQuery: selectedListing.title,
      partnerUserId,
    });
    show('Opening seller chat for poster collaboration.', 'info');
  }, [navigation, selectedListing, selectedListingSeller?.id, show]);

  const handleOpenStoryEditor = React.useCallback(() => {
    navigation.navigate('PosterEditor', {
      baseImageUri: previewUri ?? blankBackgroundColor,
      initialText: storyText,
      initialColor: storyColor,
      initialPosition: storyPosition,
      createPosterRouteKey: route.key,
    });
  }, [navigation, previewUri, route.key, storyColor, storyPosition, storyText]);

  const renderListingCard = ({ item }: { item: Listing }) => {
    const selected = item.id === selectedListingId;
    const sellerName = mockFind(MOCK_USERS, (user) => user.id === item.sellerId)?.username ?? 'seller';

    return (
      <AnimatedPressable
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        activeOpacity={0.9}
        onPress={() => setSelectedListingId(item.id)}
      >
        <CachedImage uri={getListingCoverUri(item.images, 'https://picsum.photos/seed/poster-listing-fallback/300/400')} style={styles.listingImage} contentFit="cover" />
        <View style={styles.listingMeta}>
          <Text style={styles.listingTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.listingSeller} numberOfLines={1}>@{sellerName}</Text>
          <Text style={styles.listingPrice}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
        </View>
        {selected ? (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark" size={12} color={Colors.background} />
          </View>
        ) : null}
      </AnimatedPressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.headerBtn} activeOpacity={0.85} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>New Poster</Text>
        <AnimatedPressable
          style={[styles.headerBtn, styles.publishPill]}
          activeOpacity={0.85}
          onPress={handlePublish}
        >
          <Text style={styles.publishPillText}>Publish</Text>
        </AnimatedPressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Story-style Preview ── */}
        <View style={styles.previewWrap}>
          <View style={styles.previewPhone}>
            <CachedImage uri={previewUri ?? blankBackgroundColor} style={styles.previewImage} contentFit="cover" />

            {/* Top overlay pills */}
            <View style={styles.previewOverlayTop}>
              {selectedListing && selectedListing.sellerId !== uploaderId ? (
                <View style={styles.pillDark}>
                  <Ionicons name="repeat-outline" size={11} color="#fff" />
                  <Text style={styles.pillDarkText}>@{selectedListingSeller?.username ?? 'seller'}</Text>
                </View>
              ) : null}
              <View style={styles.pillDark}>
                <Ionicons name="time-outline" size={11} color="#fff" />
                <Text style={styles.pillDarkText}>{expiryHours}h</Text>
              </View>
            </View>

            {/* Story text overlay */}
            {storyText.trim().length > 0 ? (
              <View style={[styles.storyOverlayWrap, storyOverlayPositionStyle]}>
                <Text style={[styles.storyOverlayText, { color: storyColor }]} numberOfLines={2}>
                  {storyText.trim()}
                </Text>
              </View>
            ) : null}

            {/* Caption at bottom */}
            <View style={styles.previewOverlayBottom}>
              <Text style={styles.previewCaption} numberOfLines={2}>
                {caption.trim() || 'Tap to add caption...'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Mode Tabs ── */}
        <View style={styles.modeTabs}>
          {[
            { key: 'marketplace', label: 'Marketplace', icon: 'pricetag-outline' as const },
            { key: 'co-own', label: 'Co-Own', icon: 'people-outline' as const },
            { key: 'auction', label: 'Auction', icon: 'hammer-outline' as const },
            { key: 'blank', label: 'Blank', icon: 'color-palette-outline' as const },
          ].map((mode) => (
            <AnimatedPressable
              key={mode.key}
              style={[styles.modeTab, posterMode === mode.key && styles.modeTabActive]}
              onPress={() => setPosterMode(mode.key as PosterMode)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={mode.icon}
                size={18}
                color={posterMode === mode.key ? Colors.brand : Colors.textMuted}
              />
              <Text style={[styles.modeTabText, posterMode === mode.key && styles.modeTabTextActive]}>
                {mode.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* ── Listing Source (hidden for blank) ── */}
        {posterMode !== 'blank' && (
          <View style={styles.section}>
            <AppSegmentControl
              options={LISTING_SOURCE_OPTIONS}
              value={listingSource}
              onChange={setListingSource}
              style={styles.sourceRow}
              fullWidth
              optionStyle={styles.sourceChip}
              optionActiveStyle={styles.sourceChipActive}
              optionTextStyle={styles.sourceChipText}
              optionTextActiveStyle={styles.sourceChipTextActive}
            />
          </View>
        )}

        {/* ── Blank color picker ── */}
        {posterMode === 'blank' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Background</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRail}>
              {[
                '#1a1a2e', '#16213e', '#0f3460', '#e94560', '#ff6b6b',
                '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd', '#ff9f43',
                '#10ac84', '#00d2d3', '#54a0ff', '#341f97',
                '#222f3e', '#576574', '#8395a7', '#c8d6e5', '#dfe6e9',
              ].map((color) => (
                <AnimatedPressable
                  key={color}
                  style={[
                    styles.colorOrb,
                    { backgroundColor: color },
                    blankBackgroundColor === color && styles.colorOrbActive,
                  ]}
                  onPress={() => setBlankBackgroundColor(color)}
                  activeOpacity={0.85}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Image Pick (non-blank) ── */}
        {posterMode !== 'blank' && (
          <View style={styles.section}>
            <View style={styles.imagePickerRow}>
              <AnimatedPressable style={styles.mediaBtn} onPress={pickFromLibrary} activeOpacity={0.85}>
                <Ionicons name="images-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.mediaBtnText}>Gallery</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.mediaBtn} onPress={pickFromCamera} activeOpacity={0.85}>
                <Ionicons name="camera-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.mediaBtnText}>Camera</Text>
              </AnimatedPressable>
              {posterImageUri && (
                <AnimatedPressable style={styles.mediaBtn} onPress={() => setPosterImageUri(null)} activeOpacity={0.85}>
                  <Ionicons name="refresh-outline" size={20} color={Colors.danger} />
                  <Text style={[styles.mediaBtnText, { color: Colors.danger }]}>Reset</Text>
                </AnimatedPressable>
              )}
            </View>
            {isPickingImage && (
              <View style={styles.pickingRow}>
                <ActivityIndicator size="small" color={Colors.brand} />
                <Text style={styles.pickingText}>Opening...</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Caption ── */}
        <View style={styles.section}>
          <TextInput
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Write a caption..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={120}
          />
          <Text style={styles.charCount}>{caption.length}/120</Text>
        </View>

        {/* ── Story Overlay Quick Action ── */}
        <AnimatedPressable style={styles.storyActionRow} onPress={handleOpenStoryEditor} activeOpacity={0.85}>
          <View style={styles.storyActionLeft}>
            <View style={[styles.storyColorDot, { backgroundColor: storyColor }]} />
            <Text style={styles.storyActionLabel}>
              {storyText.trim().length > 0 ? storyText.trim() : 'Add text overlay'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </AnimatedPressable>

        {/* ── Expiry ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Expires in</Text>
          <View style={styles.expiryRow}>
            {EXPIRY_OPTIONS.map((h) => {
              const active = expiryHours === h;
              return (
                <AnimatedPressable
                  key={h}
                  style={[styles.expiryPill, active && styles.expiryPillActive]}
                  onPress={() => setExpiryHours(h)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.expiryPillText, active && styles.expiryPillTextActive]}>{h}h</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* ── Listing Selector ── */}
        {posterMode !== 'blank' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Select Listing</Text>
              <Text style={styles.sectionCount}>{listingOptions.length}</Text>
            </View>
            <FlashList
              data={listingOptions}
              horizontal
              keyExtractor={(item) => item.id}
              renderItem={renderListingCard}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listingListContent}
            />
          </View>
        )}

        {/* ── Publish Button ── */}
        <AppButton
          title="Create Poster"
          variant="primary"
          size="lg"
          style={styles.createBtn}
          onPress={handlePublish}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  publishPill: {
    backgroundColor: Colors.brand,
    width: 'auto',
    paddingHorizontal: 16,
  },
  publishPillText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Preview
  previewWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  previewPhone: {
    width: 280,
    height: 420,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 4,
    borderColor: Colors.border,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlayTop: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDarkText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  previewOverlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  previewCaption: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 18,
  },
  storyOverlayWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 2,
  },
  storyOverlayTop: { top: 54 },
  storyOverlayCenter: { top: '42%' },
  storyOverlayBottom: { bottom: 56 },
  storyOverlayText: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
    letterSpacing: 0.3,
  },

  // Mode tabs
  modeTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 20,
  },
  modeTab: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    opacity: 0.6,
  },
  modeTabActive: {
    opacity: 1,
    borderBottomWidth: 2,
    borderBottomColor: Colors.brand,
  },
  modeTabText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
  },
  modeTabTextActive: {
    color: Colors.brand,
  },

  // Sections
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
  },

  // Source
  sourceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sourceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sourceChipActive: {
    borderColor: Colors.brand,
    backgroundColor: IS_LIGHT ? '#ede4d3' : '#2f291f',
  },
  sourceChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  sourceChipTextActive: {
    color: Colors.brand,
  },

  // Color picker
  colorRail: {
    gap: 10,
    paddingRight: 16,
  },
  colorOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorOrbActive: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  // Media buttons
  imagePickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
  },
  mediaBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
  },
  pickingRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickingText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },

  // Caption
  captionInput: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 14,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  charCount: {
    marginTop: 6,
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textAlign: 'right',
  },

  // Story action
  storyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  storyActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  storyColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  storyActionLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
  },

  // Expiry
  expiryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expiryPill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  expiryPillActive: {
    borderColor: Colors.brand,
    backgroundColor: IS_LIGHT ? '#ede4d3' : '#2f291f',
  },
  expiryPillText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  expiryPillTextActive: {
    color: Colors.brand,
    fontFamily: 'Inter_700Bold',
  },

  // Listings
  listingListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  listingCard: {
    width: 120,
    borderRadius: 16,
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
    height: 100,
  },
  listingMeta: {
    padding: 10,
  },
  listingTitle: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  listingSeller: {
    marginTop: 3,
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  listingPrice: {
    marginTop: 3,
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Create button
  createBtn: {
    marginTop: 8,
    borderRadius: 18,
    minHeight: 52,
  },
});

