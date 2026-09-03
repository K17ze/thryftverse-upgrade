import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { useHaptic } from '../hooks/useHaptic';
import { AppStatusPill, type AppStatusTone } from '../components/ui/AppStatusPill';
import { Meta, Caption } from '../components/ui/Text';
import type {
  SupportCase,
  SupportCaseEvent,
  CaseOperationalState,
  CaseResolutionDisposition } from '../contracts/support';
import { getSupportCase, sendSupportCaseMessage, appealSupportCase } from '../services/supportConversationApi';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportCaseDetail'>;

// ============================================================================
// STATE MAPPING — CaseOperationalState → display label + pill tone + icon
// ============================================================================
interface StateDisplay {
  label: string;
  tone: AppStatusTone;
  icon: keyof typeof Ionicons.glyphMap;
}

const STATE_DISPLAY: Record<CaseOperationalState, StateDisplay> = {
  new: { label: 'New', tone: 'pending', icon: 'time-outline' },
  triaged: { label: 'Triaged', tone: 'pending', icon: 'time-outline' },
  awaiting_customer: { label: 'Awaiting your response', tone: 'warning', icon: 'alert-circle-outline' },
  queued: { label: 'In queue', tone: 'pending', icon: 'hourglass-outline' },
  in_review: { label: 'Under review', tone: 'pending', icon: 'search-outline' },
  awaiting_external: { label: 'Awaiting external party', tone: 'pending', icon: 'globe-outline' },
  resolved: { label: 'Resolved', tone: 'success', icon: 'checkmark-circle-outline' },
  closed: { label: 'Closed', tone: 'neutral', icon: 'lock-closed-outline' } };

// ============================================================================
// RESOLUTION DISPOSITION MAPPING
// ============================================================================
const DISPOSITION_LABEL: Record<CaseResolutionDisposition, string> = {
  information_provided: 'Information provided',
  customer_withdrew: 'Withdrawn by customer',
  seller_resolved: 'Resolved by seller',
  refund_approved: 'Refund approved',
  refund_denied: 'Refund denied',
  return_approved: 'Return approved',
  not_eligible: 'Not eligible',
  no_violation: 'No violation found',
  violation_actioned: 'Violation actioned',
  duplicate: 'Duplicate case',
  merged: 'Merged with another case',
  external_dispute: 'Resolved via external dispute',
  unable_to_resolve: 'Unable to resolve' };

// ============================================================================
// PRIORITY MAPPING — subtle indicator, not decorative
// ============================================================================
interface PriorityDisplay {
  label: string;
  color: 'danger' | 'warning' | 'textSecondary' | 'textMuted';
}

const PRIORITY_DISPLAY: Record<SupportCase['priority'], PriorityDisplay> = {
  urgent: { label: 'Urgent', color: 'danger' },
  high: { label: 'High', color: 'warning' },
  normal: { label: 'Normal', color: 'textSecondary' },
  low: { label: 'Low', color: 'textMuted' } };

// ============================================================================
// ACTOR ROLE MAPPING
// ============================================================================
function actorRoleLabel(role: string): string {
  switch (role) {
    case 'customer':
      return 'You';
    case 'agent_ai':
      return 'AI Assistant';
    case 'agent_human':
      return 'Support Agent';
    case 'system':
      return 'System';
    default:
      return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

// ============================================================================
// EVENT LABEL + PAYLOAD SUMMARY
// ============================================================================
interface EventRender {
  label: string;
  summary: string | null;
}

function renderEvent(event: SupportCaseEvent): EventRender {
  const p = event.payload;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

  switch (event.eventType) {
    case 'case_created': {
      const issueType = str(p.issueType);
      return { label: 'Case opened', summary: issueType ? `Issue: ${issueType}` : null };
    }
    case 'evidence_received': {
      const count = typeof p.count === 'number' ? p.count : null;
      return {
        label: 'Evidence received',
        summary: count != null ? `${count} item${count === 1 ? '' : 's'} attached` : null };
    }
    case 'assigned': {
      const team = str(p.team) ?? str(p.assignedTeam);
      const operator = str(p.operatorName) ?? str(p.assignedOperatorName);
      const target = team && operator ? `${team} · ${operator}` : team ?? operator;
      return { label: 'Assigned', summary: target ? `Assigned to ${target}` : null };
    }
    case 'additional_information_requested': {
      const question = str(p.question) ?? str(p.detail);
      return { label: 'More information requested', summary: question };
    }
    case 'external_update': {
      const detail = str(p.detail) ?? str(p.statusDetail) ?? str(p.summary);
      return { label: 'Status update', summary: detail };
    }
    case 'decision_made': {
      const dispositionRaw = str(p.disposition) as CaseResolutionDisposition | null;
      const reason = str(p.reason) ?? str(p.rationale);
      const dispositionLabel = dispositionRaw ? DISPOSITION_LABEL[dispositionRaw] ?? dispositionRaw : null;
      const summary = [dispositionLabel, reason].filter(Boolean).join(' — ') || null;
      return { label: 'Decision', summary };
    }
    case 'customer_notified': {
      const subject = str(p.subject) ?? str(p.channel);
      return { label: 'Customer notified', summary: subject };
    }
    case 'appeal_requested': {
      const reason = str(p.reason);
      return { label: 'Appeal requested', summary: reason };
    }
    case 'case_resolved': {
      const dispositionRaw = str(p.disposition) as CaseResolutionDisposition | null;
      const dispositionLabel = dispositionRaw ? DISPOSITION_LABEL[dispositionRaw] ?? dispositionRaw : null;
      return { label: 'Case resolved', summary: dispositionLabel };
    }
    case 'case_closed': {
      const dispositionRaw = str(p.disposition) as CaseResolutionDisposition | null;
      const dispositionLabel = dispositionRaw ? DISPOSITION_LABEL[dispositionRaw] ?? dispositionRaw : null;
      return { label: 'Case closed', summary: dispositionLabel };
    }
    case 'customer_message': {
      const body = str(p.body) ?? str(p.message);
      return { label: 'You added information', summary: body };
    }
    default: {
      const detail = str(p.detail) ?? str(p.summary);
      return {
        label: event.eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        summary: detail };
    }
  }
}

// ============================================================================
// CONTEXT LINKS — derived from event payloads (data-driven, not fabricated)
// ============================================================================
type ContextLinkKind = 'order' | 'listing' | 'payout';
interface ContextLink {
  kind: ContextLinkKind;
  id: string;
}

function extractContextLinks(events: SupportCaseEvent[]): ContextLink[] {
  const links: ContextLink[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const p = e.payload;
    const orderId = typeof p.orderId === 'string' ? p.orderId : null;
    const listingId = typeof p.listingId === 'string' ? p.listingId : null;
    const payoutId = typeof p.payoutId === 'string' ? p.payoutId : null;
    if (orderId && !seen.has(`order:${orderId}`)) {
      seen.add(`order:${orderId}`);
      links.push({ kind: 'order', id: orderId });
    }
    if (listingId && !seen.has(`listing:${listingId}`)) {
      seen.add(`listing:${listingId}`);
      links.push({ kind: 'listing', id: listingId });
    }
    if (payoutId && !seen.has(`payout:${payoutId}`)) {
      seen.add(`payout:${payoutId}`);
      links.push({ kind: 'payout', id: payoutId });
    }
  }
  return links;
}

function contextLinkLabel(kind: ContextLinkKind): string {
  switch (kind) {
    case 'order':
      return 'Order';
    case 'listing':
      return 'Listing';
    case 'payout':
      return 'Payout';
  }
}

function contextLinkIcon(kind: ContextLinkKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'order':
      return 'bag-handle-outline';
    case 'listing':
      return 'document-text-outline';
    case 'payout':
      return 'card-outline';
  }
}

function contextLinkRoute(kind: ContextLinkKind, id: string): { name: keyof RootStackParamList; params: Record<string, unknown> } | null {
  switch (kind) {
    case 'order':
      return { name: 'OrderDetail', params: { orderId: id } };
    case 'listing':
      return { name: 'ItemDetail', params: { itemId: id } };
    case 'payout':
      return null;
  }
}

// ============================================================================
// TIMESTAMP FORMATTING
// ============================================================================
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric' });
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function SupportCaseDetailScreen({ navigation, route }: Props) {
  const { caseId } = route.params ?? {};
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const [caseRecord, setCaseRecord] = useState<SupportCase | null>(null);
  const [events, setEvents] = useState<SupportCaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [appealing, setAppealing] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const inputRef = useRef<React.ComponentRef<typeof AppInput>>(null);

  // ── Load case + events ──────────────────────────────────────────────────
  const loadCase = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getSupportCase(caseId);
      setCaseRecord(res.case);
      setEvents(res.events);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const publicEvents = useMemo(
    () => events.filter((e) => e.isPublic).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [events]
  );

  const contextLinks = useMemo(() => extractContextLinks(events), [events]);

  const hasAppealed = useMemo(
    () => events.some((e) => e.eventType === 'appeal_requested'),
    [events]
  );

  const canAppeal = useMemo(() => {
    if (!caseRecord) return false;
    const isFinalState = caseRecord.operationalState === 'resolved' || caseRecord.operationalState === 'closed';
    return isFinalState && !hasAppealed;
  }, [caseRecord, hasAppealed]);

  const canSendMessage = useMemo(() => {
    if (!caseRecord) return false;
    return caseRecord.operationalState !== 'closed';
  }, [caseRecord]);

  const stateDisplay = caseRecord ? STATE_DISPLAY[caseRecord.operationalState] : null;
  const priorityDisplay = caseRecord ? PRIORITY_DISPLAY[caseRecord.priority] : null;
  const priorityColor = priorityDisplay ? colors[priorityDisplay.color] : colors.textMuted;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async () => {
    const trimmed = messageText.trim();
    if (!trimmed || !caseRecord || sendingMessage) return;
    setSendingMessage(true);
    haptic.medium();
    try {
      const event = await sendSupportCaseMessage(caseRecord.id, trimmed);
      setEvents((prev) => [...prev, event]);
      setMessageText('');
      show('Information added to case', 'success');
    } catch {
      show('Could not send. Check your connection and try again.', 'error');
    } finally {
      setSendingMessage(false);
    }
  }, [messageText, caseRecord, sendingMessage, haptic, show]);

  const handleAppeal = useCallback(() => {
    if (!caseRecord || appealing) return;
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: 'Appeal this decision?',
      message: 'Submitting an appeal asks the support team to review the decision on this case.',
      confirmLabel: 'Submit Appeal',
      onConfirm: async () => {
        if (!caseRecord) return;
        setAppealing(true);
        try {
          const event = await appealSupportCase(caseRecord.id, 'Appeal requested by customer from case detail.');
          setEvents((prev) => [...prev, event]);
          show('Appeal submitted', 'success');
        } catch {
          show('Could not submit appeal. Try again later.', 'error');
        } finally {
          setAppealing(false);
        }
      } });
  }, [caseRecord, appealing, haptic, show, setConfirmSheet]);

  const handleContextLinkPress = useCallback(
    (link: ContextLink) => {
      const route = contextLinkRoute(link.kind, link.id);
      if (!route) {
        haptic.light();
        show(`${contextLinkLabel(link.kind)} details are not available here.`, 'info');
        return;
      }
      haptic.light();
      navigation.navigate(route.name as 'OrderDetail', route.params as { orderId: string });
    },
    [navigation, haptic, show]
  );

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support Case" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" title="Loading case" subtitle="One moment while we retrieve the case record." />
      </FlagshipScreen>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support Case" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="error"
          title="Could not load case"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={loadCase}
        />
      </FlagshipScreen>
    );
  }

  // ── Not-found state ──────────────────────────────────────────────────────
  if (!caseRecord) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support Case" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="unavailable"
          title="Case not found"
          subtitle="This case may have been removed or is no longer accessible."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  const createdDate = formatDate(caseRecord.createdAt);
  const updatedDate = formatDate(caseRecord.updatedAt);

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Support Case" onBack={() => navigation.goBack()} />}
      contentStyle={styles.content}
    >
      {/* ── Case identity — flat canvas, no card ─────────────────────────── */}
      <View style={styles.identityBlock}>
        <View style={styles.identityRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.issueType}>{caseRecord.issueType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
            <Caption color={colors.textMuted} style={styles.caseId}>
              Case #{caseRecord.id.slice(-8).toUpperCase()}
            </Caption>
          </View>
          {stateDisplay && (
            <AppStatusPill
              variant="block"
              tone={stateDisplay.tone}
              label={stateDisplay.label}
              icon={stateDisplay.icon}
            />
          )}
        </View>

        {/* Meta row — priority + dates, hairline separator */}
        <View style={styles.metaRow}>
          {priorityDisplay && (
            <View style={styles.metaItem}>
              <View style={styles.priorityValueRow}>
                <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
                <Text style={[styles.metaValue, { color: priorityColor }]}>{priorityDisplay.label}</Text>
              </View>
            </View>
          )}
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{createdDate}</Text>
          </View>
          {createdDate !== updatedDate && (
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{updatedDate}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Requested outcome — flat text block, hairline separator ─────── */}
      {caseRecord.requestedOutcome && (
        <View style={styles.section}>
          <Text style={styles.outcomeText}>{caseRecord.requestedOutcome}</Text>
        </View>
      )}

      {/* ── Resolution disposition — flat text block ─────────────────────── */}
      {caseRecord.resolutionDisposition && (
        <View style={styles.section}>
          <Text style={styles.outcomeText}>
            {DISPOSITION_LABEL[caseRecord.resolutionDisposition] ?? caseRecord.resolutionDisposition.replace(/_/g, ' ')}
          </Text>
        </View>
      )}

      {/* ── Related context — flat rows with hairline separators ─────────── */}
      {contextLinks.length > 0 && (
        <View style={styles.section}>
          <View style={styles.contextList}>
            {contextLinks.map((link, index) => (
              <React.Fragment key={`${link.kind}:${link.id}`}>
                <AnimatedPressable
                  style={styles.contextRow}
                  onPress={() => handleContextLinkPress(link)}
                  activeOpacity={0.7}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel={`${contextLinkLabel(link.kind)} ${link.id.slice(-8).toUpperCase()}`}
                >
                  <Ionicons name={contextLinkIcon(link.kind)} size={18} color={colors.textSecondary} />
                  <Text style={styles.contextLabel}>{contextLinkLabel(link.kind)}</Text>
                  <Text style={styles.contextId}>#{link.id.slice(-8).toUpperCase()}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </AnimatedPressable>
                {index < contextLinks.length - 1 && <View style={styles.hairline} />}
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {/* ── Timeline — vertical line with dots, flat (no card) ───────────── */}
      <View style={styles.section}>
        {publicEvents.length === 0 ? (
          <Text style={styles.emptyTimelineText}>No public activity yet.</Text>
        ) : (
          <View style={styles.timeline}>
            {publicEvents.map((event, index) => {
              const rendered = renderEvent(event);
              const isLast = index === publicEvents.length - 1;
              const isCustomer = event.actorRole === 'customer';
              return (
                <View key={event.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, isCustomer && styles.timelineDotCustomer]} />
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>{rendered.label}</Text>
                    {rendered.summary && (
                      <Text style={styles.timelineSummary} numberOfLines={3}>{rendered.summary}</Text>
                    )}
                    <View style={styles.timelineMeta}>
                      <Text style={styles.timelineActor}>{actorRoleLabel(event.actorRole)}</Text>
                      <Text style={styles.timelineTime}>{formatTimestamp(event.createdAt)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Appeal action ─────────────────────────────────────────────────── */}
      {canAppeal && (
        <View style={styles.section}>
          <AppButton
            title="Appeal Decision"
            variant="secondary"
            size="lg"
            icon={<Ionicons name="arrow-undo-circle-outline" size={18} color={colors.textPrimary} />}
            onPress={handleAppeal}
            loading={appealing}
            disabled={appealing}
            hapticFeedback="heavy"
            accessibilityLabel="Appeal the decision on this case"
            style={styles.fullWidth}
          />
        </View>
      )}

      {/* ── Message input — add information to the case ───────────────────── */}
      {canSendMessage && (
        <View style={styles.messageSection}>
          <Meta color={colors.textMuted} style={styles.sectionLabel}>Add information</Meta>
          <AppInput
            ref={inputRef}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Add context, details, or a follow-up…"
            multiline
            appearance="filled"
            inputStyle={styles.messageInput}
            inputContainerStyle={styles.messageInputContainer}
          />
          <AppButton
            title="Send"
            variant="primary"
            size="md"
            onPress={handleSendMessage}
            loading={sendingMessage}
            disabled={!messageText.trim() || sendingMessage}
            hapticFeedback="medium"
            accessibilityLabel="Send information to support"
            style={styles.sendBtn}
          />
        </View>
      )}

      {/* ── Closed notice — when no message input is available ────────────── */}
      {!canSendMessage && (
        <View style={styles.closedNotice}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <Text style={styles.closedNoticeText}>This case is closed. Contact support to reopen it.</Text>
        </View>
      )}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </FlagshipScreen>
  );
}

// ============================================================================
// STYLES
// ============================================================================
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      gap: Space.lg,
      paddingBottom: Space.xxl },

    // ── Identity ──
    identityBlock: {
      gap: Space.md },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.md },
    issueType: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary },
    caseId: {
      marginTop: Space.xs / 2,
      letterSpacing: TypographyV2.meta.letterSpacing },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.lg,
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.border,
      paddingTop: Space.md },
    metaItem: {
      gap: Space.xs / 2 },
    metaValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    priorityValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    priorityDot: {
      width: 6,
      height: 6,
      borderRadius: Radius.full },

    // ── Sections ──
    section: {
      gap: Space.sm },
    sectionLabel: {
      letterSpacing: 0 },
    outcomeText: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight + 4,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },

    // ── Context links ──
    contextList: {
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.border },
    contextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md },
    contextLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    contextId: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    hairline: {
      height: Stroke.hairline,
      backgroundColor: colors.border },

    // ── Timeline ──
    timeline: {
      paddingTop: Space.xs },
    timelineRow: {
      flexDirection: 'row',
      gap: Space.md },
    timelineRail: {
      width: 12,
      alignItems: 'center' },
    timelineDot: {
      width: 8,
      height: 8,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      marginTop: Space.xs },
    timelineDotCustomer: {
      backgroundColor: colors.textPrimary },
    timelineLine: {
      width: Stroke.standard,
      flex: 1,
      backgroundColor: colors.border,
      marginTop: Space.xs / 2,
      minHeight: Space.lg },
    timelineContent: {
      flex: 1,
      paddingBottom: Space.lg },
    timelineLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.body.letterSpacing },
    timelineSummary: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight + 2,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      marginTop: Space.xs / 2 },
    timelineMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs },
    timelineActor: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    timelineTime: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    emptyTimelineText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
      paddingVertical: Space.md },

    // ── Actions ──
    fullWidth: {
      width: '100%' },

    // ── Message input ──
    messageSection: {
      gap: Space.sm },
    messageInputContainer: {
      minHeight: 72,
      alignItems: 'flex-start' },
    messageInput: {
      paddingVertical: Space.sm },
    sendBtn: {
      alignSelf: 'flex-start' },

    // ── Closed notice ──
    closedNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.border },
    closedNoticeText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted } });
}
