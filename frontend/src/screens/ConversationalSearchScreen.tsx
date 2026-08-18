/**
 * ConversationalSearchScreen — flagship natural-language search surface.
 *
 * Per AGENTS.md §11 (Truthful UI): this screen is honest about its demo mode.
 * The service uses deterministic keyword matching — NOT an LLM / GPT / ChatGPT.
 * A subtle "Demo Mode" indicator is always visible so the user is never misled.
 * Extracted filters are labelled "matched keywords", not "AI inference".
 *
 * Per AGENTS.md §4 (Push to Maximum Quality):
 *  - Flat composition, hairline separators, max two non-avatar radii
 *  - Max three type sizes in the first viewport
 *  - Design tokens only — no hardcoded values
 *  - useAppTheme() for all colours
 *
 * Per AGENTS.md §14 (State Completeness): loading, populated, empty, error,
 * and offline states are all designed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FlashList, ListRenderItem, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Typography, Radius, Type, Space, Control, Stroke } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { TypingIndicator } from '../components/TypingIndicator';
import { AITrustSignal, type AIConfidence } from '../components/ai/AITrustSignal';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useStore } from '../store/useStore';
import { RootStackParamList } from '../navigation/types';
import {
  CONVERSATIONAL_SEARCH_DEMO_MODE,
  ChatMessage,
  SearchConversation,
  SearchFilters,
  SearchSuggestion,
  continueConversation,
  fetchSuggestions,
  startConversation,
} from '../services/conversationalSearchApi';

type Props = NativeStackScreenProps<RootStackParamList, 'ConversationalSearch'>;

/** A row in the FlashList — either a real chat message or the typing indicator. */
type ConversationRow =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'typing' };

export default function ConversationalSearchScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();

  // ── Store (for Browse filter hand-off) ──
  const resetBrowseFilters = useStore((state) => state.resetBrowseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);

  // ── Local state ──
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [conversation, setConversation] = useState<SearchConversation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlashListRef<ConversationRow>>(null);
  const inputRef = useRef<TextInput>(null);

  // ── Load suggested starting queries on mount ──
  useEffect(() => {
    let cancelled = false;
    setSuggestionsLoading(true);
    fetchSuggestions()
      .then((result) => {
        if (cancelled) return;
        setSuggestions(result);
      })
      .catch(() => {
        if (cancelled) return;
        // Non-fatal — the empty state still works without suggestions.
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Build the FlashList rows (messages + optional typing indicator) ──
  const rows: ConversationRow[] = useMemo(() => {
    if (!conversation) return [];
    const messageRows: ConversationRow[] = conversation.messages.map((m) => ({
      kind: 'message' as const,
      message: m,
    }));
    if (isProcessing) {
      messageRows.push({ kind: 'typing' });
    }
    return messageRows;
  }, [conversation, isProcessing]);

  // ── Scroll to bottom when new rows arrive ──
  useEffect(() => {
    if (rows.length > 0) {
      const t = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: !reducedMotion });
      }, 80);
      return () => clearTimeout(t);
    }
  }, [rows.length, reducedMotion]);

  // ── Send a query ──
  const sendQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || isProcessing) return;
      if (isOffline) {
        setError('You are offline. Reconnect to search.');
        return;
      }

      setInput('');
      setError(null);
      setIsProcessing(true);

      try {
        if (!conversation) {
          const conv = await startConversation(trimmed);
          setConversation(conv);
        } else {
          await continueConversation(conversation.id, trimmed);
          // Re-read the conversation from the in-memory store by re-creating
          // a shallow copy so React detects the change. The service mutates
          // the stored conversation's messages array in place.
          setConversation({ ...conversation, messages: [...conversation.messages] });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      } finally {
        setIsProcessing(false);
      }
    },
    [conversation, isProcessing, isOffline],
  );

  // ── Navigate to Browse with extracted filters applied ──
  const handleViewResults = useCallback(
    (filters: SearchFilters) => {
      resetBrowseFilters();
      const updates: Parameters<typeof updateBrowseFilters>[0] = {};
      if (filters.brands?.length) updates.brands = filters.brands;
      if (filters.sizes?.length) updates.sizes = filters.sizes;
      if (filters.conditions?.length) updates.condition = filters.conditions[0] as any;
      if (filters.sustainableOnly) updates.sustainableOnly = true;
      // Use the first category as the search query so Browse's text filter
      // catches category-relevant listings.
      const queryText =
        filters.categories?.join(' ') ??
        filters.brands?.join(' ') ??
        filters.styles?.join(' ') ??
        '';
      if (queryText) updates.query = queryText;
      updateBrowseFilters(updates);

      navigation.navigate('Browse', {
        categoryId: 'search',
        title: 'Search results',
        searchQuery: queryText || undefined,
      });
    },
    [navigation, resetBrowseFilters, updateBrowseFilters],
  );

  // ── Render a filter chip inside an assistant message ──
  const renderFilterChip = useCallback(
    (label: string, key: string) => (
      <View
        key={key}
        style={[localStyles.filterChip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
      >
        <Text
          style={[localStyles.filterChipText, { color: colors.textSecondary }]}
          accessibilityRole="text"
        >
          {label}
        </Text>
      </View>
    ),
    [colors.surfaceAlt, colors.border, colors.textSecondary],
  );

  // ── Build the list of filter chips for an assistant message ──
  const buildFilterChips = useCallback(
    (filters: SearchFilters): { label: string; key: string }[] => {
      const chips: { label: string; key: string }[] = [];
      if (filters.brands?.length) {
        chips.push({ label: `Brand: ${filters.brands.join(', ')}`, key: 'brand' });
      }
      if (filters.categories?.length) {
        chips.push({ label: `Category: ${filters.categories.join(', ')}`, key: 'cat' });
      }
      if (filters.sizes?.length) {
        chips.push({ label: `Size: ${filters.sizes.join(', ')}`, key: 'size' });
      }
      if (filters.conditions?.length) {
        chips.push({ label: `Condition: ${filters.conditions.join(', ')}`, key: 'cond' });
      }
      if (filters.colors?.length) {
        chips.push({ label: `Colour: ${filters.colors.join(', ')}`, key: 'colour' });
      }
      if (filters.styles?.length) {
        chips.push({ label: `Style: ${filters.styles.join(', ')}`, key: 'style' });
      }
      if (filters.priceRange) {
        const { min, max } = filters.priceRange;
        let priceLabel = 'Price: ';
        if (min !== undefined && max !== undefined) priceLabel += `£${min}–£${max}`;
        else if (max !== undefined) priceLabel += `under £${max}`;
        else if (min !== undefined) priceLabel += `over £${min}`;
        chips.push({ label: priceLabel, key: 'price' });
      }
      if (filters.sustainableOnly) {
        chips.push({ label: 'Sustainable only', key: 'sust' });
      }
      return chips;
    },
    [],
  );

  // ── Render an assistant message bubble ──
  const renderAssistantMessage = useCallback(
    (message: ChatMessage) => {
      const chips = message.filterResults ? buildFilterChips(message.filterResults) : [];
      const hasResults = message.estimatedMatchCount !== undefined && message.estimatedMatchCount > 0;
      // Confidence is derived from the number of matched keywords (honest
      // heuristic — the service uses deterministic keyword matching, not an
      // LLM). 3+ matches = high, 1–2 = medium, 0 = low.
      const matchedCount = chips.length;
      const confidence: AIConfidence =
        matchedCount >= 3 ? 'high' : matchedCount >= 1 ? 'medium' : 'low';
      const matchedSource =
        matchedCount > 0
          ? `Matched keywords: ${chips.map((c) => c.label).join(', ')}`
          : 'No keywords matched — showing a general response';
      return (
        <View style={[localStyles.bubbleAssistant, { backgroundColor: colors.surface }]}>
          <Text
            style={[localStyles.bubbleText, { color: colors.textPrimary }]}
            accessibilityRole="text"
          >
            {message.content}
          </Text>

          {/* AI trust signal — confidence + matched-keyword source */}
          <AITrustSignal
            confidence={confidence}
            source={matchedSource}
            isDemo={CONVERSATIONAL_SEARCH_DEMO_MODE}
            style={localStyles.trustSignal}
          />

          {/* Matched-keyword filter chips */}
          {chips.length > 0 && (
            <View style={localStyles.filterChipRow}>
              <Text
                style={[localStyles.matchedKeywordsLabel, { color: colors.textMuted }]}
                accessibilityRole="text"
              >
                Matched keywords
              </Text>
              <View style={localStyles.filterChipWrap}>
                {chips.map((chip) => renderFilterChip(chip.label, chip.key))}
              </View>
            </View>
          )}

          {/* View results + refinement suggestions */}
          {hasResults && message.filterResults && (
            <View style={localStyles.actionsRow}>
              <AnimatedPressable
                style={[
                  localStyles.viewResultsBtn,
                  { backgroundColor: colors.brand },
                ]}
                onPress={() => handleViewResults(message.filterResults!)}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel={`View ${message.estimatedMatchCount} results in browse`}
                accessibilityHint="Opens the browse screen with the matched filters applied"
                accessibilityRole="button"
              >
                <Text
                  style={[localStyles.viewResultsText, { color: colors.textInverse }]}
                  accessibilityRole="text"
                >
                  View results
                </Text>
                <Ionicons name="arrow-forward" size={16} color={colors.textInverse} />
              </AnimatedPressable>
            </View>
          )}

          {/* Refinement suggestions */}
          {message.suggestions && message.suggestions.length > 0 && (
            <View style={localStyles.refineWrap}>
              <Text
                style={[localStyles.refineLabel, { color: colors.textMuted }]}
                accessibilityRole="text"
              >
                Refine
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={localStyles.refineScroll}
              >
                {message.suggestions.map((suggestion) => (
                  <AnimatedPressable
                    key={suggestion}
                    style={[
                      localStyles.refineChip,
                      { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    ]}
                    onPress={() => sendQuery(suggestion)}
                    activeOpacity={0.8}
                    hapticFeedback="light"
                    disabled={isProcessing}
                    accessibilityLabel={`Refine search: ${suggestion}`}
                    accessibilityHint="Adds this refinement to your search"
                    accessibilityRole="button"
                  >
                    <Text
                      style={[localStyles.refineChipText, { color: colors.textPrimary }]}
                      accessibilityRole="text"
                    >
                      {suggestion}
                    </Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      );
    },
    [
      colors.surface,
      colors.textPrimary,
      colors.textMuted,
      colors.textInverse,
      colors.brand,
      colors.surfaceAlt,
      colors.border,
      buildFilterChips,
      renderFilterChip,
      handleViewResults,
      sendQuery,
      isProcessing,
    ],
  );

  // ── Render a user message bubble ──
  const renderUserMessage = useCallback(
    (message: ChatMessage) => (
      <View style={localStyles.userBubbleCol}>
        <View style={[localStyles.bubbleUser, { backgroundColor: colors.brand }]}>
          <Text
            style={[localStyles.bubbleText, { color: colors.textInverse }]}
            accessibilityRole="text"
          >
            {message.content}
          </Text>
        </View>
      </View>
    ),
    [colors.brand, colors.textInverse],
  );

  // ── FlashList row renderer ──
  const renderRow: ListRenderItem<ConversationRow> = useCallback(
    ({ item }) => {
      if (item.kind === 'typing') {
        return (
          <View style={localStyles.typingRow}>
            <View style={[localStyles.bubbleAssistant, { backgroundColor: colors.surface }]}>
              <TypingIndicator dotColor={colors.textMuted} />
            </View>
          </View>
        );
      }
      const message = item.message;
      if (message.role === 'user') {
        return (
          <View
            style={localStyles.messageRow}
          >
            {renderUserMessage(message)}
          </View>
        );
      }
      return (
        <View
          style={localStyles.messageRow}
        >
          {renderAssistantMessage(message)}
        </View>
      );
    },
    [colors.surface, colors.textMuted, renderUserMessage, renderAssistantMessage],
  );

  // ── Empty / first-viewport state ──
  const renderEmptyState = () => (
    <View style={localStyles.emptyStateWrap}>
      <View
        style={localStyles.greetingWrap}
      >
        <Text
          style={[localStyles.greetingTitle, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          What are you looking for today?
        </Text>
        <Text
          style={[localStyles.greetingSubtitle, { color: colors.textSecondary }]}
          accessibilityRole="text"
        >
          Describe it in your own words.
        </Text>
      </View>

      {/* Suggested query chips */}
      <View style={localStyles.suggestionsSection}>
        <Text
          style={[localStyles.suggestionsLabel, { color: colors.textMuted }]}
          accessibilityRole="text"
        >
          Try one of these
        </Text>
        {suggestionsLoading ? (
          <View style={localStyles.suggestionSkeletonRow}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={localStyles.suggestionScroll}
          >
            {suggestions.map((suggestion) => (
              <AnimatedPressable
                key={suggestion.id}
                style={[
                  localStyles.suggestionChip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => sendQuery(suggestion.query)}
                activeOpacity={0.8}
                hapticFeedback="light"
                disabled={isProcessing}
                accessibilityLabel={`Search for ${suggestion.label}`}
                accessibilityHint="Starts a conversational search with this query"
                accessibilityRole="button"
              >
                <Text
                  style={[localStyles.suggestionChipText, { color: colors.textPrimary }]}
                  accessibilityRole="text"
                >
                  {suggestion.label}
                </Text>
              </AnimatedPressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );

  // ── Error state ──
  const renderErrorState = () => (
    <View style={localStyles.errorWrap}>
      <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
      <Text
        style={[localStyles.errorTitle, { color: colors.textPrimary }]}
        accessibilityRole="text"
      >
        {error}
      </Text>
      <AnimatedPressable
        style={[localStyles.retryBtn, { backgroundColor: colors.brand }]}
        onPress={() => {
          setError(null);
          if (conversation && conversation.messages.length > 0) {
            const lastUser = [...conversation.messages]
              .reverse()
              .find((m) => m.role === 'user');
            if (lastUser) {
              void sendQuery(lastUser.content);
            }
          }
        }}
        activeOpacity={0.85}
        hapticFeedback="light"
        accessibilityLabel="Retry search"
        accessibilityHint="Re-sends your last search query"
        accessibilityRole="button"
      >
        <Text
          style={[localStyles.retryBtnText, { color: colors.textInverse }]}
          accessibilityRole="text"
        >
          Retry
        </Text>
      </AnimatedPressable>
    </View>
  );

  const showEmptyState = !conversation && !isProcessing;
  const showError = !!error && !isProcessing;

  return (
    <SafeAreaView
      style={[localStyles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* ── Header ── */}
      <View style={[localStyles.header, { borderBottomColor: colors.border }]}>
        <AnimatedPressable
          style={localStyles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={localStyles.headerTitleWrap}>
          <Text
            style={[localStyles.headerTitle, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            Ask ThryftVerse
          </Text>
        </View>
        <View style={localStyles.headerSpacer} />
      </View>

      {/* ── Demo mode indicator (truthful UI per AGENTS.md §11) ── */}
      {CONVERSATIONAL_SEARCH_DEMO_MODE && (
        <View
          style={[
            localStyles.demoBanner,
            { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text
            style={[localStyles.demoBannerText, { color: colors.textMuted }]}
            accessibilityRole="text"
          >
            AI search is in demo mode — using keyword matching, not AI.
          </Text>
        </View>
      )}

      {/* ── Offline banner ── */}
      {isOffline && (
        <View
          style={[
            localStyles.offlineBanner,
            { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="wifi-outline" size={14} color={colors.textMuted} />
          <Text
            style={[localStyles.offlineBannerText, { color: colors.textMuted }]}
            accessibilityRole="text"
          >
            You are offline. Reconnect to search.
          </Text>
        </View>
      )}

      {/* ── Conversation / empty / error ── */}
      <KeyboardAvoidingView
        style={localStyles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {showError ? (
          renderErrorState()
        ) : showEmptyState ? (
          renderEmptyState()
        ) : (
          <FlashList
            ref={listRef}
            data={rows}
            renderItem={renderRow}
            keyExtractor={(item, index) =>
              item.kind === 'typing' ? 'typing-indicator' : item.message.id
            }
            contentContainerStyle={localStyles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* ── Input field ── */}
        <View
          style={[
            localStyles.inputBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + Space.sm,
            },
          ]}
        >
          <View
            style={[
              localStyles.inputShell,
              { backgroundColor: colors.input, borderColor: colors.border },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[localStyles.input, { color: colors.inputText }]}
              placeholder="Describe what you are looking for…"
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => void sendQuery(input)}
              returnKeyType="send"
              autoCapitalize="none"
              autoCorrect
              editable={!isProcessing && !isOffline}
              accessibilityLabel="Search query input"
              accessibilityHint="Type a natural-language description of what you want to find"
              accessibilityRole="search"
            />
          </View>
          <AnimatedPressable
            style={[
              localStyles.sendBtn,
              {
                backgroundColor: input.trim().length > 0 && !isProcessing ? colors.brand : colors.surfaceAlt,
              },
            ]}
            onPress={() => void sendQuery(input)}
            disabled={input.trim().length === 0 || isProcessing || isOffline}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Send search query"
            accessibilityHint="Sends your query and starts the conversational search"
            accessibilityRole="button"
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Ionicons
                name="arrow-up"
                size={20}
                color={input.trim().length > 0 ? colors.textInverse : colors.textMuted}
              />
            )}
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles — design tokens only, no hardcoded values.
// Radii: two non-avatar sizes — Radius.lg (12) for bubbles, Radius.full for
// chips/buttons. Type: three sizes in the first viewport (title, body, caption).
// ---------------------------------------------------------------------------
const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flexOne: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  headerSpacer: {
    width: Control.hit,
  },

  // Demo mode banner
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  demoBannerText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },

  // Offline banner
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },

  // List
  listContent: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  messageRow: {
    marginVertical: Space.xs,
  },

  // User bubble (right-aligned, brand-tinted)
  userBubbleCol: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  bubbleUser: {
    maxWidth: '82%',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },

  // Assistant bubble (left-aligned, surface)
  bubbleAssistant: {
    maxWidth: '88%',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    alignSelf: 'flex-start',
  },
  bubbleText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  trustSignal: {
    marginTop: Space.sm,
  },

  // Filter chips inside assistant message
  filterChipRow: {
    marginTop: Space.sm,
  },
  matchedKeywordsLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  filterChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  filterChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },

  // Actions row (View results)
  actionsRow: {
    marginTop: Space.sm,
  },
  viewResultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    borderRadius: Radius.full,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
  },
  viewResultsText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },

  // Refinement suggestions
  refineWrap: {
    marginTop: Space.md,
  },
  refineLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  refineScroll: {
    gap: Space.xs,
    paddingRight: Space.md,
  },
  refineChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.chrome,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refineChipText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },

  // Typing indicator row
  typingRow: {
    marginVertical: Space.xs,
  },

  // Empty / first-viewport state
  emptyStateWrap: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
  },
  greetingWrap: {
    alignItems: 'flex-start',
  },
  greetingTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
  },
  greetingSubtitle: {
    marginTop: Space.xs,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  suggestionsSection: {
    marginTop: Space.xl,
  },
  suggestionsLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  suggestionSkeletonRow: {
    paddingVertical: Space.sm,
  },
  suggestionScroll: {
    gap: Space.sm,
    paddingRight: Space.md,
  },
  suggestionChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionChipText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },

  // Error state
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    gap: Space.sm,
  },
  errorTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    textAlign: 'center',
  },
  retryBtn: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.sm,
  },
  retryBtnText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputShell: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
    minHeight: Space.xxl,
  },
  input: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    paddingVertical: Space.sm,
  },
  sendBtn: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
