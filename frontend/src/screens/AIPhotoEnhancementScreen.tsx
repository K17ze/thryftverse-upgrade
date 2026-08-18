import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles, Stroke, Control } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AITrustSignal } from '../components/ai/AITrustSignal';
import { EmptyState as CanonicalEmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useConnectivity } from '../hooks/useConnectivity';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
import {
  AI_PHOTO_DEMO_MODE,
  fetchEnhancementOptions,
  fetchBackgroundScenes,
  fetchEnhancementPresets,
  applyEnhancement,
  applyPreset,
  replaceBackground,
  revertEnhancement,
  type EnhancementOption,
  type EnhancementPreset,
  type BackgroundScene,
  type EnhancementResult,
} from '../services/aiPhotoEnhancementApi';

type Props = NativeStackScreenProps<RootStackParamList, 'AIPhotoEnhancement'>;

const { width: SCREEN_W } = Dimensions.get('window');
/** 4:5 aspect ratio preview — marketplace standard (Depop, Vinted, Instagram). */
const PREVIEW_HEIGHT = Math.round(SCREEN_W * (5 / 4));

type ScreenPhase =
  | 'loading' // initial data fetch
  | 'populated' // image + options ready
  | 'empty' // no image URI passed
  | 'error' // fetch or processing error
  | 'applied'; // enhancement applied (demo)

export default function AIPhotoEnhancementScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isOffline } = useConnectivity();

  const imageUri = route.params.imageUri;
  const itemId = route.params.itemId;

  const [phase, setPhase] = useState<ScreenPhase>('loading');
  const [options, setOptions] = useState<EnhancementOption[]>([]);
  const [presets, setPresets] = useState<EnhancementPreset[]>([]);
  const [scenes, setScenes] = useState<BackgroundScene[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [result, setResult] = useState<EnhancementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAfter, setShowAfter] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // -- Initial data fetch --------------------------------------------------
  const loadAll = useCallback(async () => {
    if (!imageUri) {
      setPhase('empty');
      return;
    }
    setPhase('loading');
    setError(null);
    try {
      const [opts, pres, scns] = await Promise.all([
        fetchEnhancementOptions(),
        fetchEnhancementPresets(),
        fetchBackgroundScenes(),
      ]);
      setOptions(opts);
      setPresets(pres);
      setScenes(scns);
      setPhase('populated');
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e && 'message' in e
          ? (e as Error).message
          : 'Could not load enhancement options. Try again.';
      setError(msg);
      setPhase('error');
    }
  }, [imageUri]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // -- Option selection ----------------------------------------------------
  const handleSelectOption = useCallback(
    (option: EnhancementOption) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      haptic.patterns.tabSwitch();
      setSelectedOptionId(option.id);
      setSelectedPresetId(null);
      if (option.type === 'background_replace') {
        setShowBackgroundPicker(true);
      } else {
        setShowBackgroundPicker(false);
      }
    },
    [haptic],
  );

  const handleSelectPreset = useCallback((preset: EnhancementPreset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    haptic.patterns.tabSwitch();
    setSelectedPresetId(preset.id);
    setSelectedOptionId(null);
    setShowBackgroundPicker(false);
  }, [haptic]);

  const handleSelectScene = useCallback((scene: BackgroundScene) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    haptic.patterns.tabSwitch();
    setSelectedSceneId(scene.id);
  }, [haptic]);

  // -- Apply enhancement ---------------------------------------------------
  const handleApply = useCallback(async () => {
    if (!imageUri) return;
    if (isOffline) {
      setError('You appear to be offline. Check your connection and try again.');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    }
    setIsApplying(true);
    setError(null);
    try {
      let res: EnhancementResult;
      if (selectedPresetId) {
        res = await applyPreset(imageUri, selectedPresetId);
      } else if (showBackgroundPicker && selectedSceneId) {
        res = await replaceBackground(imageUri, selectedSceneId);
      } else if (selectedOptionId) {
        res = await applyEnhancement(imageUri, selectedOptionId);
      } else {
        setIsApplying(false);
        return;
      }
      setResult(res);
      setShowAfter(true);
      setPhase('applied');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      haptic.patterns.save();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e && 'message' in e
          ? (e as Error).message
          : 'Enhancement failed. Try again.';
      setError(msg);
      setPhase('error');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } finally {
      setIsApplying(false);
    }
  }, [imageUri, isOffline, selectedOptionId, selectedPresetId, selectedSceneId, showBackgroundPicker, haptic]);

  // -- Revert --------------------------------------------------------------
  const handleRevert = useCallback(async () => {
    if (!result) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    haptic.patterns.toggle();
    setShowAfter(false);
    setResult(null);
    setPhase('populated');
  }, [result, haptic]);

  // -- Save (return to listing flow) ---------------------------------------
  const handleSave = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // In demo mode, no real enhancement was applied — we return the original
    // URI truthfully. The listing flow continues with the original image.
    navigation.goBack();
  }, [navigation]);

  // -- Comparison toggle ---------------------------------------------------
  const handleToggleCompare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAfter((prev) => !prev);
  }, []);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const selectedOption = useMemo(
    () => options.find((o) => o.id === selectedOptionId) ?? null,
    [options, selectedOptionId],
  );
  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );
  const selectedScene = useMemo(
    () => scenes.find((s) => s.id === selectedSceneId) ?? null,
    [scenes, selectedSceneId],
  );

  const canApply = (selectedOptionId || selectedPresetId) && phase === 'populated';
  const canRevert = result !== null && phase === 'applied';

  // The displayed image — in demo mode, before and after are the same image.
  const displayUri = imageUri;

  // -- Render --------------------------------------------------------------
  if (phase === 'empty' || !imageUri) {
    return (
      <View style={[styles.root, styles.centerContent, { backgroundColor: colors.background }]}>
        <Header
          title="Enhance Photo"
          onBack={() => navigation.goBack()}
          colors={colors}
          styles={styles}
        />
        <CanonicalEmptyState
          icon="image-outline"
          title="Select an image to enhance"
          subtitle="Choose a photo from the listing flow to access AI enhancement tools."
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header
        title="Enhance Photo"
        onBack={() => navigation.goBack()}
        colors={colors}
        styles={styles}
      />

      {isOffline && <OfflineBanner colors={colors} styles={styles} />}

      {/* Demo mode banner — truthful labelling per AGENTS.md §11 */}
      {AI_PHOTO_DEMO_MODE && <DemoBanner colors={colors} styles={styles} />}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 180 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        {/* -- Image preview (top ~50% of screen) -- */}
        <View style={styles.previewWrap}>
          <View
            style={styles.previewFrame}
          >
            <Image
              source={{ uri: displayUri }}
              style={styles.previewImage}
              resizeMode="cover"
              accessible
              accessibilityLabel={
                showAfter && result
                  ? 'Enhanced photo preview (demo — no changes applied)'
                  : 'Original photo preview'
              }
            />
            {/* Before/After label overlay */}
            <View style={styles.previewLabelRow}>
              <View
                style={[
                  styles.previewLabel,
                  {
                    backgroundColor: showAfter && result ? colors.surfaceAlt : colors.brand,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.previewLabelText,
                    { color: showAfter && result ? colors.textPrimary : colors.textInverse },
                  ]}
                >
                  {showAfter && result ? 'After (Demo)' : 'Before'}
                </Text>
              </View>
              {result && (
                <Pressable
                  style={[styles.compareToggle, { borderColor: colors.border }]}
                  onPress={handleToggleCompare}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle before and after comparison"
                  accessibilityHint="Switches between the original and enhanced preview"
                >
                  <Ionicons
                    name={showAfter ? 'eye-off-outline' : 'eye-outline'}
                    size={16}
                    color={colors.textPrimary}
                  />
                  <Text style={[styles.compareToggleText, { color: colors.textPrimary }]}>
                    {showAfter ? 'Show Before' : 'Show After'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Processing overlay */}
          {isApplying && (
            <ProcessingOverlay colors={colors} styles={styles} reducedMotion={reducedMotion} />
          )}
        </View>

        {/* -- Error state -- */}
        {phase === 'error' && error && (
          <ErrorBanner
            message={error}
            onRetry={() => {
              setError(null);
              loadAll();
            }}
            onDismiss={() => {
              setError(null);
              setPhase('populated');
            }}
            colors={colors}
            styles={styles}
          />
        )}

        {/* -- Loading skeleton -- */}
        {phase === 'loading' && <LoadingSkeleton colors={colors} styles={styles} />}

        {/* -- Enhancement options rail -- */}
        {(phase === 'populated' || phase === 'applied') && options.length > 0 && (
          <View>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Enhancements
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.optionsRail}
            >
              {options.map((option) => {
              const isSelected = selectedOptionId === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => handleSelectOption(option)}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.description}
                  accessibilityState={{ selected: isSelected }}
                >
                  <View
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: isSelected ? colors.brand : colors.surface,
                        borderColor: isSelected ? colors.brand : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={22}
                      color={isSelected ? colors.textInverse : colors.textPrimary}
                    />
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: isSelected ? colors.textInverse : colors.textPrimary },
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            </ScrollView>
          </View>
        )}

        {/* -- Presets section -- */}
        {(phase === 'populated' || phase === 'applied') && presets.length > 0 && (
          <View
            style={styles.presetsSection}
          >
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Presets
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetsRail}
            >
              {presets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => handleSelectPreset(preset)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preset: ${preset.label}`}
                    accessibilityHint={preset.description}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: isSelected ? colors.brand : colors.surface,
                          borderColor: isSelected ? colors.brand : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetLabel,
                          { color: isSelected ? colors.textInverse : colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {preset.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {selectedPreset && (
              <Text style={[styles.presetDescription, { color: colors.textMuted }]}>
                {selectedPreset.description}
              </Text>
            )}
          </View>
        )}

        {/* -- Background scene picker -- */}
        {showBackgroundPicker && scenes.length > 0 && (phase === 'populated' || phase === 'applied') && (
          <View
            style={styles.scenePickerSection}
          >
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Background Scene
            </Text>
            <View style={styles.sceneGrid}>
              {scenes.map((scene) => {
                const isSelected = selectedSceneId === scene.id;
                return (
                  <Pressable
                    key={scene.id}
                    onPress={() => handleSelectScene(scene)}
                    accessibilityRole="button"
                    accessibilityLabel={`Background scene: ${scene.label}`}
                    accessibilityHint={`Category: ${scene.category}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={[
                        styles.sceneTile,
                        {
                          borderColor: isSelected ? colors.brand : colors.border,
                          borderWidth: isSelected ? Stroke.emphasis : Stroke.standard,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: scene.thumbnailUri }}
                        style={styles.sceneThumb}
                        resizeMode="cover"
                      />
                      <Text
                        style={[
                          styles.sceneLabel,
                          { color: colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {scene.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* -- Applied result message (truthful demo) -- */}
        {/* 15 = 8% opacity, 40 = 25% opacity (hex alpha suffix) */}
        {phase === 'applied' && result && (
          <View
            style={[styles.appliedMessage, { backgroundColor: `${colors.warning}15`, borderColor: `${colors.warning}40` }]}
          >
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={[styles.appliedMessageText, { color: colors.textPrimary }]}>
              {AI_PHOTO_DEMO_MODE
                ? 'Demo: No changes were made to your image. Connect the AI service to enable real enhancement.'
                : 'Enhancement applied. Compare, revert, or save.'}
            </Text>
          </View>
        )}

        {/* -- AI trust signal (confidence + source + undo) -- */}
        {phase === 'applied' && result && (
          <AITrustSignal
            confidence="low"
            source={
              AI_PHOTO_DEMO_MODE
                ? 'Demo mode — no actual enhancement performed'
                : 'Applied selected enhancement preset'
            }
            context={
              AI_PHOTO_DEMO_MODE
                ? 'Your original image is unchanged'
                : 'Enhancement applied to the selected photo'
            }
            expandedReasoning={
              AI_PHOTO_DEMO_MODE
                ? 'This is a demo surface. The preview shows your original image unchanged. Connect the AI photo-enhancement service to perform real edits.'
                : 'The selected enhancement options were applied to your photo. Use Revert to restore the original.'
            }
            isDemo={AI_PHOTO_DEMO_MODE}
            onUndo={canRevert ? () => void handleRevert() : undefined}
            style={styles.appliedTrustSignal}
          />
        )}
      </ScrollView>

      {/* -- Sticky action footer -- */}
      {(phase === 'populated' || phase === 'applied') && (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + Space.sm,
            },
          ]}
        >
          <View style={styles.footerActionRow}>
            <AppButton
              title="Revert"
              onPress={handleRevert}
              disabled={!canRevert}
              variant="secondary"
              size="md"
              accessibilityLabel="Revert enhancement"
              accessibilityHint="Restores the original image"
              hapticFeedback="light"
              style={styles.footerSecondaryBtn}
            />
            <AppButton
              title={AI_PHOTO_DEMO_MODE ? 'Preview (Demo)' : 'Apply'}
              onPress={handleApply}
              disabled={!canApply}
              loading={isApplying}
              variant="primary"
              size="md"
              accessibilityLabel={
                AI_PHOTO_DEMO_MODE ? 'Preview enhancement in demo mode' : 'Apply enhancement'
              }
              accessibilityHint="Applies the selected enhancement to the photo"
              icon={<Ionicons name="color-filter-outline" size={16} color={colors.textInverse} />}
              style={styles.footerPrimaryBtn}
            />
          </View>
          <AppButton
            title="Save"
            onPress={handleSave}
            variant="ghost"
            size="md"
            accessibilityLabel="Save and return to listing"
            accessibilityHint="Returns to the listing creation flow"
            hapticFeedback="light"
          />
        </View>
      )}
    </View>
  );
}

// ===========================================================================
// Header
// ===========================================================================

interface HeaderProps {
  title: string;
  onBack: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function Header({ title, onBack, colors, styles }: HeaderProps) {
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <AnimatedPressable
        style={styles.iconBtn}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        scaleValue={0.92}
        hapticFeedback="light"
        activeOpacity={0.62}
      >
        <Ionicons name="arrow-back" size={Control.icon} color={colors.textPrimary} />
      </AnimatedPressable>
      <View style={styles.headerTitleWrap}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.iconBtnPlaceholder} />
    </View>
  );
}

// ===========================================================================
// Demo banner — truthful labelling per AGENTS.md §11
// ===========================================================================

interface DemoBannerProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function DemoBanner({ colors, styles }: DemoBannerProps) {
  // 15 = 8% opacity, 30 = 19% opacity (hex alpha suffix)
  return (
    <View style={[styles.demoBanner, { backgroundColor: `${colors.warning}15`, borderBottomColor: `${colors.warning}30` }]}>
      <Ionicons name="flask-outline" size={16} color={colors.warning} />
      <Text style={[styles.demoBannerText, { color: colors.textPrimary }]}>
        Demo Mode — AI enhancement is not yet connected. This preview shows the planned capability.
      </Text>
    </View>
  );
}

// ===========================================================================
// Offline banner
// ===========================================================================

interface OfflineBannerProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function OfflineBanner({ colors, styles }: OfflineBannerProps) {
  return (
    <View style={[styles.offlineBanner, { backgroundColor: `${colors.danger}10`, borderBottomColor: `${colors.danger}30` }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
      <Text style={[styles.offlineBannerText, { color: colors.danger }]}>
        You appear to be offline. Enhancement requires a connection.
      </Text>
    </View>
  );
}

// ===========================================================================
// Loading skeleton
// ===========================================================================

function LoadingSkeleton({ colors, styles }: { colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.skeletonWrap}>
      {/* Options rail skeleton */}
      <SkeletonLoader width={80} height={64} borderRadius={Radius.md} />
      <SkeletonLoader width={80} height={64} borderRadius={Radius.md} />
      <SkeletonLoader width={80} height={64} borderRadius={Radius.md} />
      {/* Presets skeleton */}
      <SkeletonLoader width={120} height={36} borderRadius={Radius.md} style={{ marginTop: Space.md }} />
      <SkeletonLoader width={120} height={36} borderRadius={Radius.md} />
    </View>
  );
}

// ===========================================================================
// Processing overlay
// ===========================================================================

interface ProcessingOverlayProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
}

function ProcessingOverlay({ colors, styles, reducedMotion }: ProcessingOverlayProps) {
  const scanY = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    scanY.value = withTiming(1, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) });
  }, [reducedMotion, scanY]);

  const scanStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(scanY.value, [0, 1], [0, PREVIEW_HEIGHT - 4]),
      },
    ],
  }));

  return (
    <View style={styles.processingOverlay}>
      <View style={styles.processingContent}>
        <ActivityIndicator size="large" color={colors.textInverse} />
        <Text style={[styles.processingText, { color: colors.textInverse }]}>
          Processing…
        </Text>
      </View>
      {!reducedMotion && (
        <Reanimated.View
          style={[styles.scanLineOverlay, { backgroundColor: colors.textInverse }, scanStyle]}
        />
      )}
    </View>
  );
}

// ===========================================================================
// Error banner
// ===========================================================================

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function ErrorBanner({ message, onRetry, onDismiss, colors, styles }: ErrorBannerProps) {
  return (
    <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }]}>
      <View style={styles.errorHeader}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
        <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={3}>
          {message}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      <Pressable
        style={[styles.errorRetryBtn, { borderColor: colors.danger }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={[styles.errorRetryText, { color: colors.danger }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    centerContent: {
      justifyContent: 'center',
    },
    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconBtnPlaceholder: {
      width: Control.hit,
      height: Control.hit,
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      marginHorizontal: Space.sm,
    },
    headerTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    // Demo banner
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: Stroke.standard,
    },
    demoBannerText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      lineHeight: Type.caption.lineHeight,
    },
    // Offline banner
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: Stroke.standard,
    },
    offlineBannerText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
    },
    // Scroll
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
    },
    // Preview
    previewWrap: {
      marginBottom: Space.md,
    },
    previewFrame: {
      width: '100%',
      height: PREVIEW_HEIGHT,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewLabelRow: {
      position: 'absolute',
      top: Space.sm,
      left: Space.sm,
      right: Space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    previewLabel: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
    },
    previewLabelText: {
      fontSize: Type.meta.size,
      fontWeight: '700',
      letterSpacing: Type.meta.letterSpacing,
    },
    compareToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      backgroundColor: `${colors.background}E6`,
    },
    compareToggleText: {
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
    },
    // Processing overlay
    processingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.lg,
      overflow: 'hidden',
    },
    processingContent: {
      alignItems: 'center',
      gap: Space.sm,
    },
    processingText: {
      fontSize: Type.bodyStrong.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    scanLineOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: Stroke.emphasis,
      opacity: 0.6,
    },
    // Section label
    sectionLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
      marginBottom: Space.sm,
    },
    // Options rail
    optionsRail: {
      gap: Space.sm,
      paddingRight: Space.md,
    },
    optionChip: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      width: Space.xl + Control.hit,
      paddingVertical: Space.sm,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
    },
    optionLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      textAlign: 'center',
    },
    // Presets
    presetsSection: {
      marginTop: Space.lg,
    },
    presetsRail: {
      gap: Space.sm,
      paddingRight: Space.md,
    },
    presetChip: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
    },
    presetLabel: {
      fontSize: Type.body.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    presetDescription: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.sm,
      lineHeight: Type.caption.lineHeight,
    },
    // Scene picker
    scenePickerSection: {
      marginTop: Space.lg,
    },
    sceneGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    sceneTile: {
      width: (SCREEN_W - Space.md * 2 - Space.sm) / 2,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      borderWidth: Stroke.standard,
    },
    sceneThumb: {
      width: '100%',
      height: Space.xxl + Space.xxl + Space.xs,
      backgroundColor: colors.surfaceAlt,
    },
    sceneLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm,
    },
    // Applied message
    appliedMessage: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      padding: Space.sm + 2,
      marginTop: Space.lg,
    },
    appliedMessageText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      lineHeight: Type.caption.lineHeight,
    },
    appliedTrustSignal: {
      marginTop: Space.sm,
    },
    // Skeleton
    skeletonWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginTop: Space.md,
    },
    skeletonBlock: {
      borderRadius: Radius.md,
    },
    // Error banner
    errorBanner: {
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      padding: Space.sm + 2,
      marginBottom: Space.md,
    },
    errorHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
    },
    errorText: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: TypeStyles.body.fontFamily,
    },
    errorRetryBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      marginTop: Space.xs,
    },
    errorRetryText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    // Footer
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      gap: Space.xs,
    },
    footerActionRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    footerPrimaryBtn: {
      flex: 1,
    },
    footerSecondaryBtn: {
      flex: 0,
      minWidth: Space.xxl + Space.xxl + Space.xs,
    },
  });
}
