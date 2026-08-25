/**
 * CatalogImportItemScreen — the focused item editor for the Concierge
 * Catalogue Importer (blueprint §5.4).
 *
 * The dominant objects are the listing media and the field diff — not metric
 * cards or decorative chrome. Composition is flat: a title, a horizontal
 * media rail, a hairline-separated field diff list, a two-state seller
 * decision, and — only when present — a compact blocking-issues list with a
 * pinned issue navigator at the bottom. One radius grammar, one stroke
 * grammar, one press feedback, full state coverage.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  Type,
  FontFamily,
  Stroke,
  Control,
} from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ImportedFieldDiff } from '../components/catalogImport/ImportedFieldDiff';
import { ImportIssueNavigator } from '../components/catalogImport/ImportIssueNavigator';
import {
  fetchImportItem,
  patchImportItem,
  CatalogImportError,
  type ImportItemDTO,
  type ImportMediaDTO,
  type BlockingIssue,
  type SellerDecision,
} from '../services/catalogImportApi';
import type { CatalogImportStackParamList } from './CatalogImportStartScreen';

type Nav = NativeStackNavigationProp<CatalogImportStackParamList, 'CatalogImportItem'>;
type ItemRoute = RouteProp<CatalogImportStackParamList, 'CatalogImportItem'>;

// ── Material fields shown in the diff list, in reading order ─────────────────
// Each entry maps a human-readable label to the normalisedFields key used by
// the backend patch endpoint (`fields: Record<string, unknown>`).
interface FieldSpec {
  key: string;
  label: string;
}

const FIELD_SPECS: readonly FieldSpec[] = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'price_gbp', label: 'Price' },
  { key: 'currency', label: 'Currency' },
  { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' },
  { key: 'size', label: 'Size' },
  { key: 'condition', label: 'Condition' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'sku', label: 'SKU' },
];

const THUMB_SIZE = 100;
const WARNING_GLYPH_SIZE = 14;

type Confidence = 'high' | 'medium' | 'low';

interface NormalisedField {
  value: unknown;
  sourceKind?: string;
  sourceValue?: unknown;
  confidence?: Confidence;
  mappingVersion?: number;
  reasonCode?: string;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json && json !== 'null' ? json : null;
  } catch {
    return null;
  }
}

function normaliseConfidence(raw: unknown): Confidence {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  // Numeric confidence 0–1 → band. Conservative thresholds.
  if (typeof raw === 'number') {
    if (raw >= 0.85) return 'high';
    if (raw >= 0.5) return 'medium';
    return 'low';
  }
  return 'medium';
}

export default function CatalogImportItemScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ItemRoute>();
  const { itemId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [item, setItem] = useState<ImportItemDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patching, setPatching] = useState(false);
  const [issueIndex, setIssueIndex] = useState(0);

  // Inline edit modal state
  const [editing, setEditing] = useState<{ fieldKey: string; label: string; current: string } | null>(null);
  const [draftValue, setDraftValue] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchImportItem(itemId);
      if (!isMountedRef.current) return;
      setItem(data);
      setIssueIndex(0);
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Couldn’t load item.';
      setError(message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const verifiedMedia = useMemo<ImportMediaDTO[]>(() => {
    if (!item?.media) return [];
    return item.media
      .filter((m) => m.fetchStatus === 'verified' && m.previewUrl)
      .sort((a, b) => a.position - b.position);
  }, [item]);

  const fields = useMemo<Record<string, NormalisedField>>(() => {
    const raw = item?.normalisedFields;
    if (!raw || typeof raw !== 'object') return {};
    return raw as Record<string, NormalisedField>;
  }, [item]);

  const titleText = useMemo(() => {
    const titleField = fields['title'];
    return stringify(titleField?.value) ?? 'Untitled item';
  }, [fields]);

  const blockingIssues = useMemo<BlockingIssue[]>(() => {
    if (!item?.blockingIssues) return [];
    return item.blockingIssues;
  }, [item]);

  const sellerDecision = useMemo<SellerDecision>(
    () => item?.sellerDecision ?? 'undecided',
    [item]
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const applyPatch = useCallback(
    async (patch: { fields: Record<string, unknown>; sellerDecision?: 'selected' | 'excluded' }) => {
      if (!item) return;
      setPatching(true);
      try {
        const updated = await patchImportItem(item.id, item.fieldRevision, patch);
        if (!isMountedRef.current) return;
        setItem(updated);
      } catch (cause) {
        if (!isMountedRef.current) return;
        // Stale revision or network failure — reload to resync and surface a
        // minimal inline error rather than silently swallowing it.
        const message =
          cause instanceof CatalogImportError ? cause.message : 'Couldn’t save the change.';
        setError(message);
        void load();
      } finally {
        if (isMountedRef.current) setPatching(false);
      }
    },
    [item, load]
  );

  const handleStartEdit = useCallback(
    (fieldKey: string, label: string) => {
      const field = fields[fieldKey];
      const current = stringify(field?.value) ?? '';
      setEditing({ fieldKey, label, current });
      setDraftValue(current);
    },
    [fields]
  );

  const handleCancelEdit = useCallback(() => {
    setEditing(null);
    setDraftValue('');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editing) return;
    const { fieldKey, current } = editing;
    const next = draftValue.trim();
    if (next === current) {
      handleCancelEdit();
      return;
    }
    const fieldsPatch: Record<string, unknown> = { [fieldKey]: next };
    void applyPatch({ fields: fieldsPatch });
    handleCancelEdit();
  }, [editing, draftValue, applyPatch, handleCancelEdit]);

  const handleInclude = useCallback(() => {
    if (sellerDecision === 'selected') return;
    void applyPatch({ fields: {}, sellerDecision: 'selected' });
  }, [sellerDecision, applyPatch]);

  const handleExclude = useCallback(() => {
    if (sellerDecision === 'excluded') return;
    void applyPatch({ fields: {}, sellerDecision: 'excluded' });
  }, [sellerDecision, applyPatch]);

  const handlePreviousIssue = useCallback(() => {
    setIssueIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNextIssue = useCallback(() => {
    setIssueIndex((i) => Math.min(blockingIssues.length - 1, i + 1));
  }, [blockingIssues.length]);

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleRetry = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={handleBack} />
        </View>
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.stateText}>Loading item…</Text>
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !item) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={handleBack} />
        </View>
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Couldn’t load item</Text>
          <AnimatedPressable
            style={styles.retryHit}
            onPress={handleRetry}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryText}>Try again</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <BackButton colors={colors} onPress={handleBack} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              insets.bottom +
              (blockingIssues.length > 0 ? Space.lg + 72 : Space.lg),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Title — the screen identity, no duplicate heading ── */}
        <Text style={styles.title} numberOfLines={2}>
          {titleText}
        </Text>

        {/* ── Media rail — the dominant visual object ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaRail}
        >
          {verifiedMedia.length > 0 ? (
            verifiedMedia.map((media) => (
              <ExpoImage
                key={media.id}
                source={{ uri: media.previewUrl as string }}
                style={styles.thumb}
                contentFit="cover"
                transition={120}
                recyclingKey={media.id}
                cachePolicy="memory-disk"
              />
            ))
          ) : (
            <View style={styles.mediaPlaceholder}>
              <Ionicons
                name="image-outline"
                size={Control.icon}
                color={colors.textMuted}
              />
            </View>
          )}
        </ScrollView>

        {/* ── Seller decision — two-state, no decorative chrome ── */}
        <View style={styles.decisionRow}>
          <DecisionButton
            label="Include"
            selected={sellerDecision === 'selected'}
            onPress={handleInclude}
            disabled={patching}
            colors={colors}
            styles={styles}
          />
          <DecisionButton
            label="Exclude"
            selected={sellerDecision === 'excluded'}
            onPress={handleExclude}
            disabled={patching}
            colors={colors}
            styles={styles}
          />
        </View>

        {/* ── Blocking issues — compact list, glyph + text only ── */}
        {blockingIssues.length > 0 ? (
          <View style={styles.issuesBlock}>
            {blockingIssues.map((issue, i) => (
              <View
                key={`${issue.code}-${i}`}
                style={i > 0 ? styles.issueSeparator : undefined}
              >
                <View style={styles.issueRow}>
                  <Ionicons
                    name="alert-circle"
                    size={WARNING_GLYPH_SIZE}
                    color={colors.warning}
                    style={styles.issueGlyph}
                  />
                  <View style={styles.issueText}>
                    <Text style={styles.issueMessage}>{issue.message}</Text>
                    {issue.recoveryHint ? (
                      <Text style={styles.issueHint} numberOfLines={2}>
                        {issue.recoveryHint}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Field diffs — the material content, hairline-separated ── */}
        <View style={styles.diffList}>
          {FIELD_SPECS.map((spec) => {
            const field = fields[spec.key];
            if (!field) return null;
            const imported = stringify(field.sourceValue);
            const resolved = stringify(field.value);
            // Skip fields with neither a resolved nor imported value — they
            // add noise without information.
            if (imported === null && resolved === null) return null;
            return (
              <ImportedFieldDiff
                key={spec.key}
                fieldName={spec.key}
                label={spec.label}
                importedValue={imported}
                resolvedValue={resolved}
                confidence={normaliseConfidence(field.confidence)}
                onEdit={() => handleStartEdit(spec.key, spec.label)}
              />
            );
          })}
        </View>
      </ScrollView>

      {/* ── Issue navigator — pinned, only when issues exist ── */}
      {blockingIssues.length > 0 ? (
        <View style={styles.navigatorWrap}>
          <ImportIssueNavigator
            issues={blockingIssues}
            currentIndex={Math.min(issueIndex, blockingIssues.length - 1)}
            total={blockingIssues.length}
            onPrevious={handlePreviousIssue}
            onNext={handleNextIssue}
          />
        </View>
      ) : null}

      {/* ── Inline edit modal — minimal, single field ── */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancelEdit}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>
              {editing?.label ?? 'Edit field'}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.input, color: colors.inputText, borderColor: colors.border }]}
              value={draftValue}
              onChangeText={setDraftValue}
              autoFocus
              multiline
              maxLength={2000}
              placeholder={editing?.current || 'Enter a value'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={`${editing?.label ?? 'Field'} value`}
            />
            <View style={styles.modalActions}>
              <AnimatedPressable
                style={styles.modalActionHit}
                onPress={handleCancelEdit}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.modalActionHit}
                onPress={handleSaveEdit}
                disabled={patching}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Save field"
              >
                <Text style={styles.modalSaveText}>
                  {patching ? 'Saving…' : 'Save'}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Back button — transparent 44pt hit, 22pt glyph, no chrome ────────────────
function BackButton({
  colors,
  onPress,
}: {
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={stylesShared.backHit}
    >
      <Ionicons name="chevron-back" size={Control.icon} color={colors.textPrimary} />
    </AnimatedPressable>
  );
}

// ── Seller decision button — pill, two-state, 44pt hit ───────────────────────
function DecisionButton({
  label,
  selected,
  onPress,
  disabled,
  colors,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <AnimatedPressable
      style={[
        styles.decisionButton,
        selected
          ? { backgroundColor: colors.brandSubtle }
          : { backgroundColor: 'transparent' },
      ]}
      onPress={onPress}
      disabled={disabled}
      hapticFeedback="selection"
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${label} item`}
    >
      <Text
        style={[
          styles.decisionLabel,
          { color: selected ? colors.brand : colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// Shared static styles referenced by subcomponents before the themed factory
// is available. Kept minimal — only the back hit target.
const stylesShared = StyleSheet.create({
  backHit: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── Styles ───────────────────────────────────────────────────────────────────
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.xs,
      minHeight: Control.hit,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      flexGrow: 1,
    },
    stateWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.smMd,
    },
    stateText: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
    },
    stateTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      letterSpacing: Type.subtitle.letterSpacing,
      color: colors.textPrimary,
    },
    retryHit: {
      minHeight: Control.hit,
      paddingHorizontal: Space.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.brand,
    },
    title: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      letterSpacing: Type.subtitle.letterSpacing,
      color: colors.textPrimary,
    },
    mediaRail: {
      paddingVertical: Space.md,
      gap: Space.sm,
    },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: Radius.md,
    },
    mediaPlaceholder: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    decisionRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingVertical: Space.sm,
    },
    decisionButton: {
      minHeight: Control.hit,
      borderRadius: Radius.full,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.smMd,
      alignItems: 'center',
      justifyContent: 'center',
    },
    decisionLabel: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.label.size,
      lineHeight: Type.label.lineHeight,
      letterSpacing: Type.label.letterSpacing,
      textTransform: 'uppercase',
    },
    issuesBlock: {
      marginTop: Space.sm,
      marginBottom: Space.sm,
    },
    issueSeparator: {
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.borderSubtle,
      marginTop: Space.sm,
      paddingTop: Space.sm,
    },
    issueRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
    },
    issueGlyph: {
      flexShrink: 0,
      marginTop: 2,
    },
    issueText: {
      flex: 1,
      gap: Space.xxs,
    },
    issueMessage: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      color: colors.textPrimary,
    },
    issueHint: {
      fontFamily: FontFamily.regular,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      color: colors.textMuted,
    },
    diffList: {
      marginTop: Space.sm,
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.border,
    },
    navigatorWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    // ── Modal ──
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
    },
    modalCard: {
      width: '100%',
      borderRadius: Radius.lg,
      padding: Space.md,
      gap: Space.md,
    },
    modalTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      letterSpacing: Type.subtitle.letterSpacing,
      color: colors.textPrimary,
    },
    modalInput: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.sm,
      minHeight: 96,
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      textAlignVertical: 'top',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Space.xs,
    },
    modalActionHit: {
      minHeight: Control.hit,
      paddingHorizontal: Space.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textMuted,
    },
    modalSaveText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.brand,
    },
  });
