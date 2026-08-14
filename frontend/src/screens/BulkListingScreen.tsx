import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  FadeInDown,
  FadeOutRight,
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeStackScreenProps, type RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { BottomSheet } from '../components/BottomSheet';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { makeStableId } from '../utils/createStableId';
import {
  validateBulkListing,
  submitBulkListings,
  type BulkListingItem,
  type BulkListingResult,
} from '../services/bulkListingApi';

type Props = NativeStackScreenProps<RootStackParamList, 'BulkListing'>;

const CATEGORY_OPTIONS = [
  'Women', 'Men', 'Kids', 'Home', 'Vintage', 'Accessories', 'Beauty', 'Sportswear', 'Luxury',
];
const CONDITION_OPTIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];

type ItemStatus = BulkListingItem['status'];

function makeTempId(): string {
  return makeStableId('draft');
}

function emptyDraft(): BulkListingItem {
  return {
    tempId: makeTempId(),
    title: '',
    description: '',
    price: 0,
    category: '',
    condition: '',
    brand: '',
    size: '',
    images: [],
    status: 'pending',
    errors: [],
  };
}

const STATUS_META: Record<ItemStatus, { label: string; colorKey: 'textMuted' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pending', colorKey: 'textMuted' },
  validating: { label: 'Validating', colorKey: 'warning' },
  ready: { label: 'Ready', colorKey: 'success' },
  error: { label: 'Error', colorKey: 'danger' },
};

export default function BulkListingScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const currentUser = useStore((s) => s.currentUser);
  const { show } = useToast();
  const { isOffline } = useConnectivity();

  const [items, setItems] = useState<BulkListingItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<'Category' | 'Condition' | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState({ done: 0, total: 0 });
  const [publishResults, setPublishResults] = useState<BulkListingResult[] | null>(null);

  // Sheet form state (used for both add and edit)
  const [form, setForm] = useState<BulkListingItem>(emptyDraft());

  const readyCount = items.filter((i) => i.status === 'ready').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const canPublish = items.length > 0 && !isPublishing && !isOffline;

  const updateItem = useCallback((tempId: string, patch: Partial<BulkListingItem>) => {
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((tempId: string) => {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId));
    setExpandedId((cur) => (cur === tempId ? null : cur));
  }, []);

  const openAddSheet = useCallback(() => {
    setEditingId(null);
    setForm(emptyDraft());
    setSheetVisible(true);
  }, []);

  const openEditSheet = useCallback((item: BulkListingItem) => {
    setEditingId(item.tempId);
    setForm({ ...item });
    setSheetVisible(true);
  }, []);

  const handlePickPhotos = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow gallery access to add photos.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uris = result.assets.map((a) => a.uri);
        setForm((prev) => ({ ...prev, images: [...prev.images, ...uris].slice(0, 10) }));
      }
    } catch {
      show('Could not open photo picker.', 'error');
    }
  }, [show]);

  const removePhoto = useCallback((index: number) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  }, []);

  const saveForm = useCallback(() => {
    const trimmed = { ...form, title: form.title.trim(), description: form.description.trim() };
    if (editingId) {
      // Re-validate on save when editing
      const result = validateBulkListing(trimmed);
      updateItem(editingId, { ...trimmed, status: result.valid ? 'ready' : 'pending', errors: result.errors });
    } else {
      const result = validateBulkListing(trimmed);
      const newItem: BulkListingItem = {
        ...trimmed,
        status: result.valid ? 'ready' : 'pending',
        errors: result.errors,
      };
      setItems((prev) => [...prev, newItem]);
    }
    setSheetVisible(false);
    haptics.selection();
  }, [form, editingId, updateItem]);

  const validateAll = useCallback(() => {
    haptics.selection();
    setItems((prev) =>
      prev.map((it) => {
        const result = validateBulkListing(it);
        return { ...it, status: result.valid ? 'ready' : 'error', errors: result.errors };
      }),
    );
    show(errorCount > 0 ? 'Some items need attention.' : 'All items ready to publish.', errorCount > 0 ? 'error' : 'success');
  }, [show, errorCount]);

  const publishAll = useCallback(async () => {
    if (!currentUser?.id) {
      show('Sign in to publish listings.', 'error');
      return;
    }
    if (isOffline) {
      show('You are offline. Connect to publish.', 'error');
      return;
    }
    // Validate everything first; only ready items are submitted.
    const validated = items.map((it) => {
      const result = validateBulkListing(it);
      return { ...it, status: result.valid ? 'ready' : 'error', errors: result.errors } as BulkListingItem;
    });
    setItems(validated);
    const ready = validated.filter((it) => it.status === 'ready');
    if (ready.length === 0) {
      show('Fix validation errors before publishing.', 'error');
      return;
    }

    setIsPublishing(true);
    setPublishResults(null);
    setPublishProgress({ done: 0, total: ready.length });
    try {
      const results = await submitBulkListings(ready, currentUser.id, (done, total) => {
        setPublishProgress({ done, total });
      });
      setPublishResults(results);
      const successes = results.filter((r) => r.success).length;
      const failures = results.length - successes;
      if (failures === 0) {
        show(`Published ${successes} listing${successes === 1 ? '' : 's'}.`, 'success');
        haptics.success();
        // Clear published drafts on full success
        setItems([]);
      } else {
        show(`Published ${successes}, ${failures} failed.`, 'error');
        haptics.error();
        // Keep failed items so the user can retry; remove successful ones
        const successTempIds = new Set(results.filter((r) => r.success).map((r) => r.tempId));
        setItems((prev) => prev.filter((it) => !successTempIds.has(it.tempId)));
      }
    } catch {
      show('Publishing failed. Try again.', 'error');
      haptics.error();
    } finally {
      setIsPublishing(false);
    }
  }, [items, currentUser?.id, isOffline, show]);

  const clearAll = useCallback(() => {
    if (items.length === 0) return;
    Alert.alert('Clear all drafts', 'Remove all draft listings from this batch?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setItems([]);
          setExpandedId(null);
          setPublishResults(null);
          haptics.selection();
        },
      },
    ]);
  }, [items.length]);

  const renderItem = useCallback(
    ({ item, index }: { item: BulkListingItem; index: number }) => (
      <BulkRow
        item={item}
        index={index}
        expanded={expandedId === item.tempId}
        colors={colors}
        styles={styles}
        reducedMotion={reducedMotion}
        onToggleExpand={() => setExpandedId((cur) => (cur === item.tempId ? null : item.tempId))}
        onTitleChange={(text) => updateItem(item.tempId, { title: text })}
        onPriceChange={(text) => {
          const numeric = parseFloat(text.replace(/[^0-9.]/g, ''));
          updateItem(item.tempId, { price: Number.isFinite(numeric) ? numeric : 0 });
        }}
        onEdit={() => openEditSheet(item)}
        onDelete={() => removeItem(item.tempId)}
      />
    ),
    [expandedId, colors, styles, reducedMotion, updateItem, openEditSheet, removeItem],
  );

  const pickerOptions = pickerMode === 'Category' ? CATEGORY_OPTIONS : CONDITION_OPTIONS;
  const pickerTitle = pickerMode === 'Category' ? 'Select category' : 'Select condition';
  const pickerSelected = pickerMode === 'Category' ? form.category : form.condition;

  const renderHeader = () => {
    if (items.length === 0) return null;
    return (
      <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(280)} style={styles.bulkBarWrap}>
        <View style={styles.bulkBar}>
          <Pressable
            style={({ pressed }) => [styles.bulkAction, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
            onPress={validateAll}
            disabled={isPublishing}
            accessibilityRole="button"
            accessibilityLabel="Validate all draft listings"
          >
            <Ionicons name="checkmark-done-outline" size={16} color={colors.brand} />
            <Text style={[styles.bulkActionText, { color: colors.brand }]}>Validate all</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.bulkAction, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
            onPress={publishAll}
            disabled={!canPublish}
            accessibilityRole="button"
            accessibilityLabel="Publish all ready listings"
          >
            <Ionicons name="cloud-upload-outline" size={16} color={canPublish ? colors.success : colors.textMuted} />
            <Text style={[styles.bulkActionText, { color: canPublish ? colors.success : colors.textMuted }]}>Publish all</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.bulkAction, { borderColor: colors.danger + '40' }, pressed && { opacity: 0.6 }]}
            onPress={clearAll}
            disabled={isPublishing}
            accessibilityRole="button"
            accessibilityLabel="Clear all draft listings"
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.bulkActionText, { color: colors.danger }]}>Clear all</Text>
          </Pressable>
        </View>
        {(readyCount > 0 || errorCount > 0) && (
          <View style={styles.statusSummaryRow}>
            {readyCount > 0 && (
              <Text style={[styles.statusSummaryText, { color: colors.success }]}>
                {readyCount} ready
              </Text>
            )}
            {errorCount > 0 && (
              <Text style={[styles.statusSummaryText, { color: colors.danger }]}>
                {errorCount} need attention
              </Text>
            )}
          </View>
        )}
      </Reanimated.View>
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Bulk List"
          subtitle={items.length > 0 ? `${items.length} draft${items.length === 1 ? '' : 's'}` : undefined}
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              style={styles.addBtn}
              onPress={openAddSheet}
              disabled={isPublishing}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Add a new draft listing"
            >
              <Ionicons name="add" size={22} color={colors.brand} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {items.length === 0 && !isPublishing ? (
        <View style={styles.emptyBody}>
          <EmptyState
            icon="layers-outline"
            title="Add your first item"
            subtitle="Build a batch of listings, then publish them all at once."
            ctaLabel="Add item"
            onCtaPress={openAddSheet}
          />
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.tempId}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Space.xl }]}
          ItemSeparatorComponent={() => <View style={styles.hairline} />}
          showsVerticalScrollIndicator={false}
          // Performance: bulk batches can grow large; FlashList v2 handles
          // recycling automatically.
        />
      )}

      {/* Publishing progress overlay */}
      {isPublishing && (
        <View style={styles.progressOverlay} pointerEvents="none">
          <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={[styles.progressText, { color: colors.textPrimary }]}>
              Publishing {publishProgress.done} of {publishProgress.total}…
            </Text>
          </View>
        </View>
      )}

      {/* Add / edit sheet */}
      <BottomSheet visible={sheetVisible} onDismiss={() => setSheetVisible(false)} snapPoint={0.82}>
        <DraftForm
          form={form}
          setForm={setForm}
          colors={colors}
          styles={styles}
          onPickPhotos={handlePickPhotos}
          onRemovePhoto={removePhoto}
          onOpenPicker={(mode) => setPickerMode(mode)}
          onSave={saveForm}
          onCancel={() => setSheetVisible(false)}
          isEditing={!!editingId}
        />
      </BottomSheet>

      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerTitle}
        options={pickerOptions}
        selectedValue={pickerSelected}
        searchable={pickerMode === 'Category'}
        onSelect={(value) => {
          if (pickerMode === 'Category') {
            setForm((prev) => ({ ...prev, category: value }));
          } else if (pickerMode === 'Condition') {
            setForm((prev) => ({ ...prev, condition: value }));
          }
        }}
      />
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface RowProps {
  item: BulkListingItem;
  index: number;
  expanded: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
  onToggleExpand: () => void;
  onTitleChange: (text: string) => void;
  onPriceChange: (text: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const BulkRow = React.memo(function BulkRow({
  item,
  index,
  expanded,
  colors,
  styles,
  reducedMotion,
  onToggleExpand,
  onTitleChange,
  onPriceChange,
  onEdit,
  onDelete,
}: RowProps) {
  const meta = STATUS_META[item.status];
  const statusColor = colors[meta.colorKey];
  const rotate = useSharedValue(expanded ? 1 : 0);

  React.useEffect(() => {
    rotate.value = withTiming(expanded ? 1 : 0, { duration: 200 });
  }, [expanded, rotate]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value * 180}deg` }],
  }));

  const enter = reducedMotion ? undefined : FadeInDown.duration(240).delay(Math.min(index * 40, 240));
  const exit = reducedMotion ? undefined : FadeOutRight.duration(180);

  return (
    <Reanimated.View entering={enter} exiting={exit} style={styles.rowWrap}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityLabel={`Draft ${item.title || 'untitled'}, status ${meta.label}. Tap to expand.`}
      >
        {/* Thumbnail */}
        {item.images[0] ? (
          <CachedImage uri={item.images[0]} style={styles.thumb} containerStyle={styles.thumbWrap} contentFit="cover" />
        ) : (
          <View style={[styles.thumbWrap, styles.thumbFallback]}>
            <Ionicons name="image-outline" size={18} color={colors.textMuted} />
          </View>
        )}

        {/* Inline-editable title + price */}
        <View style={styles.rowBody}>
          <View style={styles.rowTitleRow}>
            <TextInput
              style={[styles.rowTitleInput, { color: colors.textPrimary }]}
              value={item.title}
              placeholder="Untitled"
              placeholderTextColor={colors.textMuted}
              onChangeText={onTitleChange}
              numberOfLines={1}
              accessibilityLabel="Edit draft title"
            />
          </View>
          <View style={styles.rowPriceRow}>
            <Text style={[styles.pricePrefix, { color: colors.textMuted }]}>£</Text>
            <TextInput
              style={[styles.rowPriceInput, { color: colors.textPrimary }]}
              value={item.price > 0 ? String(item.price) : ''}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              onChangeText={onPriceChange}
              accessibilityLabel="Edit draft price"
            />
          </View>
          <View style={styles.rowStatusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{meta.label}</Text>
            {item.images.length > 0 && (
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {item.images.length} photo{item.images.length === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        </View>

        <Reanimated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Reanimated.View>
      </Pressable>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.expandedBody}>
          {item.errors && item.errors.length > 0 && (
            <View style={styles.errorList}>
              {item.errors.map((err, i) => (
                <Text key={i} style={[styles.errorText, { color: colors.danger }]}>
                  • {err}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.expandedMetaRow}>
            {item.category ? (
              <Text style={[styles.expandedMetaText, { color: colors.textSecondary }]}>
                {item.category}
              </Text>
            ) : (
              <Text style={[styles.expandedMetaText, { color: colors.textMuted }]}>No category</Text>
            )}
            {item.condition ? (
              <Text style={[styles.expandedMetaText, { color: colors.textSecondary }]}>
                {item.condition}
              </Text>
            ) : (
              <Text style={[styles.expandedMetaText, { color: colors.textMuted }]}>No condition</Text>
            )}
          </View>
          {item.description ? (
            <Text style={[styles.expandedDesc, { color: colors.textSecondary }]} numberOfLines={3}>
              {item.description}
            </Text>
          ) : null}
          <View style={styles.expandedActions}>
            <AppButton title="Edit" variant="secondary" size="sm" onPress={onEdit} hapticFeedback="light" />
            <AppButton
              title="Delete"
              variant="ghost"
              size="sm"
              onPress={onDelete}
              titleStyle={{ color: colors.danger }}
              hapticFeedback="medium"
              accessibilityLabel="Delete this draft"
            />
          </View>
        </View>
      )}
    </Reanimated.View>
  );
});

// ---------------------------------------------------------------------------
// Draft form (inside BottomSheet)
// ---------------------------------------------------------------------------

interface DraftFormProps {
  form: BulkListingItem;
  setForm: React.Dispatch<React.SetStateAction<BulkListingItem>>;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onPickPhotos: () => void;
  onRemovePhoto: (index: number) => void;
  onOpenPicker: (mode: 'Category' | 'Condition') => void;
  onSave: () => void;
  onCancel: () => void;
  isEditing: boolean;
}

function DraftForm({
  form,
  setForm,
  colors,
  styles,
  onPickPhotos,
  onRemovePhoto,
  onOpenPicker,
  onSave,
  onCancel,
  isEditing,
}: DraftFormProps) {
  const validation = validateBulkListing(form);

  return (
    <View style={styles.formWrap}>
      <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
        {isEditing ? 'Edit draft' : 'New draft'}
      </Text>

      {/* Photos */}
      <View style={styles.photoSection}>
        <View style={styles.photoRow}>
          {form.images.map((uri, i) => (
            <View key={`${uri}-${i}`} style={[styles.photoTile, { borderColor: colors.border }]}>
              <CachedImage uri={uri} style={styles.photoImg} containerStyle={styles.photoImgWrap} contentFit="cover" />
              <Pressable
                style={({ pressed }) => [styles.photoRemove, { backgroundColor: colors.danger }, pressed && { opacity: 0.6 }]}
                onPress={() => onRemovePhoto(i)}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Ionicons name="close" size={12} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
          {form.images.length < 10 && (
            <Pressable
              style={({ pressed }) => [styles.photoAdd, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }, pressed && { opacity: 0.6 }]}
              onPress={onPickPhotos}
              accessibilityRole="button"
              accessibilityLabel="Add photos"
            >
              <Ionicons name="camera-outline" size={20} color={colors.brand} />
              <Text style={[styles.photoAddText, { color: colors.brand }]}>Add</Text>
            </Pressable>
          )}
        </View>
      </View>

      <AppInput
        label="Title"
        value={form.title}
        onChangeText={(text) => setForm((prev) => ({ ...prev, title: text }))}
        placeholder="e.g. Nike Tech Fleece Hoodie"
        containerStyle={styles.field}
      />

      <AppInput
        label="Description"
        value={form.description}
        onChangeText={(text) => setForm((prev) => ({ ...prev, description: text }))}
        placeholder="Condition details, fit, flaws…"
        multiline
        containerStyle={styles.field}
        inputStyle={{ minHeight: Space.xxl + Space.xxl }}
      />

      <View style={styles.fieldRow}>
        <AppInput
          label="Price (GBP)"
          value={form.price > 0 ? String(form.price) : ''}
          onChangeText={(text) => {
            const numeric = parseFloat(text.replace(/[^0-9.]/g, ''));
            setForm((prev) => ({ ...prev, price: Number.isFinite(numeric) ? numeric : 0 }));
          }}
          placeholder="0.00"
          keyboardType="decimal-pad"
          prefix="£"
          containerStyle={[styles.field, { flex: 1 }]}
        />
        <AppInput
          label="Brand"
          value={form.brand ?? ''}
          onChangeText={(text) => setForm((prev) => ({ ...prev, brand: text }))}
          placeholder="Optional"
          containerStyle={[styles.field, { flex: 1 }]}
        />
      </View>

      <View style={styles.fieldRow}>
        <Pressable
          style={({ pressed }) => [styles.pickerField, { borderColor: colors.border, backgroundColor: colors.input }, pressed && { opacity: 0.6 }]}
          onPress={() => onOpenPicker('Category')}
          accessibilityRole="button"
          accessibilityLabel="Select category"
        >
          <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Category</Text>
          <View style={styles.pickerValueRow}>
            <Text style={[styles.pickerValue, { color: form.category ? colors.textPrimary : colors.textMuted }]}>
              {form.category || 'Select…'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.pickerField, { borderColor: colors.border, backgroundColor: colors.input }, pressed && { opacity: 0.6 }]}
          onPress={() => onOpenPicker('Condition')}
          accessibilityRole="button"
          accessibilityLabel="Select condition"
        >
          <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Condition</Text>
          <View style={styles.pickerValueRow}>
            <Text style={[styles.pickerValue, { color: form.condition ? colors.textPrimary : colors.textMuted }]}>
              {form.condition || 'Select…'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </View>
        </Pressable>
      </View>

      <AppInput
        label="Size"
        value={form.size ?? ''}
        onChangeText={(text) => setForm((prev) => ({ ...prev, size: text }))}
        placeholder="Optional"
        containerStyle={styles.field}
      />

      {!validation.valid && (form.title || form.price > 0 || form.images.length > 0) && (
        <View style={styles.formErrorList}>
          {validation.errors.map((err, i) => (
            <Text key={i} style={[styles.formErrorText, { color: colors.danger }]}>
              • {err}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.formActions}>
        <AppButton title="Cancel" variant="ghost" size="md" onPress={onCancel} style={{ flex: 1 }} />
        <AppButton
          title={isEditing ? 'Save changes' : 'Add to batch'}
          variant="primary"
          size="md"
          onPress={onSave}
          style={{ flex: 1 }}
          hapticFeedback="light"
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    addBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBody: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.md,
    },
    list: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: 0,
    },
    bulkBarWrap: {
      marginBottom: Space.sm,
    },
    bulkBar: {
      flexDirection: 'row',
      gap: Space.xs,
    },
    bulkAction: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit,
    },
    bulkActionText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
    },
    statusSummaryRow: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.xs,
      paddingHorizontal: Space.xs,
    },
    statusSummaryText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
    },
    rowWrap: {
      backgroundColor: colors.background,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.sm + 2,
    },
    thumbWrap: {
      width: Space.xxl + Space.xs,
      height: Space.xxl + Space.xs,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    thumb: {
      width: Space.xxl + Space.xs,
      height: Space.xxl + Space.xs,
    },
    thumbFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: {
      flex: 1,
      gap: Space.xs,
    },
    rowTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowTitleInput: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      padding: 0,
    },
    rowPriceRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    pricePrefix: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
    },
    rowPriceInput: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      padding: 0,
      minWidth: Space.xxl + Space.xs,
    },
    rowStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
    },
    statusDot: {
      width: Space.xs / 2 + 1,
      height: Space.xs / 2 + 1,
      borderRadius: Radius.sm,
    },
    statusText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },
    metaText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
    },
    expandedBody: {
      paddingTop: Space.xs,
      paddingBottom: Space.sm,
      paddingLeft: (Space.xxl + Space.xs) + Space.md,
      gap: Space.xs,
    },
    errorList: {
      gap: Space.xs / 2,
    },
    errorText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
    },
    expandedMetaRow: {
      flexDirection: 'row',
      gap: Space.md,
    },
    expandedMetaText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
    expandedDesc: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
    expandedActions: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    progressOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    progressCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
    },
    progressText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    // Form
    formWrap: {
      gap: Space.sm,
      paddingBottom: Space.lg,
    },
    formTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
    },
    photoSection: {
      marginBottom: Space.xs,
    },
    photoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
    },
    photoTile: {
      width: Space.xxl + Space.xxl,
      height: Space.xxl + Space.xxl,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      overflow: 'hidden',
    },
    photoImgWrap: {
      width: Space.xxl + Space.xxl,
      height: Space.xxl + Space.xxl,
    },
    photoImg: {
      width: Space.xxl + Space.xxl,
      height: Space.xxl + Space.xxl,
    },
    photoRemove: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: Space.md + 2,
      height: Space.md + 2,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoAdd: {
      width: Space.xxl + Space.xxl,
      height: Space.xxl + Space.xxl,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
    },
    photoAddText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },
    field: {
      marginBottom: 0,
    },
    fieldRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    pickerField: {
      flex: 1,
      borderWidth: Stroke.standard,
      borderRadius: Radius.xl,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      gap: Space.xs / 2,
      minHeight: Control.hit + Space.sm,
      justifyContent: 'center',
    },
    pickerLabel: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
    },
    pickerValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pickerValue: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.medium,
    },
    formErrorList: {
      gap: Space.xs / 2,
      paddingHorizontal: Space.xs,
    },
    formErrorText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
    },
    formActions: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.sm,
    },
  });
}
