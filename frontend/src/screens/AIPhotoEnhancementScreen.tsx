/**
 * AI Photo Enhancement Screen — fail-closed per report #14 / AGENTS.md §11/§37.
 * Fetches capability from the backend and shows an honest "not yet available"
 * state when no provider is configured. Never claims an enhancement was
 * applied when nothing happened — no false success, no scanline theatre.
 *
 * Before/after comparison: a draggable slider (WCAG 2.2 §2.5.7 draggable
 * movement) plus a press-and-hold secondary gesture and three quick-position
 * buttons (Before / Split / After) as the §2.5.7 non-drag alternative.
 *
 * State machine (report §7.2):
 *   checking → unavailable | available
 *   available → submitting → candidate_ready | error | outcome_unknown
 *   candidate_ready → applied (Use Photo) | available (Revert)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  ScrollView,
  Pressable,
  AccessibilityInfo,
  ActivityIndicator,
  PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { useConnectivity } from '../hooks/useConnectivity';
import { useHaptic } from '../hooks/useHaptic';
import {
  fetchEnhancementCapability,
  invalidateEnhancementCapabilityCache,
  derivePresetsFromOperations,
  getBackgroundScenes,
  applyEnhancement,
  applyPreset,
  replaceBackground,
  revertEnhancement,
  cancelEnhancementJob,
  EnhancementCapabilityError,
  type EnhancementOption,
  type EnhancementOptionType,
  type EnhancementPreset,
  type BackgroundScene,
  type EnhancementResult,
  type EnhancementCapability,
  type EnhancementProvenance } from '../services/aiPhotoEnhancementApi';
import { setEnhancementResult } from '../services/enhancementResultHandoff';

type Props = NativeStackScreenProps<RootStackParamList, 'AIPhotoEnhancement'>;

const { width: SCREEN_W } = Dimensions.get('window');
/** 4:5 aspect ratio preview — marketplace standard (Depop, Vinted, Instagram). */
const PREVIEW_HEIGHT = Math.round(SCREEN_W * (5 / 4));
/** Media stage width — screen minus the scroll content horizontal padding. */
const MEDIA_WIDTH = SCREEN_W - Space.md * 2;

type ScreenPhase =
  | 'checking' // fetching capability from server
  | 'unavailable' // server says not available (fail-closed)
  | 'available' // capability confirmed, tools ready
  | 'submitting' // job submitted, honest stage text
  | 'candidate_ready' // enhancement complete, show before/after
  | 'error' // honest error with retry
  | 'outcome_unknown'; // network dropped during submit

// -- Operation-specific copy (report §7.2 + §6) ----------------------------

function getStageText(type: EnhancementOptionType | null): string {
  switch (type) {
    case 'background_removal': return 'Removing background…';
    case 'color_correction': return 'Correcting colour…';
    case 'auto_crop': return 'Cropping and centring…';
    case 'background_replace': return 'Replacing background…';
    default: return 'Processing…';
  }
}

function getOperationSummary(type: EnhancementOptionType | null): string {
  switch (type) {
    case 'background_removal': return 'Background removed, item preserved.';
    case 'color_correction': return 'Colours adjusted for accuracy.';
    case 'background_replace': return 'Background replaced with a new scene.';
    default: return 'Photo enhanced.';
  }
}

function disclosureLabel(type: EnhancementProvenance['disclosureType']): string {
  switch (type) {
    case 'standard_editing': return 'Standard editing';
    case 'ai_assisted': return 'AI-assisted edit';
    case 'ai_generated': return 'AI-generated';
    default: return 'Edited';
  }
}

export default function AIPhotoEnhancementScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { isOffline } = useConnectivity();

  const imageUri = route.params.imageUri;

  const [phase, setPhase] = useState<ScreenPhase>('checking');
  const [capability, setCapability] = useState<EnhancementCapability | null>(null);
  const [options, setOptions] = useState<EnhancementOption[]>([]);
  const [presets, setPresets] = useState<EnhancementPreset[]>([]);
  const [scenes, setScenes] = useState<BackgroundScene[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [showScenes, setShowScenes] = useState(false);
  const [result, setResult] = useState<EnhancementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageText, setStageText] = useState('Preparing…');
  const [activeOperationType, setActiveOperationType] = useState<EnhancementOptionType | null>(null);

  // -- Before/after comparison state (WCAG 2.2 §2.5.7) ---------------------
  // sliderPosition: 0 = full Before, 100 = full After, 50 = split.
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isHolding, setIsHolding] = useState(false);
  const [stageWidth, setStageWidth] = useState(MEDIA_WIDTH);

  const sliderPosRef = useRef(50);
  const stageWidthRef = useRef(MEDIA_WIDTH);
  const dragStartPosRef = useRef(50);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;
  stageWidthRef.current = stageWidth;

  const updateSliderPosition = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(next)));
    sliderPosRef.current = clamped;
    setSliderPosition(clamped);
  }, []);

  // PanResponder drives the draggable slider handle. Uses refs so the
  // responder (created once) never reads stale state.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dx) > 2,
      onPanResponderGrant: () => {
        dragStartPosRef.current = sliderPosRef.current;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const pct = (gestureState.dx / stageWidthRef.current) * 100;
        updateSliderPosition(dragStartPosRef.current + pct);
      },
      onPanResponderRelease: () => {
        hapticRef.current.light();
      },
      onPanResponderTerminationRequest: () => false }),
  ).current;

  // -- Capability check -----------------------------------------------------
  const checkCapability = useCallback(async () => {
    setPhase('checking');
    setError(null);
    try {
      const cap = await fetchEnhancementCapability();
      setCapability(cap);
      if (cap.available) {
        setOptions(cap.operations);
        setPresets(derivePresetsFromOperations(cap.operations));
        setScenes(getBackgroundScenes());
        setPhase('available');
      } else {
        setPhase('unavailable');
      }
    } catch {
      // Fail-closed: any error → unavailable
      setPhase('unavailable');
    }
  }, []);

  useEffect(() => {
    if (!imageUri) return;
    checkCapability();
  }, [checkCapability, imageUri]);

  // -- Operation selection --------------------------------------------------
  const handleSelectOperation = useCallback(
    (op: EnhancementOption) => {
      haptic.patterns.tabSwitch();
      setSelectedOperationId(op.id);
      setSelectedPresetId(null);
      setShowScenes(op.type === 'background_replace');
      if (op.type !== 'background_replace') {
        setSelectedSceneId(null);
      }
    },
    [haptic],
  );

  const handleSelectPreset = useCallback(
    (preset: EnhancementPreset) => {
      haptic.patterns.tabSwitch();
      setSelectedPresetId(preset.id);
      setSelectedOperationId(null);
      setShowScenes(false);
      setSelectedSceneId(null);
    },
    [haptic],
  );

  const handleSelectScene = useCallback(
    (scene: BackgroundScene) => {
      haptic.patterns.tabSwitch();
      setSelectedSceneId(scene.id);
    },
    [haptic],
  );

  // -- Apply enhancement ----------------------------------------------------
  const handleApply = useCallback(async () => {
    if (!imageUri) return;
    if (isOffline) {
      setError('You appear to be offline. Check your connection and try again.');
      haptic.error();
      setPhase('error');
      return;
    }

    const selectedOp = options.find((o) => o.id === selectedOperationId);
    const selectedPreset = presets.find((p) => p.id === selectedPresetId);

    // Resolve the dominant operation type for honest stage text + summary.
    let activeType: EnhancementOptionType | null = null;
    if (showScenes && selectedSceneId) {
      activeType = 'background_replace';
    } else if (selectedOp) {
      activeType = selectedOp.type;
    } else if (selectedPreset) {
      const firstOp = options.find((o) => o.id === selectedPreset.operationIds[0]);
      activeType = firstOp?.type ?? null;
    }
    setActiveOperationType(activeType);

    setPhase('submitting');
    setError(null);
    setStageText(getStageText(activeType));
    cancelledRef.current = false;

    try {
      let res: EnhancementResult;
      if (selectedPresetId) {
        res = await applyPreset(imageUri, selectedPresetId);
      } else if (showScenes && selectedSceneId) {
        res = await replaceBackground(imageUri, selectedSceneId);
      } else if (selectedOperationId) {
        res = await applyEnhancement(imageUri, selectedOperationId);
      } else {
        setPhase('available');
        return;
      }

      // If the user cancelled during submitting, abandon the candidate and
      // ask the backend to cancel the now-known job id.
      if (cancelledRef.current) {
        cancelEnhancementJob(res.jobId).catch(() => {});
        setPhase('available');
        return;
      }

      setResult(res);
      updateSliderPosition(50);
      setIsHolding(false);
      setPhase('candidate_ready');
      haptic.patterns.save();
      AccessibilityInfo.announceForAccessibility(
        `Enhancement complete: ${res.appliedOperationLabel}. ${getOperationSummary(activeType)} Use the slider or buttons to compare before and after.`,
      );
    } catch (e: unknown) {
      if (e instanceof EnhancementCapabilityError) {
        setError('AI photo enhancement is not available right now.');
        setPhase('unavailable');
        haptic.error();
        return;
      }
      // Network drop during submit → outcome_unknown (not error, not success)
      const msg =
        typeof e === 'object' && e && 'message' in e
          ? (e as Error).message
          : 'Enhancement failed.';
      // If the error looks like a network issue, show outcome_unknown
      if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
        setError('The connection dropped. The enhancement may still be processing.');
        setPhase('outcome_unknown');
      } else {
        setError(msg);
        setPhase('error');
      }
      haptic.error();
    }
  }, [imageUri, isOffline, options, presets, selectedOperationId, selectedPresetId, selectedSceneId, showScenes, haptic, updateSliderPosition]);

  // -- Cancel an in-flight submit (local abandon; server cancel on result) -
  const handleCancelSubmit = useCallback(() => {
    cancelledRef.current = true;
    haptic.light();
    setPhase('available');
  }, [haptic]);

  // -- Revert ---------------------------------------------------------------
  const handleRevert = useCallback(async () => {
    if (!result) return;
    haptic.patterns.toggle();
    await revertEnhancement(result.id);
    setResult(null);
    updateSliderPosition(50);
    setIsHolding(false);
    setPhase('available');
  }, [result, haptic, updateSliderPosition]);

  // -- Use Photo (save enhanced result to listing flow) ---------------------
  const handleUsePhoto = useCallback(() => {
    if (!result) return;
    haptic.patterns.save();
    // Hand off the result to the caller via the module-level store.
    // The parent screen consumes it in useFocusEffect when it regains focus.
    setEnhancementResult({
      originalUri: result.originalUri,
      enhancedUri: result.enhancedUri,
      appliedOperationLabel: result.appliedOperationLabel });
    navigation.goBack();
  }, [result, haptic, navigation]);

  // -- Before/after comparison (press-and-hold secondary gesture) -----------
  // Hold = reveal full Before; release = return to slider position.
  const handlePressInCompare = useCallback(() => {
    if (phase !== 'candidate_ready' || !result) return;
    holdTimerRef.current = setTimeout(() => {
      setIsHolding(true);
      haptic.light();
    }, 150);
  }, [phase, result, haptic]);

  const handlePressOutCompare = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
  }, []);

  const handleToggleCompare = useCallback(() => {
    if (phase !== 'candidate_ready' || !result) return;
    haptic.light();
    updateSliderPosition(sliderPosRef.current >= 50 ? 0 : 100);
  }, [phase, result, haptic, updateSliderPosition]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // -- Retry ----------------------------------------------------------------
  const handleRetry = useCallback(() => {
    invalidateEnhancementCapabilityCache();
    setError(null);
    setResult(null);
    setSelectedOperationId(null);
    setSelectedPresetId(null);
    setSelectedSceneId(null);
    setShowScenes(false);
    updateSliderPosition(50);
    setIsHolding(false);
    checkCapability();
  }, [checkCapability, updateSliderPosition]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  const canApply = (selectedOperationId || selectedPresetId) && phase === 'available';

  // Reveal math: sliderPosition = % After visible. Before sits on the left,
  // clipped to (100 - sliderPosition)%. Holding overrides to full Before.
  const beforePct = isHolding ? 100 : 100 - sliderPosition;
  const afterPct = isHolding ? 0 : sliderPosition;
  const descriptiveText = `${beforePct}% before, ${afterPct}% after`;
  const isShowingAfter = sliderPosition >= 50;

  // -- Empty state (no image URI) -------------------------------------------
  if (!imageUri) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Header title="Enhance Photo" onBack={() => navigation.goBack()} colors={colors} styles={styles} />
        <View style={styles.emptyWrap}>
          <Ionicons name="image-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            No photo selected
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Choose a photo from the listing flow to enhance.
          </Text>
        </View>
      </View>
    );
  }

  // -- Render ---------------------------------------------------------------
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="Enhance Photo" onBack={() => navigation.goBack()} colors={colors} styles={styles} />

      {isOffline && phase !== 'candidate_ready' && (
        <OfflineNotice colors={colors} styles={styles} />
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Media stage — the dominant object ── */}
        <View
          style={styles.mediaStage}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            stageWidthRef.current = w;
            setStageWidth(w);
          }}
        >
          <Pressable
            onPressIn={handlePressInCompare}
            onPressOut={handlePressOutCompare}
            delayLongPress={150}
            accessibilityRole="image"
            accessibilityLabel={
              result
                ? `Comparison photo. ${descriptiveText}. Drag the slider to compare before and after.`
                : 'Photo preview'
            }
          >
            {/* After image — base layer (full) */}
            <Image
              source={{ uri: result?.enhancedUri ?? imageUri }}
              style={styles.mediaImage}
              resizeMode="cover"
            />
            {/* Before image — clipped overlay on the left portion */}
            {result && (
              <View style={[styles.beforeOverlay, { width: `${beforePct}%` }]}>
                <Image
                  source={{ uri: result.originalUri }}
                  style={[styles.mediaImage, { width: stageWidth }]}
                  resizeMode="cover"
                />
              </View>
            )}
            {/* Before / After labels */}
            {result && (
              <View style={styles.mediaLabelRow}>
                <View style={[styles.mediaLabel, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.mediaLabelText, { color: colors.textPrimary }]}>
                    Before
                  </Text>
                </View>
                <View style={[styles.mediaLabel, { backgroundColor: colors.brand }]}>
                  <Text style={[styles.mediaLabelText, { color: colors.textInverse }]}>
                    After
                  </Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* Draggable slider handle — vertical 2pt line with a 44pt target */}
          {result && (
            <View
              style={[styles.sliderHandle, { left: `${sliderPosition}%` }]}
              {...panResponder.panHandlers}
              accessibilityRole="adjustable"
              accessibilityLabel="Before and after comparison slider"
              accessibilityValue={{ min: 0, max: 100, now: sliderPosition, text: descriptiveText }}
              accessibilityActions={[
                { name: 'increment', label: 'Show more after' },
                { name: 'decrement', label: 'Show more before' },
              ]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'increment') {
                  updateSliderPosition(sliderPosRef.current + 10);
                } else if (e.nativeEvent.actionName === 'decrement') {
                  updateSliderPosition(sliderPosRef.current - 10);
                }
              }}
            >
              <View style={styles.sliderLine} />
              <View style={[styles.sliderKnob, { backgroundColor: colors.brand }]}>
                <Ionicons name="swap-horizontal" size={16} color={colors.textInverse} />
              </View>
            </View>
          )}

          {/* Submitting overlay — honest stage text + spinner, no scanline */}
          {phase === 'submitting' && (
            <View style={[styles.submittingOverlay, { backgroundColor: colors.overlay }]}>
              <View style={styles.submittingRow}>
                <ActivityIndicator size="small" color={colors.textInverse} />
                <Text style={[styles.submittingText, { color: colors.textInverse }]}>
                  {stageText}
                </Text>
              </View>
              <Text style={[styles.submittingHint, { color: colors.scrimTextSecondary }]}>
                Keep the app open
              </Text>
              <Pressable
                onPress={handleCancelSubmit}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Cancel enhancement"
              >
                <Text style={[styles.cancelLink, { color: colors.textInverse }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Quick-position buttons (WCAG §2.5.7 non-drag alternative) ── */}
        {phase === 'candidate_ready' && result && (
          <View style={styles.quickPosRow}>
            {([
              { label: 'Before', pos: 0, hint: 'Show the original photo' },
              { label: 'Split', pos: 50, hint: 'Show a 50/50 split' },
              { label: 'After', pos: 100, hint: 'Show the enhanced photo' },
            ] as const).map(({ label, pos, hint }) => {
              const isSelected = sliderPosition === pos;
              return (
                <Pressable
                  key={label}
                  onPress={() => { haptic.light(); updateSliderPosition(pos); }}
                  style={styles.quickPosBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} view`}
                  accessibilityHint={hint}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[styles.quickPosText, { color: isSelected ? colors.brand : colors.textSecondary }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Checking state ── */}
        {phase === 'checking' && (
          <View style={styles.stateBlock}>
            <Text style={[styles.stateTitle, { color: colors.textSecondary }]}>Checking availability…</Text>
          </View>
        )}

        {/* ── Unavailable state — honest, fail-closed ── */}
        {phase === 'unavailable' && (
          <View style={styles.stateBlock}>
            <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>Not yet available</Text>
            <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
              AI photo enhancement is being prepared. Your original photo is unchanged — you can still use it in your listing.
            </Text>
            <RetryLink label="Check again" onPress={handleRetry} colors={colors} styles={styles} />
          </View>
        )}

        {/* ── Error state ── */}
        {phase === 'error' && error && (
          <View style={styles.stateBlock}>
            <Text style={[styles.stateTitle, { color: colors.danger }]}>Something went wrong</Text>
            <Text style={[styles.stateBody, { color: colors.textSecondary }]}>{error}</Text>
            <RetryLink label="Try again" onPress={handleRetry} colors={colors} styles={styles} />
          </View>
        )}

        {/* ── Outcome unknown — network dropped during submit ── */}
        {phase === 'outcome_unknown' && (
          <View style={styles.stateBlock}>
            <Ionicons name="help-circle-outline" size={24} color={colors.warning} />
            <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>Check result</Text>
            <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
              {error ?? 'The connection dropped during enhancement. The job may still be processing.'}
            </Text>
            <View style={styles.unknownActions}>
              <RetryLink label="Retry safely" onPress={handleRetry} colors={colors} styles={styles} />
            </View>
          </View>
        )}

        {/* ── Tool strip — operations (only when available) ── */}
        {phase === 'available' && options.length > 0 && (
          <View style={styles.toolStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolStripContent}>
              {options.map((op) => {
                const isSelected = selectedOperationId === op.id;
                return (
                  <Pressable
                    key={op.id}
                    onPress={() => handleSelectOperation(op)}
                    accessibilityRole="button"
                    accessibilityLabel={op.label}
                    accessibilityHint={op.description}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[styles.toolChip, {
                      backgroundColor: isSelected ? colors.brand : 'transparent',
                      borderColor: isSelected ? colors.brand : colors.borderSubtle }]}>
                      <Text style={[styles.toolChipText, { color: isSelected ? colors.textInverse : colors.textPrimary }]} numberOfLines={1}>
                        {op.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Presets — contextual, not a competing rail ── */}
        {phase === 'available' && presets.length > 0 && (
          <View style={styles.presetsRow}>
            <Text style={[styles.presetsLabel, { color: colors.textMuted }]}>Presets</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsContent}>
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
                    <View style={[styles.presetChip, {
                      backgroundColor: isSelected ? colors.brandSubtle : 'transparent',
                      borderColor: isSelected ? colors.brand : colors.borderSubtle }]}>
                      <Text style={[styles.presetChipText, { color: isSelected ? colors.brand : colors.textSecondary }]} numberOfLines={1}>
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

        {/* ── Scene picker — only when background replace is selected ── */}
        {showScenes && phase === 'available' && scenes.length > 0 && (
          <View style={styles.sceneSection}>
            <Text style={[styles.sceneLabel, { color: colors.textMuted }]}>Background</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneContent}>
              {scenes.map((scene) => {
                const isSelected = selectedSceneId === scene.id;
                return (
                  <Pressable
                    key={scene.id}
                    onPress={() => handleSelectScene(scene)}
                    accessibilityRole="button"
                    accessibilityLabel={`Background: ${scene.label}`}
                    accessibilityHint={`Category: ${scene.category}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[styles.sceneChip, {
                      backgroundColor: isSelected ? colors.brand : colors.surfaceAlt,
                      borderColor: isSelected ? colors.brand : colors.borderSubtle }]}>
                      <Text style={[styles.sceneChipText, { color: isSelected ? colors.textInverse : colors.textPrimary }]} numberOfLines={1}>
                        {scene.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Candidate ready — comparison hint + verification + provenance ── */}
        {phase === 'candidate_ready' && result && (
          <View style={styles.candidateInfo}>
            <View style={styles.compareHint}>
              <Ionicons name="swap-horizontal" size={16} color={colors.textMuted} />
              <Text style={[styles.compareHintText, { color: colors.textMuted }]}>
                Drag the slider to compare · {result.appliedOperationLabel}
              </Text>
              <Pressable
                onPress={handleToggleCompare}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={isShowingAfter ? 'Show original photo' : 'Show enhanced photo'}
              >
                <Text style={[styles.compareToggleLink, { color: colors.brand }]}>
                  {isShowingAfter ? 'Show Before' : 'Show After'}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.verifyText, { color: colors.textMuted }]}>
              Review the edges around the product to ensure nothing was cut off.
            </Text>
            <Text style={[styles.provenanceText, { color: colors.textMuted }]}>
              {disclosureLabel(result.provenance.disclosureType)} · {result.provenance.provider}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
      {(phase === 'available' || phase === 'candidate_ready') && (
        <View style={[styles.footer, {
          backgroundColor: colors.background,
          borderTopColor: colors.borderSubtle,
          paddingBottom: insets.bottom + Space.sm }]}>
          {phase === 'candidate_ready' ? (
            <View style={styles.footerRow}>
              <AppButton
                title="Revert"
                onPress={handleRevert}
                variant="ghost"
                size="md"
                accessibilityLabel="Revert enhancement"
                accessibilityHint="Discards the enhanced result and returns to the original"
                style={styles.footerSecondaryBtn}
              />
              <AppButton
                title="Use Photo"
                onPress={handleUsePhoto}
                variant="primary"
                size="md"
                accessibilityLabel="Use enhanced photo"
                accessibilityHint="Saves the enhanced photo and returns to the listing flow"
                style={styles.footerPrimaryBtn}
              />
            </View>
          ) : (
            <AppButton
              title="Generate Preview"
              onPress={handleApply}
              disabled={!canApply}
              variant="primary"
              size="md"
              accessibilityLabel="Generate preview"
              accessibilityHint="Applies the selected enhancement and shows a before/after preview"
              style={styles.footerFullBtn}
            />
          )}
        </View>
      )}
    </View>
  );
}

// ===========================================================================
// Retry link — shared by unavailable / error / outcome_unknown states
// ===========================================================================

interface RetryLinkProps {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function RetryLink({ label, onPress, colors, styles }: RetryLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.retryLink, { color: colors.brand }]}>{label}</Text>
    </Pressable>
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
    <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
      <AnimatedPressable
        style={styles.headerBack}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        scaleValue={0.92}
        hapticFeedback="light"
        activeOpacity={0.62}
      >
        <Ionicons name="arrow-back" size={Control.icon} color={colors.textPrimary} />
      </AnimatedPressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerBack} />
    </View>
  );
}

// ===========================================================================
// Offline notice
// ===========================================================================

interface OfflineNoticeProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function OfflineNotice({ colors, styles }: OfflineNoticeProps) {
  return (
    <View style={[styles.offlineNotice, { backgroundColor: colors.dangerSubtle }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
      <Text style={[styles.offlineNoticeText, { color: colors.danger }]}>
        Offline — enhancement requires a connection
      </Text>
    </View>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    // Header
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Space.sm, paddingVertical: Space.sm,
      borderBottomWidth: Stroke.hairline },
    headerBack: {
      width: Control.hit, height: Control.hit,
      justifyContent: 'center', alignItems: 'center' },
    headerTitle: {
      flex: 1, textAlign: 'center',
      fontSize: TypographyV2.sectionTitle.size, fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing, marginHorizontal: Space.sm },
    // Offline notice
    offlineNotice: {
      flexDirection: 'row', alignItems: 'center', gap: Space.xs,
      paddingHorizontal: Space.md, paddingVertical: Space.sm },
    offlineNoticeText: { flex: 1, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    // Scroll
    scrollContent: { paddingHorizontal: Space.md, paddingTop: Space.md },
    // Empty state
    emptyWrap: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: Space.xl, gap: Space.sm },
    emptyTitle: { fontSize: TypographyV2.sectionTitle.size, fontFamily: TypographyV2.sectionTitle.fontFamily },
    emptySubtitle: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, textAlign: 'center' },
    // Media stage — the dominant object
    mediaStage: {
      width: '100%', height: PREVIEW_HEIGHT, borderRadius: Radius.lg,
      overflow: 'hidden', backgroundColor: colors.surfaceAlt },
    mediaImage: { width: '100%', height: '100%' },
    beforeOverlay: { position: 'absolute', top: 0, left: 0, bottom: 0, overflow: 'hidden' },
    mediaLabelRow: {
      position: 'absolute', top: Space.sm, left: Space.sm, right: Space.sm,
      flexDirection: 'row', justifyContent: 'space-between' },
    mediaLabel: { paddingHorizontal: Space.sm, paddingVertical: Space.xs, borderRadius: Radius.full },
    mediaLabelText: {
      fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    // Draggable slider handle — 44pt transparent target, 2pt visible line
    sliderHandle: {
      position: 'absolute', top: 0, bottom: 0, width: Control.hit,
      justifyContent: 'center', alignItems: 'center',
      transform: [{ translateX: -Control.hit / 2 }] },
    sliderLine: {
      position: 'absolute', top: 0, bottom: 0, width: Stroke.emphasis,
      backgroundColor: colors.textInverse },
    sliderKnob: {
      width: Control.chrome, height: Control.chrome, borderRadius: Radius.full,
      justifyContent: 'center', alignItems: 'center' },
    // Quick-position buttons (Before / Split / After)
    quickPosRow: { flexDirection: 'row', marginTop: Space.sm, gap: Space.sm },
    quickPosBtn: {
      flex: 1, minHeight: Control.hit, justifyContent: 'center', alignItems: 'center',
      paddingVertical: Space.sm },
    quickPosText: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    // Submitting overlay — honest stage text + spinner, no scanline
    submittingOverlay: {
      ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', gap: Space.xs },
    submittingRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
    submittingText: { fontSize: TypographyV2.bodyStrong.size, fontFamily: TypographyV2.bodyStrong.fontFamily },
    submittingHint: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    cancelLink: {
      fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily,
      paddingVertical: Space.xs, marginTop: Space.xs },
    // State blocks (checking, unavailable, error, outcome_unknown)
    stateBlock: { paddingTop: Space.lg, paddingHorizontal: Space.sm, gap: Space.sm },
    stateTitle: {
      fontSize: TypographyV2.itemTitle.size, fontFamily: TypographyV2.itemTitle.fontFamily,
      letterSpacing: TypographyV2.itemTitle.letterSpacing },
    stateBody: {
      fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight + 2 },
    retryLink: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, paddingVertical: Space.xs },
    unknownActions: { flexDirection: 'row', gap: Space.lg },
    // Tool strip — flat, hairline-separated, not carded
    toolStrip: {
      marginTop: Space.lg, paddingVertical: Space.sm,
      borderTopWidth: Stroke.hairline, borderTopColor: colors.borderSubtle },
    toolStripContent: { gap: Space.sm, paddingRight: Space.md },
    toolChip: {
      paddingHorizontal: Space.md, paddingVertical: Space.sm + 2,
      borderRadius: Radius.md, borderWidth: Stroke.standard },
    toolChipText: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily },
    // Presets — contextual, not a competing rail
    presetsRow: { marginTop: Space.md, gap: Space.xs },
    presetsLabel: {
      fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing, textTransform: 'uppercase' },
    presetsContent: { gap: Space.sm, paddingRight: Space.md, paddingVertical: Space.xs },
    presetChip: {
      paddingHorizontal: Space.md, paddingVertical: Space.sm,
      borderRadius: Radius.full, borderWidth: Stroke.standard },
    presetChipText: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    presetDescription: {
      fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight + 2, paddingTop: Space.xs },
    // Scene picker — contextual expansion
    sceneSection: { marginTop: Space.md, gap: Space.xs },
    sceneLabel: {
      fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing, textTransform: 'uppercase' },
    sceneContent: { gap: Space.sm, paddingRight: Space.md, paddingVertical: Space.xs },
    sceneChip: {
      paddingHorizontal: Space.md, paddingVertical: Space.sm,
      borderRadius: Radius.md, borderWidth: Stroke.standard },
    sceneChipText: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    // Candidate info (candidate_ready)
    candidateInfo: { paddingTop: Space.md, gap: Space.xs },
    compareHint: {
      flexDirection: 'row', alignItems: 'center', gap: Space.xs, flexWrap: 'wrap' },
    compareHintText: { flex: 1, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    compareToggleLink: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily },
    verifyText: {
      fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight + 2 },
    provenanceText: {
      fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    // Footer
    footer: { borderTopWidth: Stroke.hairline, paddingHorizontal: Space.md, paddingTop: Space.sm },
    footerRow: { flexDirection: 'row', gap: Space.sm },
    footerPrimaryBtn: { flex: 1 },
    footerSecondaryBtn: { flex: 0, minWidth: 100 },
    footerFullBtn: { width: '100%' } });
}
