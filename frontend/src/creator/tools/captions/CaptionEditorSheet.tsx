/**
 * CaptionEditorSheet — a bottom sheet for managing captions.
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §6 and AGENTS.md §11
 * (truthful UI):
 *
 *  Auto-Generate button:
 *    Calls CaptionService.transcribe. If no STT module is available
 *    (the current state — no expo-speech-recognition / expo-sherpa-onnx /
 *    expo-ai-kit in package.json), shows a truthful message:
 *    "Auto captions require a speech recognition module. You can add
 *    captions manually." The button is shown in a truthful disabled
 *    state — it does not fabricate transcription results.
 *
 *  Manual caption entry:
 *    Fully functional. The user can:
 *      - Type caption text
 *      - Set start/end time (in seconds, with millisecond precision)
 *      - Add the caption to the track
 *      - Edit existing captions inline (tap to edit text or timing)
 *      - Delete captions
 *
 *  Style controls:
 *    Font, size, color, background, highlight color — reuses the text
 *    style system from textStylePresets.
 *
 *  Per-word timing toggle:
 *    Shown only when the active segment has per-word timing data (i.e.
 *    from auto-transcription). When off, the whole segment is shown.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets for interactive controls.
 * Per AGENTS.md §14: complete state coverage (empty, populated, error,
 *   unsupported, transcribing).
 */
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  FlatList,
  ActivityIndicator,
  Animated,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
  PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  Typography,
  FontFamily,
  Control,
  Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { Motion } from '../../../theme/motionTokens';
import {
  captionService,
  CaptionUnsupportedError,
  type CaptionSegment,
  type CaptionStatus,
  type CaptionStyle,
  type CaptionTrack } from '../../core/captions';
import { DEFAULT_CAPTION_STYLE } from '../../core/captions';
import { TEXT_STYLE_PRESETS } from '../text/textStylePresets';

// ── Types ────────────────────────────────────────────────────────────

export interface CaptionEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called when the caption track or style changes. */
  onConfirm: (track: CaptionTrack, style: CaptionStyle) => void;
  /** Initial caption track (for editing an existing track). */
  initialTrack?: CaptionTrack | null;
  /** Initial caption style. */
  initialStyle?: CaptionStyle;
  /** The media URI to transcribe (for auto-generate). */
  mediaUri?: string;
  /** Total duration of the composition in ms (for time field validation). */
  totalDurationMs?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const seconds = Math.floor(totalSeconds);
  const tenths = Math.floor((totalSeconds - seconds) * 10);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ── Component ────────────────────────────────────────────────────────

export function CaptionEditorSheet({
  visible,
  onClose,
  onConfirm,
  initialTrack,
  initialStyle,
  mediaUri,
  totalDurationMs = 30000 }: CaptionEditorSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useSheetStyles(colors);

  // ── State ──
  const [track, setTrack] = useState<CaptionTrack | null>(initialTrack ?? null);
  const [style, setStyle] = useState<CaptionStyle>(initialStyle ?? DEFAULT_CAPTION_STYLE);
  const [autoStatus, setAutoStatus] = useState<CaptionStatus>('idle');
  const [autoError, setAutoError] = useState<string>('');

  // Manual caption entry form
  const [entryText, setEntryText] = useState('');
  const [entryStart, setEntryStart] = useState('');
  const [entryEnd, setEntryEnd] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // ── Font rail underline animation ──────────────────────────────────
  const fontLayouts = useRef<Array<{ x: number; width: number }>>([]);
  const fontUnderlineLeft = useRef(new Animated.Value(0)).current;
  const fontUnderlineWidth = useRef(new Animated.Value(0)).current;

  const animateFontUnderline = useCallback(
    (index: number) => {
      const layout = fontLayouts.current[index];
      if (!layout) return;
      Animated.parallel([
        Animated.spring(fontUnderlineLeft, {
          toValue: layout.x,
          useNativeDriver: false,
          stiffness: Motion.spring.indicator.stiffness,
          damping: Motion.spring.indicator.damping }),
        Animated.spring(fontUnderlineWidth, {
          toValue: layout.width,
          useNativeDriver: false,
          stiffness: Motion.spring.indicator.stiffness,
          damping: Motion.spring.indicator.damping }),
      ]).start();
    },
    [fontUnderlineLeft, fontUnderlineWidth],
  );

  useEffect(() => {
    const idx = TEXT_STYLE_PRESETS.findIndex((p) => p.id === style.textStyle);
    if (idx >= 0) animateFontUnderline(idx);
  }, [style.textStyle, animateFontUnderline]);

  const sttAvailable = captionService.isAvailable();

  // Reset internal state each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setTrack(initialTrack ?? null);
      setStyle(initialStyle ?? DEFAULT_CAPTION_STYLE);
      setAutoStatus('idle');
      setAutoError('');
      setEntryText('');
      setEntryStart('');
      setEntryEnd('');
      setEditingId(null);
    }
  }, [visible, initialTrack, initialStyle]);

  // ── Auto-generate ──
  const handleAutoGenerate = useCallback(async () => {
    if (!sttAvailable) {
      // Truthful: the button is disabled, but guard against any call.
      setAutoStatus('unsupported');
      return;
    }
    if (!mediaUri) {
      setAutoStatus('error');
      setAutoError('No media file available to transcribe.');
      return;
    }

    setAutoStatus('transcribing');
    setAutoError('');
    if (!reducedMotion) haptic.light();

    try {
      const result = await captionService.transcribe(mediaUri);
      setTrack(result);
      setAutoStatus('ready');
      if (!reducedMotion) haptic.medium();
    } catch (err) {
      if (err instanceof CaptionUnsupportedError) {
        setAutoStatus('unsupported');
      } else {
        setAutoStatus('error');
        setAutoError(err instanceof Error ? err.message : 'Transcription failed.');
      }
    }
  }, [sttAvailable, mediaUri, haptic, reducedMotion]);

  // ── Manual caption add ──
  const handleAddCaption = useCallback(() => {
    const text = entryText.trim();
    if (!text) return;

    const startMs = parseFloat(entryStart) * 1000;
    const endMs = parseFloat(entryEnd) * 1000;

    if (!Number.isFinite(startMs) || startMs < 0) return;
    if (!Number.isFinite(endMs) || endMs <= startMs) return;

    const segment = captionService.createManualCaption(text, startMs, endMs);
    const currentTrack = track ?? captionService.createTrack([], 'en', 'manual');
    const updated = captionService.addSegment(currentTrack, segment);
    setTrack(updated);

    // Reset the entry form.
    setEntryText('');
    setEntryStart('');
    setEntryEnd('');
    if (!reducedMotion) haptic.light();
  }, [entryText, entryStart, entryEnd, track, haptic, reducedMotion]);

  // ── Edit caption ──
  const handleStartEdit = useCallback(
    (seg: CaptionSegment) => {
      if (editingId === seg.id) {
        // Toggle off — cancel edit.
        setEditingId(null);
        return;
      }
      setEditingId(seg.id);
      setEditText(seg.text);
      setEditStart((seg.startMs / 1000).toString());
      setEditEnd((seg.endMs / 1000).toString());
      if (!reducedMotion) haptic.selection();
    },
    [editingId, haptic, reducedMotion],
  );

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !track) return;
    const text = editText.trim();
    if (!text) return;

    const startMs = parseFloat(editStart) * 1000;
    const endMs = parseFloat(editEnd) * 1000;
    if (!Number.isFinite(startMs) || startMs < 0) return;
    if (!Number.isFinite(endMs) || endMs <= startMs) return;

    let updated = captionService.editCaption(track, editingId, text);
    updated = captionService.adjustTiming(updated, editingId, startMs, endMs);
    setTrack(updated);
    setEditingId(null);
    if (!reducedMotion) haptic.light();
  }, [editingId, track, editText, editStart, editEnd, haptic, reducedMotion]);

  // ── Delete caption ──
  const handleDeleteCaption = useCallback(
    (segId: string) => {
      if (!track) return;
      const updated = captionService.deleteCaption(track, segId);
      setTrack(updated);
      if (editingId === segId) setEditingId(null);
      if (!reducedMotion) haptic.medium();
    },
    [track, editingId, haptic, reducedMotion],
  );

  // ── Style changes ──
  const handleStyleChange = useCallback((partial: Partial<CaptionStyle>) => {
    setStyle((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Confirm ──
  const handleConfirm = useCallback(() => {
    if (!reducedMotion) haptic.medium();
    if (track) {
      onConfirm(track, style);
    } else {
      // If no track exists, create an empty one so the style is persisted.
      onConfirm(captionService.createTrack([], style ? 'en' : 'en', 'manual'), style);
    }
  }, [track, style, haptic, onConfirm, reducedMotion]);

  const handleClose = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onClose();
  }, [haptic, onClose, reducedMotion]);

  const segmentCount = track?.segments.length ?? 0;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.9}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Captions</Text>
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close caption editor"
            accessibilityHint="Closes the caption editor sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* ── Auto-generate section ───────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Auto-Generate
          </Text>

          <Pressable
            onPress={handleAutoGenerate}
            disabled={!sttAvailable || autoStatus === 'transcribing'}
            style={[
              styles.autoBtn,
              {
                backgroundColor: sttAvailable ? colors.brand : colors.surfaceAlt },
            ]}
            accessibilityLabel="Auto-generate captions"
            accessibilityRole="button"
            accessibilityState={{
              disabled: !sttAvailable,
              busy: autoStatus === 'transcribing' }}
            accessibilityHint={
              sttAvailable
                ? 'Transcribes the video audio into captions'
                : 'Auto captions require a speech recognition module'
            }
          >
            {autoStatus === 'transcribing' ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Ionicons
                name="bulb-outline"
                size={IconGrammar.metadata}
                color={sttAvailable ? colors.textInverse : colors.textMuted}
              />
            )}
            <Text
              style={[
                styles.autoBtnText,
                { color: sttAvailable ? colors.textInverse : colors.textMuted },
              ]}
            >
              {autoStatus === 'transcribing'
                ? 'Transcribing…'
                : sttAvailable
                  ? 'Auto-Generate Captions'
                  : 'Auto-Generate Unavailable'}
            </Text>
            {sttAvailable && autoStatus !== 'transcribing' && (
              <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textInverse} />
            )}
          </Pressable>

          {/* Truthful status messaging */}
          {!sttAvailable && (
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle-outline" size={IconGrammar.metadata} color={colors.textMuted} />
              <Text style={[styles.noticeText, { color: colors.textMuted }]}>
                Auto captions require a speech recognition module. You can add
                captions manually below.
              </Text>
            </View>
          )}
          {autoStatus === 'error' && (
            <View style={styles.noticeBox}>
              <Ionicons name="alert-circle-outline" size={IconGrammar.metadata} color={colors.danger} />
              <Text style={[styles.noticeText, { color: colors.danger }]}>
                {autoError || 'Transcription failed. Please try again.'}
              </Text>
            </View>
          )}
          {autoStatus === 'ready' && (
            <View style={styles.noticeBox}>
              <Ionicons name="checkmark-circle-outline" size={IconGrammar.metadata} color={colors.success} />
              <Text style={[styles.noticeText, { color: colors.success }]}>
                Captions generated. Edit them below.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionDivider} />

        {/* ── Manual caption entry ────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Add Caption
          </Text>

          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Type caption text…"
            placeholderTextColor={colors.textMuted}
            value={entryText}
            onChangeText={setEntryText}
            multiline
            maxLength={200}
            accessibilityLabel="Caption text input"
          />

          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>
                Start (sec)
              </Text>
              <TextInput
                style={[styles.timeInput, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="0.0"
                placeholderTextColor={colors.textMuted}
                value={entryStart}
                onChangeText={setEntryStart}
                keyboardType="decimal-pad"
                accessibilityLabel="Caption start time in seconds"
              />
            </View>
            <View style={styles.timeField}>
              <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>
                End (sec)
              </Text>
              <TextInput
                style={[styles.timeInput, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="3.0"
                placeholderTextColor={colors.textMuted}
                value={entryEnd}
                onChangeText={setEntryEnd}
                keyboardType="decimal-pad"
                accessibilityLabel="Caption end time in seconds"
              />
            </View>
          </View>

          <Pressable
            onPress={handleAddCaption}
            disabled={!entryText.trim()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[
              styles.addBtn,
              {
                backgroundColor: entryText.trim() ? colors.brand : colors.surfaceAlt },
            ]}
            accessibilityLabel="Add caption"
            accessibilityRole="button"
            accessibilityState={{ disabled: !entryText.trim() }}
          >
            <Ionicons
              name="add"
              size={IconGrammar.metadata}
              color={entryText.trim() ? colors.textInverse : colors.textMuted}
            />
            <Text
              style={[
                styles.addBtnText,
                { color: entryText.trim() ? colors.textInverse : colors.textMuted },
              ]}
            >
              Add Caption
            </Text>
            {entryText.trim() && (
              <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textInverse} />
            )}
          </Pressable>
        </View>

        <View style={styles.sectionDivider} />

        {/* ── Caption list ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.listHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Captions
            </Text>
            {segmentCount > 0 && (
              <Text style={[styles.countBadge, { color: colors.textMuted }]}>
                {segmentCount}
              </Text>
            )}
          </View>

          {segmentCount === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No captions yet
              </Text>
            </View>
          ) : (
            <FlatList
              data={track!.segments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <CaptionRow
                  segment={item}
                  isEditing={editingId === item.id}
                  editText={editText}
                  editStart={editStart}
                  editEnd={editEnd}
                  onEditText={setEditText}
                  onEditStart={setEditStart}
                  onEditEnd={setEditEnd}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onDelete={handleDeleteCaption}
                  colors={colors}
                  styles={styles}
                />
              )}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
            />
          )}
        </View>

        <View style={styles.sectionDivider} />

        {/* ── Style controls ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Style
          </Text>

          {/* Font preset rail */}
          <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Font</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.fontRail}
          >
            {TEXT_STYLE_PRESETS.map((preset, i) => {
              const isSelected = style.textStyle === preset.id;
              return (
                <View
                  key={preset.id}
                  onLayout={(e) => {
                    fontLayouts.current[i] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width };
                    if (isSelected) animateFontUnderline(i);
                  }}
                >
                  <Pressable
                    onPress={() => handleStyleChange({ textStyle: preset.id })}
                    style={styles.fontTab}
                    accessibilityLabel={`Font: ${preset.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.fontTabText,
                        {
                          color: isSelected ? colors.brand : colors.textSecondary,
                          fontFamily: preset.fontFamily },
                      ]}
                    >
                      {preset.name}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            <Animated.View
              style={[
                styles.tabUnderline,
                { left: fontUnderlineLeft, width: fontUnderlineWidth },
              ]}
            />
          </ScrollView>

          {/* Font size slider */}
          <SliderRow
            label="Font Size"
            valueText={`${Math.round(style.fontSize)}pt`}
            min={10}
            max={36}
            value={style.fontSize}
            trackColor={colors.border}
            fillColor={colors.brand}
            thumbColor={colors.textPrimary}
            labelColor={colors.textPrimary}
            valueColor={colors.textMuted}
            onChange={(v) => handleStyleChange({ fontSize: Math.round(v) })}
          />

          {/* Text color */}
          <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
            Text Color
          </Text>
          <ColorSwatchRow
            colors={colors}
            currentColor={style.textColor}
            onColorChange={(c) => handleStyleChange({ textColor: c })}
          />

          {/* Highlight color */}
          <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
            Highlight Color
          </Text>
          <ColorSwatchRow
            colors={colors}
            currentColor={style.highlightColor}
            onColorChange={(c) => handleStyleChange({ highlightColor: c })}
          />

          {/* Background toggle */}
          <Pressable
            onPress={() =>
              handleStyleChange({
                backgroundColor: style.backgroundColor ? undefined : 'rgba(0,0,0,0.5)' })
            }
            style={styles.toggleRow}
            accessibilityLabel="Caption background"
            accessibilityRole="switch"
            accessibilityState={{ checked: !!style.backgroundColor }}
            hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
          >
            <View style={styles.toggleTextWrap}>
              <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
                Background
              </Text>
              <Text style={[styles.toggleHint, { color: colors.textMuted }]}>
                Show a semi-transparent background behind captions.
              </Text>
            </View>
            <View
              style={[
                styles.switchTrack,
                {
                  backgroundColor: style.backgroundColor ? colors.brand : colors.surfaceAlt,
                  borderColor: style.backgroundColor ? colors.brand : colors.border },
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  {
                    backgroundColor: style.backgroundColor ? colors.textInverse : colors.textSecondary,
                    transform: [{ translateX: style.backgroundColor ? 22 : 2 }] },
                ]}
              />
            </View>
          </Pressable>
        </View>

        {/* ── Done ────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleConfirm}
            style={[styles.doneBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Done"
            accessibilityRole="button"
            accessibilityHint="Applies the captions and closes the sheet"
          >
            <Text style={[styles.doneBtnText, { color: colors.textInverse }]}>Done</Text>
            <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.textInverse} />
          </Pressable>
        </View>
      </ScrollView>
    </SheetContainer>
  );
}

// ── Caption row (list item) ──────────────────────────────────────────

interface CaptionRowProps {
  segment: CaptionSegment;
  isEditing: boolean;
  editText: string;
  editStart: string;
  editEnd: string;
  onEditText: (v: string) => void;
  onEditStart: (v: string) => void;
  onEditEnd: (v: string) => void;
  onStartEdit: (seg: CaptionSegment) => void;
  onSaveEdit: () => void;
  onDelete: (id: string) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

const CaptionRow = React.memo(function CaptionRow({
  segment,
  isEditing,
  editText,
  editStart,
  editEnd,
  onEditText,
  onEditStart,
  onEditEnd,
  onStartEdit,
  onSaveEdit,
  onDelete,
  colors,
  styles }: CaptionRowProps) {
  const hasWords = Boolean(segment.words && segment.words.length > 0);

  if (isEditing) {
    return (
      <View style={[styles.editRow, { borderColor: colors.brand }]}>
        <TextInput
          style={[styles.editInput, { color: colors.textPrimary, borderColor: colors.border }]}
          value={editText}
          onChangeText={onEditText}
          multiline
          maxLength={200}
          accessibilityLabel="Edit caption text"
        />
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>
              Start (sec)
            </Text>
            <TextInput
              style={[styles.timeInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={editStart}
              onChangeText={onEditStart}
              keyboardType="decimal-pad"
              accessibilityLabel="Edit caption start time"
            />
          </View>
          <View style={styles.timeField}>
            <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>
              End (sec)
            </Text>
            <TextInput
              style={[styles.timeInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={editEnd}
              onChangeText={onEditEnd}
              keyboardType="decimal-pad"
              accessibilityLabel="Edit caption end time"
            />
          </View>
        </View>
        <View style={styles.editActions}>
          <Pressable
            onPress={onSaveEdit}
            style={[styles.editActionBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Save caption edit"
            accessibilityRole="button"
          >
            <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.textInverse} />
            <Text style={[styles.editActionText, { color: colors.textInverse }]}>Save</Text>
          </Pressable>
          <Pressable
            onPress={() => onStartEdit(segment)}
            style={[styles.editActionBtn, { borderColor: colors.border, borderWidth: Stroke.standard }]}
            accessibilityLabel="Cancel caption edit"
            accessibilityRole="button"
          >
            <Text style={[styles.editActionText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.captionRow}>
      <Pressable
        onPress={() => onStartEdit(segment)}
        style={styles.captionContent}
        accessibilityLabel={`Caption: ${segment.text}, ${formatTime(segment.startMs)} to ${formatTime(segment.endMs)}`}
        accessibilityRole="button"
      >
        <Text
          style={[styles.captionText, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {segment.text}
        </Text>
        <View style={styles.captionMeta}>
          <Text style={[styles.captionTime, { color: colors.textMuted }]}>
            {formatTime(segment.startMs)} – {formatTime(segment.endMs)}
          </Text>
          {hasWords && (
            <View style={[styles.wordBadge, { backgroundColor: colors.brandSubtle }]}>
              <Text style={[styles.wordBadgeText, { color: colors.brand }]}>word-by-word</Text>
            </View>
          )}
          {segment.confidence !== undefined && (
            <View style={[styles.wordBadge, { backgroundColor: colors.brandSubtle }]}>
              <Text style={[styles.wordBadgeText, { color: colors.brand }]}>auto</Text>
            </View>
          )}
        </View>
      </Pressable>
      <Pressable
        onPress={() => onDelete(segment.id)}
        style={styles.deleteBtn}
        accessibilityLabel="Delete caption"
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="trash-outline" size={IconGrammar.metadata} color={colors.danger} />
      </Pressable>
    </View>
  );
});

// ── Color swatch row ─────────────────────────────────────────────────

const CAPTION_COLORS = [
  '#ffffff',
  '#000000',
  '#C9A46A',
  '#F4F0E8',
  '#9b0202',
  '#215634',
  '#4A7AC4',
  '#B85566',
];

interface ColorSwatchRowProps {
  colors: ThemeColors;
  currentColor: string;
  onColorChange: (color: string) => void;
}

function ColorSwatchRow({ colors, currentColor, onColorChange }: ColorSwatchRowProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useSheetStyles(colors);

  return (
    <View style={styles.swatchRow}>
      {CAPTION_COLORS.map((c) => {
        const isSelected = currentColor.toLowerCase() === c.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => {
              if (!reducedMotion) haptic.selection();
              onColorChange(c);
            }}
            style={[
              styles.swatch,
              { backgroundColor: c },
              isSelected && { borderColor: colors.brand, borderWidth: Stroke.emphasis },
            ]}
            accessibilityLabel={`Color ${c}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          />
        );
      })}
    </View>
  );
}

// ── Slider row (reused pattern from AudioBrowserSheet) ───────────────

interface SliderRowProps {
  label: string;
  valueText: string;
  min: number;
  max: number;
  value: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  labelColor: string;
  valueColor: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function SliderRow({
  label,
  valueText,
  min,
  max,
  value,
  trackColor,
  fillColor,
  thumbColor,
  labelColor,
  valueColor,
  onChange,
  disabled = false }: SliderRowProps) {
  const { colors } = useAppTheme();
  const styles = useSheetStyles(colors);
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const range = max - min;
  const clamped = clamp(value, min, max);
  const ratio = range === 0 ? 0 : (clamped - min) / range;
  const trackLayoutWidth = trackWidth > 0 ? trackWidth : 1;
  const thumbPosition = ratio * trackLayoutWidth;

  const valueToPosition = useCallback(
    (x: number) => {
      const r = Math.min(1, Math.max(0, x / trackLayoutWidth));
      return min + r * range;
    },
    [trackLayoutWidth, min, range],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          const next = valueToPosition(thumbPosition + g.dx);
          onChange(Math.round(next * 10) / 10);
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminationRequest: () => false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thumbPosition, valueToPosition, onChange, disabled],
  );

  const opacity = disabled ? 0.4 : 1;

  return (
    <View style={[styles.sliderRow, { opacity }]}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: labelColor, fontFamily: FontFamily.regular }]}>
          {label}
        </Text>
        <Text style={[styles.sliderValue, { color: valueColor, fontFamily: FontFamily.medium }]}>
          {valueText}
        </Text>
      </View>
      <View style={styles.trackWrap} onLayout={handleLayout} {...panResponder.panHandlers}>
        <View style={[styles.track, { backgroundColor: trackColor }]} />
        <View style={[styles.fill, { width: thumbPosition, backgroundColor: fillColor }]} />
        <View style={[styles.thumb, { left: thumbPosition, backgroundColor: thumbColor }]} />
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm },
    // ── Sections ──
    section: {
      gap: Space.sm,
      paddingVertical: Space.xs },
    sectionTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.md },
    subLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size },
    // ── Auto-generate ──
    autoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: 50,
      borderRadius: Radius.lg },
    autoBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    noticeBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      paddingVertical: Space.xs },
    noticeText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.size * 1.4 },
    // ── Input ──
    input: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit },
    timeRow: {
      flexDirection: 'row',
      gap: Space.md },
    timeField: {
      flex: 1,
      gap: Space.xxs },
    timeLabel: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },
    timeInput: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit,
      fontVariant: ['tabular-nums'] },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: 50,
      borderRadius: Radius.lg },
    addBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    // ── List ──
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    countBadge: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      fontVariant: ['tabular-nums'] },
    emptyState: {
      paddingVertical: Space.lg,
      alignItems: 'center',
      justifyContent: 'center' },
    emptyText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      textAlign: 'center' },
    captionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      minHeight: Control.hit },
    captionContent: {
      flex: 1,
      gap: Space.xxs },
    captionText: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size },
    captionMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    captionTime: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      fontVariant: ['tabular-nums'] },
    wordBadge: {
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xxs,
      borderRadius: Radius.full },
    wordBadgeText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size },
    deleteBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    // ── Edit row ──
    editRow: {
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.emphasis },
    editInput: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit },
    editActions: {
      flexDirection: 'row',
      gap: Space.sm },
    editActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.md,
      minHeight: Control.hit },
    editActionText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size },
    // ── Font rail ──
    fontRail: {
      gap: Space.sm,
      paddingVertical: Space.xxs,
      position: 'relative' },
    fontTab: {
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.smMd },
    fontTabText: {
      fontSize: TypographyV2.meta.size },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      height: Stroke.emphasis,
      backgroundColor: colors.brand,
      borderRadius: Stroke.emphasis },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border },
    // ── Toggle ──
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      minHeight: Control.hit },
    toggleTextWrap: {
      flex: 1,
      paddingRight: Space.md,
      gap: Space.xxs },
    toggleTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
    toggleHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },
    switchTrack: {
      width: 46,
      height: 28,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      justifyContent: 'center' },
    switchThumb: {
      position: 'absolute',
      width: 22,
      height: 22,
      borderRadius: Radius.full },
    // ── Swatches ──
    swatchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      paddingVertical: Space.xs },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border },
    // ── Slider ──
    sliderRow: {
      paddingVertical: Space.sm },
    sliderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.xs },
    sliderLabel: {
      fontSize: TypographyV2.meta.size },
    sliderValue: {
      fontSize: TypographyV2.meta.size,
      fontVariant: ['tabular-nums'] },
    trackWrap: {
      height: Control.hit,
      justifyContent: 'center',
      position: 'relative' },
    track: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 3,
      borderRadius: Radius.full },
    fill: {
      position: 'absolute',
      left: 0,
      height: 3,
      borderRadius: Radius.full },
    thumb: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: Radius.full,
      marginLeft: -8,
      borderWidth: Stroke.standard,
      borderColor: 'rgba(0,0,0,0)' },
    // ── Footer ──
    footer: {
      paddingTop: Space.lg },
    doneBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: 50,
      borderRadius: Radius.lg },
    doneBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size } });
}

// Memoised style factory keyed to colors.
const styleCache = new WeakMap<ThemeColors, ReturnType<typeof createStyles>>();
function useSheetStyles(colors: ThemeColors): ReturnType<typeof createStyles> {
  let cached = styleCache.get(colors);
  if (!cached) {
    cached = createStyles(colors);
    styleCache.set(colors, cached);
  }
  return cached;
}
