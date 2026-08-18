import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';

// Decorative palette — intentionally hardcoded.
// These are user-facing canvas background swatches (solid colors and
// gradients) that the creator picks from. They are persisted as canvas
// background values and rendered over media, so they must remain stable
// literal colors rather than theme tokens that shift with light/dark mode.
const BG_PRESETS = [
  { label: 'Black', type: 'color' as const, value: '#000000' },
  { label: 'Dark', type: 'color' as const, value: '#1a1a1a' },
  { label: 'White', type: 'color' as const, value: '#ffffff' },
  { label: 'Gold', type: 'color' as const, value: '#C9A46A' },
  { label: 'Gold Fade', type: 'gradient' as const, value: '#1a1a1a', secondaryValue: '#C9A46A' },
  { label: 'Sunset', type: 'gradient' as const, value: '#9b0202', secondaryValue: '#F5D547' },
  { label: 'Ocean', type: 'gradient' as const, value: '#06489A', secondaryValue: '#215634' },
  { label: 'Plum', type: 'gradient' as const, value: '#2d1b3d', secondaryValue: '#7B68EE' },
];

export interface CreatorSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreatorSettingsSheet({ visible, onClose }: CreatorSettingsSheetProps) {
  const { document, updateMetadata, updateCanvas, saveDraft, isDirty, autosaveStatus, retryAutosave } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [title, setTitle] = useState(document.metadata.title || '');
  const [caption, setCaption] = useState(document.metadata.caption || '');
  const [accessibilityDesc, setAccessibilityDesc] = useState(document.metadata.accessibilityDescription || '');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const isLook = document.type === 'look';

  const handleSaveTitle = useCallback(() => {
    updateMetadata({ title });
  }, [title, updateMetadata]);

  const handleSaveCaption = useCallback(() => {
    updateMetadata({ caption });
  }, [caption, updateMetadata]);

  const handleSaveAccessibility = useCallback(() => {
    updateMetadata({ accessibilityDescription: accessibilityDesc });
  }, [accessibilityDesc, updateMetadata]);

  const inputStyle = (field: string) => [
    styles.input,
    focusedField === field && styles.inputFocused,
  ];

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.8}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close settings">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
          {/* Shared: Title */}
          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            style={inputStyle('title')}
            value={title}
            onChangeText={setTitle}
            onFocus={() => setFocusedField('title')}
            onBlur={() => { setFocusedField(null); handleSaveTitle(); }}
            placeholder="Untitled"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Document title"
          />

          {/* Shared: Caption */}
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>Caption</Text>
            <Text style={[styles.charCount, { color: caption.length > 2000 ? colors.danger : colors.textMuted }]}>
              {caption.length}/2200
            </Text>
          </View>
          <TextInput
            style={[inputStyle('caption'), styles.textArea]}
            value={caption}
            onChangeText={setCaption}
            onFocus={() => setFocusedField('caption')}
            onBlur={() => { setFocusedField(null); handleSaveCaption(); }}
            placeholder="Add a caption..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2200}
            accessibilityLabel="Caption"
          />

          {/* Shared: Accessibility description */}
          <Text style={styles.sectionLabel}>Accessibility Description</Text>
          <TextInput
            style={[inputStyle('accessibility'), styles.textArea]}
            value={accessibilityDesc}
            onChangeText={setAccessibilityDesc}
            onFocus={() => setFocusedField('accessibility')}
            onBlur={() => { setFocusedField(null); handleSaveAccessibility(); }}
            placeholder="Describe this content for screen readers..."
            placeholderTextColor={colors.textMuted}
            multiline
            accessibilityLabel="Accessibility description"
          />

          {/* Shared: Remix attribution */}
          {document.metadata.sourceDocumentId && (
            <>
              <Text style={styles.sectionLabel}>Remix Attribution</Text>
              <View style={styles.attributionBox}>
                <Ionicons name="git-branch-outline" size={16} color={colors.textSecondary} />
                <View style={styles.attributionContent}>
                  <Text style={styles.attributionText}>
                    Remixed from another {document.type}
                  </Text>
                  <Text style={styles.attributionDetail}>
                    Source: {document.metadata.sourceDocumentId}
                  </Text>
                  {document.metadata.sourceCreatorId && (
                    <Text style={styles.attributionDetail}>
                      Original creator: {document.metadata.sourceCreatorId}
                    </Text>
                  )}
                </View>
              </View>
            </>
          )}

          {/* Look-specific settings */}
          {isLook && (
            <>
              <Text style={styles.sectionLabel}>Visibility</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Public</Text>
                <Switch
                  value={document.metadata.visibility === 'public'}
                  onValueChange={(v) => updateMetadata({ visibility: v ? 'public' : 'private' })}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  accessibilityLabel="Public visibility"
                />
              </View>

              <Text style={styles.sectionLabel}>Remix Permission</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Allow others to remix</Text>
                <Switch
                  value={document.metadata.allowRemix ?? false}
                  onValueChange={(v) => updateMetadata({ allowRemix: v })}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  accessibilityLabel="Allow remix"
                />
              </View>
            </>
          )}

          {/* Poster-specific settings */}
          {!isLook && (
            <>
              <Text style={styles.sectionLabel}>Audience</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Public</Text>
                <Switch
                  value={document.metadata.visibility === 'public'}
                  onValueChange={(v) => updateMetadata({ visibility: v ? 'public' : 'private' })}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  accessibilityLabel="Public audience"
                />
              </View>

              <Text style={styles.sectionLabel}>Allow Replies</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Enable replies</Text>
                <Switch
                  value={document.metadata.allowReplies ?? true}
                  onValueChange={(v) => updateMetadata({ allowReplies: v })}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  accessibilityLabel="Allow replies"
                />
              </View>

              <Text style={styles.sectionLabel}>Allow Reactions</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Enable reactions</Text>
                <Switch
                  value={document.metadata.allowReactions ?? true}
                  onValueChange={(v) => updateMetadata({ allowReactions: v })}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  accessibilityLabel="Allow reactions"
                />
              </View>

              <Text style={styles.sectionLabel}>Expiry (hours)</Text>
              <TextInput
                style={inputStyle('expiry')}
                value={String(document.metadata.expiresInHours ?? 24)}
                onChangeText={(v) => {
                  const num = parseInt(v, 10);
                  if (!isNaN(num) && num > 0) updateMetadata({ expiresInHours: num });
                }}
                onFocus={() => setFocusedField('expiry')}
                onBlur={() => setFocusedField(null)}
                keyboardType="numeric"
                accessibilityLabel="Expiry in hours"
              />
            </>
          )}

          {/* Shared: Canvas background */}
          <Text style={styles.sectionLabel}>Background</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bgScroll}
            contentContainerStyle={styles.bgScrollContent}
          >
            {BG_PRESETS.map((bg) => {
              const isActive = document.canvas.background.type === bg.type &&
                document.canvas.background.value === bg.value &&
                (bg.secondaryValue ? document.canvas.background.secondaryValue === bg.secondaryValue : true);
              return (
                <Pressable
                  key={bg.label}
                  onPress={() => {
                    haptic.selection();
                    updateCanvas({ background: { type: bg.type, value: bg.value, secondaryValue: bg.secondaryValue } });
                  }}
                  style={styles.bgTileWrap}
                  accessibilityLabel={`Background ${bg.label}${isActive ? ', selected' : ''}`}
                  accessibilityRole="button"
                >
                  <View
                    style={[
                      styles.bgTile,
                      { borderColor: isActive ? colors.brand : 'transparent' },
                    ]}
                  >
                    {bg.type === 'color' ? (
                      <View style={[styles.bgTileFill, { backgroundColor: bg.value }]} />
                    ) : (
                      <LinearGradient
                        colors={[bg.value, bg.secondaryValue!]}
                        style={styles.bgTileFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                      />
                    )}
                    {isActive && (
                      <View style={styles.bgCheckOverlay}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.surface} />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.bgTileLabel,
                      { color: isActive ? colors.brand : colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {bg.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Shared: Canvas ratio */}
          <Text style={styles.sectionLabel}>Canvas Ratio</Text>
          <View style={styles.ratioRow}>
            {isLook ? (
              <>
                <RatioButton label="3:4" ratio={0.75} current={document.canvas.aspectRatio} onSelect={(r) => updateCanvas({ aspectRatio: r })} />
                <RatioButton label="1:1" ratio={1} current={document.canvas.aspectRatio} onSelect={(r) => updateCanvas({ aspectRatio: r })} />
                <RatioButton label="4:5" ratio={0.8} current={document.canvas.aspectRatio} onSelect={(r) => updateCanvas({ aspectRatio: r })} />
                <RatioButton label="9:16" ratio={0.5625} current={document.canvas.aspectRatio} onSelect={(r) => updateCanvas({ aspectRatio: r })} />
              </>
            ) : (
              <>
                <RatioButton label="9:16" ratio={0.5625} current={document.canvas.aspectRatio} onSelect={(r) => updateCanvas({ aspectRatio: r })} />
                <RatioButton label="1:1" ratio={1} current={document.canvas.aspectRatio} onSelect={(r) => updateCanvas({ aspectRatio: r })} />
                <RatioButton label="4:5" ratio={0.8} current={document.canvas.aspectRatio} onSelect={(r) => updateCanvas({ aspectRatio: r })} />
              </>
            )}
          </View>

          {/* Draft save */}
          <View style={styles.draftSection}>
            <Text style={styles.sectionLabel}>Draft</Text>
            <View style={styles.autosaveRow}>
              <Text style={styles.autosaveLabel}>
                {autosaveStatus === 'saving' ? 'Saving…' :
                 autosaveStatus === 'saved' ? 'Saved' :
                 autosaveStatus === 'failed' ? 'Save failed' : 'Idle'}
              </Text>
              {autosaveStatus === 'failed' && (
                <Pressable onPress={retryAutosave} style={styles.retryBtn} accessibilityLabel="Retry save" accessibilityRole="button">
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => saveDraft()}
              style={[styles.saveBtn, !isDirty && styles.saveBtnDisabled]}
              disabled={!isDirty}
              accessibilityLabel="Save draft manually"
              accessibilityRole="button"
            >
              <Ionicons name="save-outline" size={16} color={colors.surface} />
              <Text style={styles.saveBtnText}>Save Draft</Text>
            </Pressable>
          </View>
        </ScrollView>
    </SheetContainer>
  );
}

function RatioButton({ label, ratio, current, onSelect }: { label: string; ratio: number; current: number; onSelect: (r: number) => void }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isActive = Math.abs(current - ratio) < 0.01;
  // Visual preview: a rectangle showing the aspect ratio shape
  // Max dimensions: 32x40 box
  const previewW = ratio <= 1 ? Math.floor(28 * ratio) : 28;
  const previewH = ratio <= 1 ? 28 : Math.floor(28 / ratio);
  return (
    <Pressable
      onPress={() => onSelect(ratio)}
      style={[
        styles.ratioBtn,
        { borderColor: isActive ? colors.brand : colors.border, borderWidth: isActive ? Stroke.emphasis : Stroke.standard, backgroundColor: isActive ? `${colors.brand}10` : 'transparent' },
      ]}
      accessibilityLabel={`Canvas ratio ${label}${isActive ? ', current' : ''}`}
      accessibilityRole="button"
    >
      <View style={[
        styles.ratioPreview,
        { width: previewW, height: previewH, backgroundColor: isActive ? colors.brand : colors.textMuted },
      ]} />
      <Text style={[styles.ratioBtnText, { color: isActive ? colors.brand : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  scrollBody: {
    paddingHorizontal: Space.md,
  },
  scrollContent: {
    paddingBottom: Space.xl,
    gap: Space.xs,
  },
  sectionLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },
  input: {
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  inputFocused: {
    borderColor: colors.brand,
    borderWidth: Stroke.emphasis,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
  },
  rowLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: colors.textPrimary,
  },
  ratioRow: {
    flexDirection: 'row',
    gap: Space.sm,
    flexWrap: 'wrap',
  },
  ratioBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    gap: Space.xs,
    minWidth: 72,
    minHeight: 72,
  },
  ratioPreview: {
    borderRadius: Radius.sm,
  },
  ratioBtnText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  draftSection: {
    marginTop: Space.md,
    gap: Space.xs,
  },
  autosaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  autosaveLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: colors.textMuted,
  },
  retryBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  retryText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: colors.brand,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: 50,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
    color: colors.surface,
  },
  attributionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  attributionContent: {
    flex: 1,
    gap: Space.xxs,
  },
  attributionText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: colors.textSecondary,
  },
  attributionDetail: {
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    color: colors.textMuted,
  },
  // ── Background picker ──
  bgScroll: {
    marginHorizontal: -Space.md,
  },
  bgScrollContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  bgTileWrap: {
    alignItems: 'center',
    gap: Space.xs,
  },
  bgTile: {
    width: 64,
    height: 80,
    borderRadius: Radius.lg,
    borderWidth: Stroke.emphasis,
    overflow: 'hidden',
  },
  bgTileFill: {
    width: '100%',
    height: '100%',
  },
  bgCheckOverlay: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgTileLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    letterSpacing: 0.1,
  },
  });
}
