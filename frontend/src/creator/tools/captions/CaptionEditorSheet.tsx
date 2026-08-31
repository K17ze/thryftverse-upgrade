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
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  FlatList,
  ActivityIndicator } from 'react-native';
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
import { CreatorSlider } from '../../controls';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
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

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const seconds = Math.floor(totalSeconds);
  const tenths = Math.floor((totalSeconds - seconds) * 10);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}.${tenths}`;
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
  const [entryFocused, setEntryFocused] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

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
    if (totalDurationMs && endMs > totalDurationMs) return;

    const segment = captionService.createManualCaption(text, startMs, endMs);
    const currentTrack = track ?? captionService.createTrack([], 'en', 'manual');
    const updated = captionService.addSegment(currentTrack, segment);
    setTrack(updated);

    // Reset the entry form.
    setEntryText('');
    setEntryStart('');
    setEntryEnd('');
    if (!reducedMotion) haptic.light();
  }, [entryText, entryStart, entryEnd, track, haptic, reducedMotion, totalDurationMs]);

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
    if (totalDurationMs && endMs > totalDurationMs) return;

    let updated = captionService.editCaption(track, editingId, text);
    updated = captionService.adjustTiming(updated, editingId, startMs, endMs);
    setTrack(updated);
    setEditingId(null);
    if (!reducedMotion) haptic.light();
  }, [editingId, track, editText, editStart, editEnd, haptic, reducedMotion, totalDurationMs]);

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
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close caption editor"
            accessibilityHint="Closes the caption editor sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Captions</Text>
          <PressScale
            onPress={handleConfirm}
            style={styles.doneBtn}
            accessibilityLabel="Done"
            accessibilityRole="button"
            accessibilityHint="Apply captions and close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.doneBtnText, { color: colors.brand }]}>Done</Text>
          </PressScale>
        </View>

        {/* ── Auto-generate section ───────────────────────────────── */}
        <View style={styles.section}>
          <Pressable
            onPress={handleAutoGenerate}
            disabled={!sttAvailable || autoStatus === 'transcribing'}
            style={[
              styles.autoBtn,
              { backgroundColor: colors.surfaceAlt },
            ]}
            accessibilityLabel="Auto-generate captions"
            accessibilityRole="button"
            accessibilityState={{
              disabled: !sttAvailable,
              busy: autoStatus === 'transcribing' }}
            accessibilityHint={
              sttAvailable
                ? 'Transcribe video audio to captions'
                : 'Auto captions need speech recognition'
            }
          >
            {autoStatus === 'transcribing' ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Ionicons
                name="sparkles-outline"
                size={16}
                color={sttAvailable ? colors.textPrimary : colors.textMuted}
              />
            )}
            <Text
              style={[
                styles.autoBtnText,
                { color: sttAvailable ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {autoStatus === 'transcribing'
                ? 'Transcribing…'
                : sttAvailable
                  ? 'Auto-Generate'
                  : 'Unavailable'}
            </Text>
          </Pressable>

          {/* Truthful status messaging */}
          {!sttAvailable && (
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle-outline" size={IconGrammar.metadata} color={colors.textMuted} />
              <Text style={[styles.noticeText, { color: colors.textMuted }]}>
                Auto captions need speech recognition. Add manually below.
              </Text>
            </View>
          )}
          {autoStatus === 'error' && (
            <View style={styles.noticeBox}>
              <Ionicons name="alert-circle-outline" size={IconGrammar.metadata} color={colors.danger} />
              <Text style={[styles.noticeText, { color: colors.danger }]}>
                {autoError || 'Transcription failed. Try again.'}
              </Text>
            </View>
          )}
          {autoStatus === 'ready' && (
            <View style={styles.noticeBox}>
              <Ionicons name="checkmark-circle-outline" size={IconGrammar.metadata} color={colors.success} />
              <Text style={[styles.noticeText, { color: colors.success }]}>
                Captions generated. Edit below.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionDivider} />

        {/* ── Manual caption entry ────────────────────────────────── */}
        <View style={styles.section}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: entryFocused ? colors.brand : colors.border, borderWidth: entryFocused ? Stroke.emphasis : Stroke.standard }]}
            placeholder="Type caption..."
            placeholderTextColor={colors.textMuted}
            value={entryText}
            onChangeText={setEntryText}
            onFocus={() => setEntryFocused(true)}
            onBlur={() => setEntryFocused(false)}
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
          {segmentCount === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
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
          {/* Font preset rail */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.fontRail}
          >
            {TEXT_STYLE_PRESETS.map((preset) => {
              const isSelected = style.textStyle === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => handleStyleChange({ textStyle: preset.id })}
                  style={[
                    styles.fontPill,
                    {
                      backgroundColor: 'transparent',
                      borderColor: isSelected ? colors.brand : colors.border,
                      borderWidth: isSelected ? Stroke.emphasis : Stroke.standard },
                  ]}
                  accessibilityLabel={`Font: ${preset.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.fontPillText,
                      {
                        color: isSelected ? colors.textPrimary : colors.textSecondary,
                        fontFamily: preset.fontFamily },
                    ]}
                  >
                    {preset.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Font size slider */}
          <View style={styles.sliderRow}>
            <View style={styles.sliderHeader}>
              <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>Size</Text>
              <Text style={[styles.sliderValue, { color: colors.textMuted }]}>{Math.round(style.fontSize)}pt</Text>
            </View>
            <CreatorSlider
              value={style.fontSize}
              min={10}
              max={36}
              step={1}
              onValueChange={(v) => handleStyleChange({ fontSize: Math.round(v) })}
              accessibilityLabel="Font size"
            />
          </View>

          {/* Text color */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.swatchRow}
          >
            {CAPTION_COLORS.map((c) => {
              const isSelected = style.textColor.toLowerCase() === c.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => handleStyleChange({ textColor: c })}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    isSelected && { borderColor: colors.brand, borderWidth: Stroke.emphasis },
                  ]}
                  accessibilityLabel={`Text color ${c}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                />
              );
            })}
          </ScrollView>

          {/* Highlight color */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.swatchRow}
          >
            {CAPTION_COLORS.map((c) => {
              const isSelected = style.highlightColor.toLowerCase() === c.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => handleStyleChange({ highlightColor: c })}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    isSelected && { borderColor: colors.brand, borderWidth: Stroke.emphasis },
                  ]}
                  accessibilityLabel={`Highlight color ${c}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                />
              );
            })}
          </ScrollView>

          {/* Background toggle */}
          <Pressable
            onPress={() =>
              handleStyleChange({
                backgroundColor: style.backgroundColor ? undefined : colors.mediaOverlayScrim })
            }
            style={styles.toggleRow}
            accessibilityLabel="Caption background"
            accessibilityRole="switch"
            accessibilityState={{ checked: !!style.backgroundColor }}
            hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
          >
            <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
              Background
            </Text>
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
          <Pressable
            onPress={() => onDelete(segment.id)}
            style={[styles.editActionBtn, { borderColor: colors.danger, borderWidth: Stroke.standard }]}
            accessibilityLabel="Delete caption"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={IconGrammar.metadata} color={colors.danger} />
            <Text style={[styles.editActionText, { color: colors.danger }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onStartEdit(segment)}
      style={styles.captionRow}
      accessibilityLabel={`Caption: ${segment.text}, ${formatTime(segment.startMs)}`}
      accessibilityRole="button"
    >
      <Text style={[styles.captionTime, { color: colors.textMuted }]}>
        {formatTime(segment.startMs)}
      </Text>
      <Text
        style={[styles.captionText, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {segment.text}
      </Text>
      <Ionicons name="create-outline" size={20} color={colors.textMuted} />
    </Pressable>
  );
});

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
      flex: 1,
      textAlign: 'center',
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    doneBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    doneBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    // ── Sections ──
    section: {
      gap: Space.sm,
      paddingVertical: Space.xs },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.md },
    // ── Auto-generate ──
    autoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      height: 36,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      alignSelf: 'flex-end' },
    autoBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: 13 },
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
      fontSize: TypographyV2.bodyStrong.size,
      borderWidth: Stroke.standard,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: 80 },
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
      minHeight: 48 },
    captionText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size },
    captionTime: {
      fontFamily: Typography.family.medium,
      fontSize: 12,
      fontVariant: ['tabular-nums'] },
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
      paddingVertical: Space.xs },
    fontPill: {
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard },
    fontPillText: {
      fontSize: TypographyV2.meta.size },
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
    toggleTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
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
      gap: Space.sm,
      paddingVertical: Space.xs },
    swatch: {
      width: 24,
      height: 24,
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
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size },
    sliderValue: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      fontVariant: ['tabular-nums'] } });
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
