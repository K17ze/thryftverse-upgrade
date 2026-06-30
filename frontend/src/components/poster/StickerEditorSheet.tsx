import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import { useToast } from '../../context/ToastContext';
import { searchUsers, type UserSearchResult } from '../../services/profileApi';
import { fetchListingsFromApi } from '../../services/listingsApi';
import { fetchLooksFromApi } from '../../services/looksApi';
import { createStableId } from '../../utils/createStableId';
import type {
  PosterStickerType,
  PosterTextStyle,
  PosterStickerPayload,
} from '../../services/postersApi';
import type { ComposerFrame } from './PosterFrameStrip';

const { width: SCREEN_W } = Dimensions.get('window');

const TEXT_STYLES: Array<{ value: PosterTextStyle; label: string }> = [
  { value: 'editorial', label: 'Editorial' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'label', label: 'Label' },
  { value: 'outline', label: 'Outline' },
];

const TEXT_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55'];
const BG_COLORS = ['transparent', '#000000', '#ffffff', '#ff3b30', '#007aff', '#5856d6', '#4cd964'];
const ALIGNMENTS: Array<{ value: 'left' | 'center' | 'right'; icon: string }> = [
  { value: 'left', icon: 'text-align-left' },
  { value: 'center', icon: 'text-align-center' },
  { value: 'right', icon: 'text-align-right' },
];

const MAX_TEXT_LENGTH = 200;
const MAX_QUESTION_LENGTH = 100;
const MAX_OPTION_LENGTH = 50;
const MAX_TITLE_LENGTH = 50;

export interface StickerEditorSheetProps {
  visible: boolean;
  stickerType: PosterStickerType | null;
  existingSticker?: ComposerFrame['stickers'][0] | null;
  onSave: (payload: PosterStickerPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function StickerEditorSheet({
  visible,
  stickerType,
  existingSticker,
  onSave,
  onDelete,
  onClose,
}: StickerEditorSheetProps) {
  if (!visible || !stickerType) return null;

  return (
    <StickerEditorContent
      key={existingSticker?.id ?? stickerType}
      stickerType={stickerType}
      existingSticker={existingSticker}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}

interface ContentProps {
  stickerType: PosterStickerType;
  existingSticker?: ComposerFrame['stickers'][0] | null;
  onSave: (payload: PosterStickerPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}

function StickerEditorContent({
  stickerType,
  existingSticker,
  onSave,
  onDelete,
  onClose,
}: ContentProps) {
  const { show } = useToast();

  switch (stickerType) {
    case 'text':
      return (
        <TextStickerEditor
          existingPayload={existingSticker?.payload as PosterStickerPayload | undefined}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      );
    case 'mention':
      return (
        <MentionStickerEditor
          existingPayload={existingSticker?.payload as PosterStickerPayload | undefined}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      );
    case 'listing':
      return (
        <ListingStickerEditor
          existingPayload={existingSticker?.payload as PosterStickerPayload | undefined}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      );
    case 'look':
      return (
        <LookStickerEditor
          existingPayload={existingSticker?.payload as PosterStickerPayload | undefined}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      );
    case 'style_vote':
      return (
        <StyleVoteStickerEditor
          existingPayload={existingSticker?.payload as PosterStickerPayload | undefined}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}

// ── Shared Sheet Wrapper ────────────────────────────────────────────

function SheetShell({
  title,
  onClose,
  onDelete,
  children,
  canDelete,
}: {
  title: string;
  onClose: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
  canDelete?: boolean;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.overlay}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <View style={styles.headerActions}>
            {canDelete && onDelete && (
              <Pressable
                onPress={onDelete}
                style={styles.deleteBtn}
                accessibilityLabel="Delete sticker"
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close editor"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Text Sticker Editor ─────────────────────────────────────────────

function TextStickerEditor({
  existingPayload,
  onSave,
  onDelete,
  onClose,
}: {
  existingPayload?: PosterStickerPayload;
  onSave: (payload: PosterStickerPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(existingPayload?.text ?? '');
  const [textStyle, setTextStyle] = useState<PosterTextStyle>(
    existingPayload?.textStyle ?? 'editorial'
  );
  const [textColor, setTextColor] = useState(existingPayload?.textColor ?? '#ffffff');
  const [bgColor, setBgColor] = useState(existingPayload?.backgroundColor ?? 'transparent');
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>(
    existingPayload?.alignment ?? 'center'
  );

  const canSave = text.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      text: text.trim(),
      textStyle,
      textColor,
      backgroundColor: bgColor === 'transparent' ? undefined : bgColor,
      alignment,
    });
  };

  return (
    <SheetShell
      title="Text Sticker"
      onClose={onClose}
      onDelete={onDelete}
      canDelete={!!existingPayload}
    >
      <ScrollView style={styles.scrollBody} keyboardShouldPersistTaps="handled">
        {/* Live preview */}
        <View style={[styles.previewArea, { backgroundColor: '#1a1a1a' }]}>
          <View
            style={[
              styles.previewTextWrap,
              bgColor !== 'transparent' && { backgroundColor: bgColor },
              alignment === 'left' && { alignItems: 'flex-start' },
              alignment === 'right' && { alignItems: 'flex-end' },
            ]}
          >
            <Text
              style={[
                styles.previewText,
                { color: textColor },
                textStyle === 'editorial' && { fontFamily: Typography.family.bold, fontSize: Type.title.size },
                textStyle === 'minimal' && { fontFamily: Typography.family.light, fontSize: Type.body.size },
                textStyle === 'label' && { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, letterSpacing: 0.5 },
                textStyle === 'outline' && { fontFamily: Typography.family.medium, fontSize: Type.body.size },
              ]}
            >
              {text || 'Preview'}
            </Text>
          </View>
        </View>

        {/* Text input */}
        <TextInput
          style={styles.textInput}
          placeholder="Enter sticker text"
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_TEXT_LENGTH}
          autoFocus
          accessibilityLabel="Sticker text"
        />
        <Text style={styles.charCount}>
          {text.length}/{MAX_TEXT_LENGTH}
        </Text>

        {/* Style selector */}
        <Text style={styles.sectionLabel}>Style</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
          {TEXT_STYLES.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => setTextStyle(s.value)}
              style={[styles.optionChip, textStyle === s.value && styles.optionChipActive]}
            >
              <Text style={[styles.optionChipText, textStyle === s.value && styles.optionChipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Text color */}
        <Text style={styles.sectionLabel}>Text colour</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
          {TEXT_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setTextColor(c)}
              style={[
                styles.colorDot,
                { backgroundColor: c, borderColor: c === '#ffffff' ? Colors.border : 'transparent' },
                textColor === c && styles.colorDotActive,
              ]}
              accessibilityLabel={`Text colour ${c}`}
            />
          ))}
        </ScrollView>

        {/* Background color */}
        <Text style={styles.sectionLabel}>Background</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
          {BG_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setBgColor(c)}
              style={[
                styles.colorDot,
                c === 'transparent'
                  ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' as const }
                  : { backgroundColor: c },
                bgColor === c && styles.colorDotActive,
              ]}
              accessibilityLabel={`Background colour ${c}`}
            >
              {c === 'transparent' && (
                <Ionicons name="close" size={12} color={Colors.textMuted} />
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Alignment */}
        <Text style={styles.sectionLabel}>Alignment</Text>
        <View style={styles.alignmentRow}>
          {ALIGNMENTS.map((a) => (
            <Pressable
              key={a.value}
              onPress={() => setAlignment(a.value)}
              style={[styles.alignBtn, alignment === a.value && styles.alignBtnActive]}
              accessibilityLabel={`Align ${a.value}`}
              accessibilityRole="button"
            >
              <Ionicons name={a.icon as any} size={18} color={alignment === a.value ? '#fff' : Colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footerBar}>
        <Pressable
          onPress={handleSave}
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          disabled={!canSave}
          accessibilityLabel="Save text sticker"
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

// ── Mention Sticker Editor ──────────────────────────────────────────

function MentionStickerEditor({
  existingPayload,
  onSave,
  onDelete,
  onClose,
}: {
  existingPayload?: PosterStickerPayload;
  onSave: (payload: PosterStickerPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<UserSearchResult | null>(
    existingPayload?.userId && existingPayload?.username
      ? {
          id: existingPayload.userId,
          username: existingPayload.username,
          displayName: null,
          avatar: null,
        }
      : null
  );

  const debouncedSearch = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (q: string) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (q.trim().length < 1) {
          setResults([]);
          return;
        }
        setIsSearching(true);
        try {
          const res = await searchUsers(q, 20);
          setResults(res);
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    };
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (!selected) debouncedSearch(q);
  };

  const handleSelect = (user: UserSearchResult) => {
    setSelected(user);
    setQuery('');
    setResults([]);
  };

  const handleSave = () => {
    if (!selected) return;
    onSave({
      userId: selected.id,
      username: selected.username,
    });
  };

  const handleClearSelection = () => {
    setSelected(null);
    setQuery('');
  };

  return (
    <SheetShell
      title="Mention Sticker"
      onClose={onClose}
      onDelete={onDelete}
      canDelete={!!existingPayload}
    >
      {selected ? (
        <View style={styles.selectedUserRow}>
          <View style={styles.selectedUserAvatar}>
            <Text style={styles.selectedUserAvatarText}>
              {selected.username[0]?.toUpperCase()}
            </Text>
          </View>
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName}>@{selected.username}</Text>
            {selected.displayName && (
              <Text style={styles.selectedUserDisplayName}>{selected.displayName}</Text>
            )}
          </View>
          <Pressable
            onPress={handleClearSelection}
            style={styles.clearSelectionBtn}
            accessibilityLabel="Change user"
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by username..."
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={handleQueryChange}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search users"
            />
            {isSearching && <ActivityIndicator size="small" color={Colors.brand} />}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={styles.userResultRow}
                accessibilityLabel={`Select @${item.username}`}
                accessibilityRole="button"
              >
                <View style={styles.userResultAvatar}>
                  <Text style={styles.userResultAvatarText}>
                    {item.username[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userResultInfo}>
                  <Text style={styles.userResultName}>@{item.username}</Text>
                  {item.displayName && (
                    <Text style={styles.userResultDisplayName}>{item.displayName}</Text>
                  )}
                </View>
              </Pressable>
            )}
            style={styles.userList}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              query.trim().length > 0 && !isSearching ? (
                <View style={styles.emptySearch}>
                  <Text style={styles.emptySearchText}>No users found</Text>
                </View>
              ) : null
            }
          />
        </>
      )}

      <View style={styles.footerBar}>
        <Pressable
          onPress={handleSave}
          style={[styles.saveBtn, !selected && styles.saveBtnDisabled]}
          disabled={!selected}
          accessibilityLabel="Save mention sticker"
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

// ── Listing Sticker Editor ──────────────────────────────────────────

interface ListingSearchItem {
  id: string;
  title: string;
  priceGbp: number;
  imageUrl: string | null;
  status: string;
}

function ListingStickerEditor({
  existingPayload,
  onSave,
  onDelete,
  onClose,
}: {
  existingPayload?: PosterStickerPayload;
  onSave: (payload: PosterStickerPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [allListings, setAllListings] = useState<ListingSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<ListingSearchItem | null>(
    existingPayload?.listingId
      ? {
          id: existingPayload.listingId,
          title: existingPayload.snapshotTitle ?? '',
          priceGbp: existingPayload.snapshotPriceGbp ?? 0,
          imageUrl: existingPayload.snapshotImageUrl ?? null,
          status: 'active',
        }
      : null
  );

  useEffect(() => {
    fetchListingsFromApi()
      .then((res) => {
        const items: ListingSearchItem[] = res.listings
          .filter((l) => l.isSold !== true)
          .map((l) => ({
            id: l.id,
            title: l.title,
            priceGbp: l.price,
            imageUrl: l.images?.[0] ?? null,
            status: 'active',
          }));
        setAllListings(items);
        setLoadFailed(false);
      })
      .catch(() => {
        setLoadFailed(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allListings;
    const q = query.trim().toLowerCase();
    return allListings.filter((l) => l.title.toLowerCase().includes(q));
  }, [allListings, query]);

  const handleSave = () => {
    if (!selected) return;
    onSave({
      listingId: selected.id,
      snapshotTitle: selected.title,
      snapshotImageUrl: selected.imageUrl ?? undefined,
      snapshotPriceGbp: selected.priceGbp,
    });
  };

  const handleClearSelection = () => {
    setSelected(null);
    setQuery('');
  };

  return (
    <SheetShell
      title="Listing Sticker"
      onClose={onClose}
      onDelete={onDelete}
      canDelete={!!existingPayload}
    >
      {selected ? (
        <View style={styles.selectedUserRow}>
          <View style={styles.selectedListingThumb}>
            {selected.imageUrl ? (
              <Text style={styles.selectedListingIcon}>img</Text>
            ) : (
              <Ionicons name="pricetag" size={18} color={Colors.textSecondary} />
            )}
          </View>
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName} numberOfLines={1}>{selected.title}</Text>
            <Text style={styles.selectedUserDisplayName}>£{selected.priceGbp.toFixed(0)}</Text>
          </View>
          <Pressable
            onPress={handleClearSelection}
            style={styles.clearSelectionBtn}
            accessibilityLabel="Change listing"
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search your listings..."
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search listings"
            />
          </View>

          {isLoading ? (
            <View style={styles.loadingBody}>
              <ActivityIndicator size="large" color={Colors.brand} />
            </View>
          ) : loadFailed ? (
            <View style={styles.emptySearch}>
              <Text style={styles.emptySearchText}>Could not load listings</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelected(item)}
                  style={styles.userResultRow}
                  accessibilityLabel={`Select listing ${item.title}`}
                  accessibilityRole="button"
                >
                  <View style={styles.userResultAvatar}>
                    <Ionicons name="pricetag" size={16} color={Colors.textSecondary} />
                  </View>
                  <View style={styles.userResultInfo}>
                    <Text style={styles.userResultName} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.userResultDisplayName}>£{item.priceGbp.toFixed(0)}</Text>
                  </View>
                </Pressable>
              )}
              style={styles.userList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptySearch}>
                  <Text style={styles.emptySearchText}>No listings found</Text>
                </View>
              }
            />
          )}
        </>
      )}

      <View style={styles.footerBar}>
        <Pressable
          onPress={handleSave}
          style={[styles.saveBtn, !selected && styles.saveBtnDisabled]}
          disabled={!selected}
          accessibilityLabel="Save listing sticker"
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

// ── Look Sticker Editor ─────────────────────────────────────────────

interface LookSearchItem {
  id: string;
  caption: string;
  mediaUrl: string;
  visibility: 'public' | 'private';
  status: string;
}

function LookStickerEditor({
  existingPayload,
  onSave,
  onDelete,
  onClose,
}: {
  existingPayload?: PosterStickerPayload;
  onSave: (payload: PosterStickerPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [allLooks, setAllLooks] = useState<LookSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<LookSearchItem | null>(
    existingPayload?.lookId
      ? {
          id: existingPayload.lookId,
          caption: existingPayload.snapshotCaption ?? '',
          mediaUrl: '',
          visibility: 'public' as const,
          status: 'published',
        }
      : null
  );

  useEffect(() => {
    fetchLooksFromApi({ status: 'published', limit: 50 })
      .then((res) => {
        const items: LookSearchItem[] = res.items
          .filter((l) => l.visibility === 'public' && l.status === 'published')
          .map((l) => ({
            id: l.id,
            caption: l.caption || l.title,
            mediaUrl: l.mediaUrl,
            visibility: l.visibility,
            status: l.status,
          }));
        setAllLooks(items);
        setLoadFailed(false);
      })
      .catch(() => {
        setLoadFailed(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allLooks;
    const q = query.trim().toLowerCase();
    return allLooks.filter((l) => l.caption.toLowerCase().includes(q));
  }, [allLooks, query]);

  const handleSave = () => {
    if (!selected) return;
    onSave({
      lookId: selected.id,
      snapshotCaption: selected.caption,
      snapshotImageUrl: selected.mediaUrl,
    });
  };

  const handleClearSelection = () => {
    setSelected(null);
    setQuery('');
  };

  return (
    <SheetShell
      title="Look Sticker"
      onClose={onClose}
      onDelete={onDelete}
      canDelete={!!existingPayload}
    >
      {selected ? (
        <View style={styles.selectedUserRow}>
          <View style={styles.selectedListingThumb}>
            <Ionicons name="shirt-outline" size={18} color={Colors.textSecondary} />
          </View>
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName} numberOfLines={2}>{selected.caption}</Text>
          </View>
          <Pressable
            onPress={handleClearSelection}
            style={styles.clearSelectionBtn}
            accessibilityLabel="Change look"
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search looks..."
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search looks"
            />
          </View>

          {isLoading ? (
            <View style={styles.loadingBody}>
              <ActivityIndicator size="large" color={Colors.brand} />
            </View>
          ) : loadFailed ? (
            <View style={styles.emptySearch}>
              <Text style={styles.emptySearchText}>Could not load looks</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelected(item)}
                  style={styles.userResultRow}
                  accessibilityLabel={`Select look ${item.caption}`}
                  accessibilityRole="button"
                >
                  <View style={styles.userResultAvatar}>
                    <Ionicons name="shirt-outline" size={16} color={Colors.textSecondary} />
                  </View>
                  <View style={styles.userResultInfo}>
                    <Text style={styles.userResultName} numberOfLines={2}>{item.caption}</Text>
                  </View>
                </Pressable>
              )}
              style={styles.userList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptySearch}>
                  <Text style={styles.emptySearchText}>No looks found</Text>
                </View>
              }
            />
          )}
        </>
      )}

      <View style={styles.footerBar}>
        <Pressable
          onPress={handleSave}
          style={[styles.saveBtn, !selected && styles.saveBtnDisabled]}
          disabled={!selected}
          accessibilityLabel="Save look sticker"
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

// ── Style Vote Sticker Editor ───────────────────────────────────────

function StyleVoteStickerEditor({
  existingPayload,
  onSave,
  onDelete,
  onClose,
}: {
  existingPayload?: PosterStickerPayload;
  onSave: (payload: PosterStickerPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState(existingPayload?.question ?? '');
  const [option1, setOption1] = useState(existingPayload?.options?.[0]?.label ?? '');
  const [option2, setOption2] = useState(existingPayload?.options?.[1]?.label ?? '');

  const canSave =
    question.trim().length > 0 &&
    option1.trim().length > 0 &&
    option2.trim().length > 0 &&
    option1.trim() !== option2.trim();

  const handleSave = () => {
    if (!canSave) return;
    const opt1Id = existingPayload?.options?.[0]?.id ?? generateUUID();
    const opt2Id = existingPayload?.options?.[1]?.id ?? generateUUID();
    onSave({
      question: question.trim(),
      options: [
        { id: opt1Id, label: option1.trim() },
        { id: opt2Id, label: option2.trim() },
      ],
    });
  };

  return (
    <SheetShell
      title="Style Vote Sticker"
      onClose={onClose}
      onDelete={onDelete}
      canDelete={!!existingPayload}
    >
      <ScrollView style={styles.scrollBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Question</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. Which outfit is better?"
          placeholderTextColor={Colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={MAX_QUESTION_LENGTH}
          autoFocus
          accessibilityLabel="Vote question"
        />
        <Text style={styles.charCount}>
          {question.length}/{MAX_QUESTION_LENGTH}
        </Text>

        <Text style={styles.sectionLabel}>Option 1</Text>
        <TextInput
          style={styles.textInput}
          placeholder="First option"
          placeholderTextColor={Colors.textMuted}
          value={option1}
          onChangeText={setOption1}
          maxLength={MAX_OPTION_LENGTH}
          accessibilityLabel="Vote option 1"
        />

        <Text style={styles.sectionLabel}>Option 2</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Second option"
          placeholderTextColor={Colors.textMuted}
          value={option2}
          onChangeText={setOption2}
          maxLength={MAX_OPTION_LENGTH}
          accessibilityLabel="Vote option 2"
        />

        {option1.trim().length > 0 && option2.trim().length > 0 && option1.trim() === option2.trim() && (
          <Text style={styles.errorText}>Options must be different</Text>
        )}
      </ScrollView>

      <View style={styles.footerBar}>
        <Pressable
          onPress={handleSave}
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          disabled={!canSave}
          accessibilityLabel="Save style vote sticker"
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

// ── Secure ID helper ─────────────────────────────────────────────────

function generateUUID(): string {
  return createStableId();
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '80%',
    paddingBottom: Space.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  sheetTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    paddingHorizontal: Space.md,
    maxHeight: 400,
  },
  previewArea: {
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.md,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewTextWrap: {
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  previewText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  textInput: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
    marginBottom: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },
  optionScroll: {
    marginBottom: Space.sm,
  },
  optionChip: {
    paddingHorizontal: Space.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginRight: Space.xs,
  },
  optionChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  optionChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  optionChipTextActive: {
    color: '#fff',
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    marginRight: Space.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorDotActive: {
    borderColor: Colors.brand,
  },
  alignmentRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  alignBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alignBtnActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  searchIcon: {
    marginLeft: Space.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surfaceAlt,
  },
  userList: {
    maxHeight: 300,
    paddingHorizontal: Space.md,
  },
  userResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  userResultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userResultAvatarText: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.bold,
    fontSize: 16,
  },
  userResultInfo: {
    flex: 1,
    gap: 2,
  },
  userResultName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  userResultDisplayName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  selectedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: Colors.surfaceAlt,
    marginHorizontal: Space.md,
    borderRadius: Radius.md,
    marginTop: Space.sm,
  },
  selectedUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brand + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedUserAvatarText: {
    color: Colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: 18,
  },
  selectedListingThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedListingIcon: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  selectedUserInfo: {
    flex: 1,
    gap: 2,
  },
  selectedUserName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  selectedUserDisplayName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  clearSelectionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBody: {
    paddingVertical: Space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearch: {
    paddingVertical: Space.xl,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  errorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: '#ff6b6b',
    marginTop: Space.xs,
  },
  footerBar: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
});
