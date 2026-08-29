import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Linking, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsRow } from '../components/settings/SettingsRow';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { Space, Radius, Type, Typography, Stroke, Control, FontFamily, PressScale } from '../theme/designTokens';
import {
  buildSupportEntryContext,
  type SupportConversation,
  type SupportCase,
  type SupportKnowledgeSearchResult,
  type SupportEntryContext,
  type CaseOperationalState,
  type ConversationOwnershipState,
} from '../contracts/support';
import {
  getSupportBootstrap,
  createSupportConversation,
  searchSupportKnowledge,
  requestSupportHandoff,
} from '../services/supportConversationApi';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpSupport'>;

// ── Case operational state → human-readable label ──
const CASE_STATE_LABEL: Record<CaseOperationalState, string> = {
  new: 'New',
  triaged: 'Triaged',
  awaiting_customer: 'Awaiting your reply',
  queued: 'In queue',
  in_review: 'In review',
  awaiting_external: 'Awaiting external',
  resolved: 'Resolved',
  closed: 'Closed',
};

// ── Conversation ownership state → human-readable label ──
const CONVERSATION_STATE_LABEL: Record<ConversationOwnershipState, string> = {
  ai_active: 'Active',
  human_queued: 'Waiting for agent',
  human_active: 'Agent responding',
  awaiting_customer: 'Awaiting your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};

// ── Category shortcuts ──
interface CategoryShortcut {
  label: string;
  context: SupportEntryContext;
}

const CATEGORY_SHORTCUTS: CategoryShortcut[] = [
  { label: 'Buying', context: { kind: 'listing' } },
  { label: 'Selling', context: { kind: 'order' } },
  { label: 'Payments', context: { kind: 'payout' } },
  { label: 'Safety', context: { kind: 'report' } },
  { label: 'Account', context: { kind: 'general' } },
];

const SEARCH_DEBOUNCE_MS = 300;

export default function HelpSupportScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Search state ──
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SupportKnowledgeSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Bootstrap state ──
  const [recentConversations, setRecentConversations] = useState<SupportConversation[]>([]);
  const [recentCases, setRecentCases] = useState<SupportCase[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // ── Conversation creation state ──
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [handingOff, setHandingOff] = useState(false);

  const isSearching = query.trim().length > 0;

  // ── Bootstrap on mount ──
  useEffect(() => {
    let cancelled = false;
    setBootstrapLoading(true);
    setBootstrapError(null);
    getSupportBootstrap()
      .then((data) => {
        if (cancelled) return;
        setRecentConversations(data.recentConversations);
        setRecentCases(data.recentCases);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to load your support history';
        setBootstrapError(message);
      })
      .finally(() => {
        if (!cancelled) setBootstrapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Debounced search ──
  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (trimmed.length === 0) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      setExpandedArticleId(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    debounceRef.current = setTimeout(() => {
      searchSupportKnowledge(trimmed, 12)
        .then((results) => {
          setSearchResults(results);
          setSearchLoading(false);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Search failed';
          setSearchError(message);
          setSearchLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  // ── Handlers ──
  const handleOpenExternal = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  }, [show]);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setExpandedArticleId(null);
  }, []);

  const handleSearchResultPress = useCallback((result: SupportKnowledgeSearchResult) => {
    // Show the article content inline rather than starting a chat.
    // Tapping a result expands it to reveal the full snippet.
    setExpandedArticleId((prev) => (prev === result.articleId ? null : result.articleId));
  }, []);

  const handleStartConversation = useCallback(
    async (context: SupportEntryContext) => {
      if (creatingConversation) return;
      setCreatingConversation(true);
      try {
        const conversation = await createSupportConversation(context);
        navigation.navigate('SupportConversation', {
          conversationId: conversation.id,
          contextKind: context.kind,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unable to start conversation';
        show(message, 'error');
      } finally {
        setCreatingConversation(false);
      }
    },
    [creatingConversation, navigation, show]
  );

  const handleTalkToPerson = useCallback(async () => {
    if (handingOff) return;
    setHandingOff(true);
    try {
      const conversation = await createSupportConversation({ kind: 'general' });
      await requestSupportHandoff(conversation.id, 'User requested human agent from Help & Support');
      navigation.navigate('SupportConversation', {
        conversationId: conversation.id,
        contextKind: 'general',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to reach an agent right now';
      show(message, 'error');
    } finally {
      setHandingOff(false);
    }
  }, [handingOff, navigation, show]);

  const handleOpenConversation = useCallback(
    (conversation: SupportConversation) => {
      navigation.navigate('SupportConversation', {
        conversationId: conversation.id,
        contextKind: conversation.contextKind,
        contextId: conversation.contextId ?? undefined,
      });
    },
    [navigation]
  );

  const handleOpenCase = useCallback(
    (caseId: string) => {
      navigation.navigate('SupportCaseDetail', { caseId });
    },
    [navigation]
  );

  const handleCategoryPress = useCallback(
    (context: SupportEntryContext) => {
      void handleStartConversation(context);
    },
    [handleStartConversation]
  );

  const handleReportContent = useCallback(() => {
    void handleStartConversation({ kind: 'report' });
  }, [handleStartConversation]);

  const handleAppealModeration = useCallback(() => {
    void handleStartConversation({ kind: 'report' });
  }, [handleStartConversation]);

  const handleContactSupport = useCallback(() => {
    void handleStartConversation({ kind: 'general' });
  }, [handleStartConversation]);

  // ── Header right action: "Talk to a person" ──
  const headerRight = useMemo(
    () => (
      <AnimatedPressable
        onPress={() => void handleTalkToPerson()}
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 8 }}
        hapticFeedback="medium"
        accessibilityLabel="Talk to a person"
        accessibilityRole="button"
        accessibilityHint="Start a conversation with a human support agent"
        disabled={handingOff}
      >
        {handingOff ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <Text style={styles.headerRightText}>Talk to a person</Text>
        )}
      </AnimatedPressable>
    ),
    [handleTalkToPerson, handingOff, colors.brand, styles.headerRightText]
  );

  // ── Format conversation subtitle ──
  const formatConversationSubtitle = useCallback((convo: SupportConversation) => {
    const stateLabel = CONVERSATION_STATE_LABEL[convo.ownershipState] ?? convo.ownershipState;
    const date = new Date(convo.updatedAt);
    const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${stateLabel} · ${dateLabel}`;
  }, []);

  // ── Format case subtitle ──
  const formatCaseSubtitle = useCallback((supportCase: SupportCase) => {
    const stateLabel = CASE_STATE_LABEL[supportCase.operationalState] ?? supportCase.operationalState;
    const date = new Date(supportCase.updatedAt);
    const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${supportCase.issueType} · ${stateLabel} · ${dateLabel}`;
  }, []);

  const hasRecentActivity = recentConversations.length > 0 || recentCases.length > 0;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Help & Support"
          onBack={() => navigation.goBack()}
          rightAction={headerRight}
        />
      }
      keyboardAvoiding
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Search bar — primary interaction ── */}
        <View style={styles.searchWrap}>
          <AppInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search or describe your issue"
            accessibilityLabel="Search help articles"
            prefix={<Ionicons name="search-outline" size={18} color={colors.textMuted} />}
            suffix={
              query ? (
                <AnimatedPressable
                  onPress={handleClearSearch}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </AnimatedPressable>
              ) : undefined
            }
            inputContainerStyle={styles.searchInputContainer}
          />
        </View>

        {/* ── Search results ── */}
        {isSearching ? (
          <View style={styles.searchResultsWrap}>
            {searchLoading ? (
              <View style={styles.searchLoadingWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text style={styles.searchLoadingText}>Searching articles…</Text>
              </View>
            ) : searchError ? (
              <View style={styles.searchErrorWrap}>
                <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
                <Text style={styles.searchErrorText}>{searchError}</Text>
                <Text style={styles.searchErrorHint}>Try again, or contact us below.</Text>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.searchEmptyWrap}>
                <Text style={styles.searchEmptyText}>No articles match "{query.trim()}"</Text>
                <Text style={styles.searchEmptyHint}>Try different words, or talk to a person.</Text>
              </View>
            ) : (
              searchResults.map((result, idx) => {
                const isExpanded = expandedArticleId === result.articleId;
                return (
                  <View key={result.articleId} style={[styles.articleRow, idx < searchResults.length - 1 && styles.rowBorder]}>
                    <AnimatedPressable
                      onPress={() => handleSearchResultPress(result)}
                      hapticFeedback="light"
                      scaleValue={PressScale.tap}
                      accessibilityRole="button"
                      accessibilityLabel={result.title}
                      accessibilityHint={isExpanded ? 'Collapse article' : 'Expand to read article snippet'}
                    >
                      <View style={styles.articleTitleRow}>
                        <Text style={styles.articleTitle} numberOfLines={isExpanded ? undefined : 2}>
                          {result.title}
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={colors.textMuted}
                        />
                      </View>
                      <Text style={styles.articleSnippet} numberOfLines={isExpanded ? undefined : 3}>
                        {result.snippet}
                      </Text>
                      {isExpanded && (
                        <View style={styles.articleExpandedFooter}>
                          <Text style={styles.articleMeta}>
                            Article ID: {result.articleId.slice(-8).toUpperCase()}
                          </Text>
                          <AnimatedPressable
                            onPress={() => void handleStartConversation({ kind: 'general' })}
                            hapticFeedback="light"
                            scaleValue={PressScale.tap}
                            accessibilityRole="button"
                            accessibilityLabel="Still need help? Contact support"
                          >
                            <Text style={styles.articleContactLink}>Still need help? Contact support</Text>
                          </AnimatedPressable>
                        </View>
                      )}
                    </AnimatedPressable>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <>
            {/* ── Category shortcuts ── */}
            <View style={styles.categoryRow}>
              {CATEGORY_SHORTCUTS.map((cat, idx) => (
                <React.Fragment key={cat.label}>
                  <AnimatedPressable
                    onPress={() => handleCategoryPress(cat.context)}
                    hapticFeedback="light"
                    scaleValue={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.label} help`}
                    disabled={creatingConversation}
                  >
                    <Text style={styles.categoryText}>{cat.label}</Text>
                  </AnimatedPressable>
                  {idx < CATEGORY_SHORTCUTS.length - 1 && <Text style={styles.categoryDot}>·</Text>}
                </React.Fragment>
              ))}
            </View>

            {/* ── Recent conversations & cases ── */}
            {bootstrapLoading ? (
              <View style={styles.bootstrapLoadingWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : bootstrapError ? (
              <View style={styles.bootstrapErrorWrap}>
                <Text style={styles.bootstrapErrorText}>{bootstrapError}</Text>
              </View>
            ) : hasRecentActivity ? (
              <>
                {recentConversations.length > 0 && (
                  <SettingsSection title="Recent conversations">
                    {recentConversations.map((convo, idx) => (
                      <SettingsRow
                        key={convo.id}
                        icon="chatbubble-outline"
                        title={convo.title ?? 'Support conversation'}
                        subtitle={formatConversationSubtitle(convo)}
                        onPress={() => handleOpenConversation(convo)}
                        isFirst={idx === 0}
                        isLast={idx === recentConversations.length - 1}
                      />
                    ))}
                  </SettingsSection>
                )}

                {recentCases.length > 0 && (
                  <SettingsSection title="Recent cases">
                    {recentCases.map((supportCase, idx) => (
                      <SettingsRow
                        key={supportCase.id}
                        icon="document-text-outline"
                        title={`#${supportCase.id.slice(-8).toUpperCase()}`}
                        subtitle={formatCaseSubtitle(supportCase)}
                        onPress={() => handleOpenCase(supportCase.id)}
                        isFirst={idx === 0}
                        isLast={idx === recentCases.length - 1}
                      />
                    ))}
                  </SettingsSection>
                )}
              </>
            ) : null}

            {/* ── Contact support ── */}
            <View style={styles.contactWrap}>
              <AnimatedPressable
                onPress={handleContactSupport}
                style={styles.contactButton}
                hapticFeedback="medium"
                scaleValue={0.985}
                accessibilityRole="button"
                accessibilityLabel="Contact support"
                accessibilityHint="Start a support conversation"
                disabled={creatingConversation}
              >
                {creatingConversation ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <>
                    <Ionicons name="chatbubbles-outline" size={20} color={colors.brand} />
                    <Text style={styles.contactButtonText}>Contact support</Text>
                  </>
                )}
              </AnimatedPressable>
            </View>

            {/* ── Trust & Safety: DSA reporting and appeals ── */}
            <SettingsSection title="Trust & Safety">
              <SettingsRow
                icon="flag-outline"
                title="Report illegal content"
                subtitle="DSA report — submit a complaint about specific content"
                onPress={handleReportContent}
                isFirst
              />
              <SettingsRow
                icon="shield-outline"
                title="Appeal a moderation decision"
                subtitle="Request a review of a decision made on your account"
                onPress={handleAppealModeration}
                isLast
              />
            </SettingsSection>

            {/* ── Legal ── */}
            <SettingsSection title="Legal">
              <SettingsRow
                icon="document-text-outline"
                title="Terms of Service"
                onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
                isFirst
              />
              <SettingsRow
                icon="shield-checkmark-outline"
                title="Privacy Policy"
                onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
              />
              <SettingsRow
                icon="globe-outline"
                title="Thryftverse Blog"
                onPress={() => void handleOpenExternal('https://thryftverse.app/blog')}
                isLast
              />
            </SettingsSection>
          </>
        )}

        {/* ── Version ── */}
        <Text style={styles.version}>Thryftverse v1.0.0</Text>
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Space.xl,
    },
    // ── Search ──
    searchWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.sm,
    },
    searchInputContainer: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
    },
    // ── Search results ──
    searchResultsWrap: {
      paddingHorizontal: Space.md,
    },
    searchLoadingWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.lg,
      justifyContent: 'center',
    },
    searchLoadingText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      letterSpacing: Type.body.letterSpacing,
    },
    searchErrorWrap: {
      paddingVertical: Space.lg,
      alignItems: 'center',
      gap: Space.sm,
    },
    searchErrorText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.medium,
      color: colors.danger,
      textAlign: 'center',
      letterSpacing: Type.body.letterSpacing,
    },
    searchErrorHint: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textAlign: 'center',
      letterSpacing: Type.caption.letterSpacing,
    },
    searchEmptyWrap: {
      paddingVertical: Space.lg,
      alignItems: 'center',
      gap: Space.xs,
    },
    searchEmptyText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      textAlign: 'center',
      letterSpacing: Type.body.letterSpacing,
    },
    searchEmptyHint: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textAlign: 'center',
      letterSpacing: Type.caption.letterSpacing,
    },
    // ── Article rows ──
    articleRow: {
      paddingVertical: Space.md - Space.xs,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    articleTitle: {
      flex: 1,
      fontSize: Type.bodyEmphasis.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      lineHeight: Type.bodyEmphasis.lineHeight,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
    },
    articleTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
    },
    articleSnippet: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      marginTop: Space.xs,
    },
    articleExpandedFooter: {
      marginTop: Space.sm,
      gap: Space.xs,
      paddingTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    articleMeta: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      letterSpacing: Type.meta.letterSpacing,
    },
    articleContactLink: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
      letterSpacing: Type.body.letterSpacing,
    },
    // ── Category shortcuts ──
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.xs,
    },
    categoryText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.medium,
      color: colors.brand,
      letterSpacing: Type.body.letterSpacing,
    },
    categoryDot: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    // ── Bootstrap states ──
    bootstrapLoadingWrap: {
      paddingVertical: Space.lg,
      alignItems: 'center',
    },
    bootstrapErrorWrap: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    bootstrapErrorText: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textAlign: 'center',
      letterSpacing: Type.caption.letterSpacing,
    },
    // ── Contact button ──
    contactWrap: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    contactButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + Space.xs,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.brandBorder,
      backgroundColor: colors.brandSubtle,
      minHeight: Control.hit + Space.xs,
    },
    contactButtonText: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
    },
    // ── Header right ──
    headerRightText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.medium,
      color: colors.brand,
      letterSpacing: Type.body.letterSpacing,
    },
    // ── Version ──
    version: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: Space.lg,
      marginBottom: Space.md,
      letterSpacing: Type.meta.letterSpacing,
    },
  });
}
