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
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { Colors } from '../constants/colors';

export interface CreatorSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreatorSettingsSheet({ visible, onClose }: CreatorSettingsSheetProps) {
  const { document, updateMetadata, updateCanvas, saveDraft, isDirty, autosaveStatus, retryAutosave } = useCreator();
  const { colors } = useAppTheme();
  const [title, setTitle] = useState(document.metadata.title || '');
  const [caption, setCaption] = useState(document.metadata.caption || '');
  const [accessibilityDesc, setAccessibilityDesc] = useState(document.metadata.accessibilityDescription || '');

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
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            onBlur={handleSaveTitle}
            placeholder="Untitled"
            placeholderTextColor={Colors.textMuted}
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
            style={[styles.input, styles.textArea]}
            value={caption}
            onChangeText={setCaption}
            onBlur={handleSaveCaption}
            placeholder="Add a caption..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={2200}
            accessibilityLabel="Caption"
          />

          {/* Shared: Accessibility description */}
          <Text style={styles.sectionLabel}>Accessibility Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={accessibilityDesc}
            onChangeText={setAccessibilityDesc}
            onBlur={handleSaveAccessibility}
            placeholder="Describe this content for screen readers..."
            placeholderTextColor={Colors.textMuted}
            multiline
            accessibilityLabel="Accessibility description"
          />

          {/* Shared: Remix attribution */}
          {document.metadata.sourceDocumentId && (
            <>
              <Text style={styles.sectionLabel}>Remix Attribution</Text>
              <View style={styles.attributionBox}>
                <Ionicons name="git-branch-outline" size={16} color={Colors.textSecondary} />
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
                  trackColor={{ false: Colors.border, true: Colors.brand }}
                  accessibilityLabel="Public visibility"
                />
              </View>

              <Text style={styles.sectionLabel}>Remix Permission</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Allow others to remix</Text>
                <Switch
                  value={document.metadata.allowRemix ?? false}
                  onValueChange={(v) => updateMetadata({ allowRemix: v })}
                  trackColor={{ false: Colors.border, true: Colors.brand }}
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
                  trackColor={{ false: Colors.border, true: Colors.brand }}
                  accessibilityLabel="Public audience"
                />
              </View>

              <Text style={styles.sectionLabel}>Allow Replies</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Enable replies</Text>
                <Switch
                  value={document.metadata.allowReplies ?? true}
                  onValueChange={(v) => updateMetadata({ allowReplies: v })}
                  trackColor={{ false: Colors.border, true: Colors.brand }}
                  accessibilityLabel="Allow replies"
                />
              </View>

              <Text style={styles.sectionLabel}>Allow Reactions</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Enable reactions</Text>
                <Switch
                  value={document.metadata.allowReactions ?? true}
                  onValueChange={(v) => updateMetadata({ allowReactions: v })}
                  trackColor={{ false: Colors.border, true: Colors.brand }}
                  accessibilityLabel="Allow reactions"
                />
              </View>

              <Text style={styles.sectionLabel}>Expiry (hours)</Text>
              <TextInput
                style={styles.input}
                value={String(document.metadata.expiresInHours ?? 24)}
                onChangeText={(v) => {
                  const num = parseInt(v, 10);
                  if (!isNaN(num) && num > 0) updateMetadata({ expiresInHours: num });
                }}
                keyboardType="numeric"
                accessibilityLabel="Expiry in hours"
              />
            </>
          )}

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
              <Ionicons name="save-outline" size={16} color={Colors.surface} />
              <Text style={styles.saveBtnText}>Save Draft</Text>
            </Pressable>
          </View>
        </ScrollView>
    </SheetContainer>
  );
}

function RatioButton({ label, ratio, current, onSelect }: { label: string; ratio: number; current: number; onSelect: (r: number) => void }) {
  const { colors } = useAppTheme();
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
        { borderColor: isActive ? colors.brand : colors.border, backgroundColor: isActive ? `${colors.brand}10` : 'transparent' },
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

const styles = StyleSheet.create({
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
    width: 36,
    height: 36,
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
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Space.sm,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
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
    color: Colors.textPrimary,
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
    borderWidth: 1,
    gap: 6,
    minWidth: 72,
    minHeight: 72,
  },
  ratioPreview: {
    borderRadius: 4,
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
    fontSize: 12,
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
    color: Colors.textMuted,
  },
  retryBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
  },
  retryText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: Colors.brand,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: Colors.surface,
  },
  attributionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  attributionContent: {
    flex: 1,
    gap: 2,
  },
  attributionText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: Colors.textSecondary,
  },
  attributionDetail: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size - 2,
    color: Colors.textMuted,
  },
});
