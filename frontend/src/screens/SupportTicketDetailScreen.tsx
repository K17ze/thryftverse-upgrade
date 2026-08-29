import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import { Ionicons, type Ionicons as IoniconsType } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { useHaptic } from '../hooks/useHaptic';
import { AppStatusPill } from '../components/ui/AppStatusPill';
import { Meta, BodyEmphasis, Caption } from '../components/ui/Text';
import { CommerceOrder, getOrder } from '../services/commerceApi';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { getSupportCase } from '../services/supportConversationApi';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import type {
  SupportCase,
  SupportCaseEvent,
  CaseResolutionDisposition } from '../contracts/support';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportTicketDetail'>;

const STATUS_CONFIG: Record<string, { label: string; tone: 'pending' | 'success' | 'neutral' | 'shipped' | 'paid' | 'delivered' }> = {
  open: { label: 'Open', tone: 'pending' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' } };

const DISPOSITION_LABELS: Record<CaseResolutionDisposition, string> = {
  information_provided: 'Information provided',
  customer_withdrew: 'Customer withdrew',
  seller_resolved: 'Seller resolved',
  refund_approved: 'Refund approved',
  refund_denied: 'Refund denied',
  return_approved: 'Return approved',
  not_eligible: 'Not eligible',
  no_violation: 'No violation found',
  violation_actioned: 'Violation actioned',
  duplicate: 'Duplicate case',
  merged: 'Merged case',
  external_dispute: 'External dispute',
  unable_to_resolve: 'Unable to resolve' };

interface EventDescriptor {
  label: string;
  icon: keyof typeof IoniconsType.glyphMap;
}

const EVENT_DESCRIPTORS: Record<string, EventDescriptor> = {
  case_created: { label: 'Case opened', icon: 'flag-outline' },
  case_reopened: { label: 'Case reopened', icon: 'refresh-outline' },
  message_sent: { label: 'Message sent', icon: 'chatbubble-outline' },
  customer_message: { label: 'Your message', icon: 'chatbubble-outline' },
  agent_message: { label: 'Agent reply', icon: 'chatbubble-ellipses-outline' },
  agent_ai_message: { label: 'Assistant reply', icon: 'sparkles-outline' },
  agent_human_message: { label: 'Support reply', icon: 'chatbubble-ellipses-outline' },
  system_message: { label: 'System notice', icon: 'information-circle-outline' },
  handoff_requested: { label: 'Escalated to human agent', icon: 'person-add-outline' },
  triaged: { label: 'Triaged', icon: 'list-outline' },
  assigned: { label: 'Assigned to operator', icon: 'person-outline' },
  queued: { label: 'Placed in queue', icon: 'hourglass-outline' },
  in_review: { label: 'In review', icon: 'search-outline' },
  evidence_reviewed: { label: 'Evidence reviewed', icon: 'eye-outline' },
  awaiting_customer: { label: 'Awaiting your response', icon: 'mail-outline' },
  awaiting_external: { label: 'Awaiting third party', icon: 'time-outline' },
  resolved: { label: 'Resolved', icon: 'checkmark-circle-outline' },
  closed: { label: 'Closed', icon: 'close-circle-outline' },
  customer_withdrew: { label: 'Request withdrawn', icon: 'remove-circle-outline' },
  appealed: { label: 'Appealed', icon: 'arrow-up-circle-outline' },
  action_proposed: { label: 'Action proposed', icon: 'bulb-outline' },
  action_confirmed: { label: 'Action confirmed', icon: 'checkmark-outline' },
  action_executed: { label: 'Action completed', icon: 'checkmark-done-outline' } };

function describeEvent(eventType: string): EventDescriptor {
  const known = EVENT_DESCRIPTORS[eventType];
  if (known) return known;
  const pretty = eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: pretty, icon: 'ellipse-outline' };
}

function formatDate(ts: string | number): string {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric' });
}

function formatTime(ts: string | number): string {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit' });
}

export default function SupportTicketDetailScreen({ navigation, route }: Props) {
  const { ticketId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();

  const supportTickets = useStore((state) => state.supportTickets);
  const updateSupportTicketStatus = useStore((state) => state.updateSupportTicketStatus);
  const [order, setOrder] = useState<CommerceOrder | null>(null);

  // Case projection state — backfilled tickets expose a support_case via
  // the `case_{ticketId}` id pattern (migration 150). When the lookup
  // succeeds we render the real event-sourced timeline; on any failure we
  // silently fall back to the legacy static two-step timeline.
  const [caseData, setCaseData] = useState<SupportCase | null>(null);
  const [caseEvents, setCaseEvents] = useState<SupportCaseEvent[]>([]);
  const [caseLoading, setCaseLoading] = useState(true);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const ticket = useMemo(
    () => supportTickets.find((t) => t.id === ticketId),
    [supportTickets, ticketId]
  );

  const caseId = useMemo(() => `case_${ticketId}`, [ticketId]);

  useEffect(() => {
    if (!ticket?.orderId) return;
    let cancelled = false;
    const fetchOrder = async () => {
      try {
        const fetched = await getOrder(ticket.orderId);
        if (!cancelled) setOrder(fetched);
      } catch {
        // Order context unavailable
      }
    };
    void fetchOrder();
    return () => { cancelled = true; };
  }, [ticket?.orderId]);

  useEffect(() => {
    let cancelled = false;
    const fetchCase = async () => {
      setCaseLoading(true);
      try {
        const result = await getSupportCase(caseId);
        if (cancelled) return;
        setCaseData(result.case);
        setCaseEvents(result.events);
      } catch {
        // Case not backfilled yet — fall back to static timeline.
        if (cancelled) return;
        setCaseData(null);
        setCaseEvents([]);
      } finally {
        if (!cancelled) setCaseLoading(false);
      }
    };
    void fetchCase();
    return () => { cancelled = true; };
  }, [caseId]);

  const refreshCase = useCallback(async () => {
    try {
      const result = await getSupportCase(caseId);
      setCaseData(result.case);
      setCaseEvents(result.events);
    } catch {
      // Case may have been removed; keep existing state.
    }
  }, [caseId]);

  const config = ticket ? STATUS_CONFIG[ticket.status] : null;

  const publicEvents = useMemo(
    () => caseEvents.filter((e) => e.isPublic).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
    [caseEvents]
  );

  const dispositionLabel = useMemo(() => {
    if (!caseData?.resolutionDisposition) return null;
    return DISPOSITION_LABELS[caseData.resolutionDisposition] ?? null;
  }, [caseData?.resolutionDisposition]);

  const hasConversation = Boolean(caseData?.conversationId);

  const handleClose = useCallback(() => {
    if (!ticket) return;
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: 'Close this request?',
      message: 'This withdraws your request. You can reopen it later if the issue is not resolved.',
      confirmLabel: 'Close',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await updateSupportTicketStatus(ticket.id, 'closed');
          if (caseData) {
            void refreshCase();
          }
          show('Request closed', 'info');
        } catch {
          show('Could not close the request. Check your connection and try again.', 'error');
        }
      } });
  }, [ticket, haptic, updateSupportTicketStatus, caseData, refreshCase, show, setConfirmSheet]);

  const handleReopen = useCallback(async () => {
    if (!ticket) return;
    haptic.medium();
    try {
      await updateSupportTicketStatus(ticket.id, 'open');
      if (caseData) {
        void refreshCase();
      }
      show('Request reopened', 'success');
    } catch {
      show('Could not reopen the request. Check your connection and try again.', 'error');
    }
  }, [ticket, haptic, updateSupportTicketStatus, caseData, refreshCase, show]);

  const handleViewConversation = useCallback(() => {
    if (!caseData?.conversationId) return;
    haptic.light();
    navigation.navigate('SupportConversation', {
      conversationId: caseData.conversationId,
      contextKind: 'order',
      contextId: ticket?.orderId });
  }, [caseData?.conversationId, haptic, navigation, ticket?.orderId]);

  if (!ticket) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support Request" onBack={() => navigation.goBack()} />}
      >
        <View style={styles.center}>
          <Ionicons name="help-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Ticket not found</Text>
          <Text style={styles.emptySub}>This support request may have been removed.</Text>
        </View>
      </FlagshipScreen>
    );
  }

  const createdDate = formatDate(ticket.createdAt);
  const updatedDate = formatDate(ticket.updatedAt);

  const evidenceUrls = ticket.evidenceMediaUrls ?? [];

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Support Request" onBack={() => navigation.goBack()} />}
      contentStyle={{ gap: Space.lg }}
    >
        {/* Order context — flat section, no card chrome */}
        {order && (
          <View style={styles.orderContextCard}>
            <View style={styles.orderContextRow}>
              {order.listingImageUrl && (
                <CachedImage
                  uri={getListingCoverUri([order.listingImageUrl], '')}
                  style={styles.orderContextThumb}
                  contentFit="cover"
                />
              )}
              <View style={styles.orderContextInfo}>
                <Text style={styles.orderContextTitle} numberOfLines={2}>{order.listingTitle}</Text>
                <Text style={styles.orderContextMeta}>Order #{ticket.orderId.slice(-8).toUpperCase()}</Text>
                <Text style={styles.orderContextStatus}>{order.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Status header — flat canvas, no nested surface */}
        <View>
          <View style={styles.statusHeader}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <BodyEmphasis style={styles.statusTitle}>{ticket.topicLabel}</BodyEmphasis>
              <Caption color={colors.textMuted} style={styles.statusId}>
                Ticket #{ticket.id.slice(-8).toUpperCase()}
              </Caption>
            </View>
            {config && (
              <AppStatusPill
                variant="block"
                tone={config.tone}
                label={config.label}
                icon={
                  ticket.status === 'open'
                    ? 'time-outline'
                    : ticket.status === 'resolved'
                    ? 'checkmark-circle-outline'
                    : 'close-circle-outline'
                }
              />
            )}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Meta color={colors.textMuted}>ORDER</Meta>
              <Text style={styles.metaValue}>#{ticket.orderId.slice(-8).toUpperCase()}</Text>
            </View>
            <View style={styles.metaItem}>
              <Meta color={colors.textMuted}>DATE</Meta>
              <Text style={styles.metaValue}>{createdDate}</Text>
            </View>
          </View>

          {/* Resolution disposition — flat row, only when set */}
          {dispositionLabel && (
            <View style={styles.dispositionRow}>
              <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.brand} />
              <Text style={styles.dispositionLabel}>Resolution</Text>
              <Text style={styles.dispositionValue}>{dispositionLabel}</Text>
            </View>
          )}
        </View>

        {/* Details */}
        <View>
          <Meta color={colors.textMuted} style={styles.sectionLabel}>DETAILS</Meta>
          <View style={styles.detailsCard}>
            <Text style={styles.detailsText}>{ticket.details}</Text>
          </View>
        </View>

        {/* Evidence */}
        {evidenceUrls.length > 0 && (
          <View>
            <Meta color={colors.textMuted} style={styles.sectionLabel}>EVIDENCE</Meta>
            <View style={styles.evidenceCard}>
              <View style={styles.evidenceThumbs}>
                {evidenceUrls.map((uri) => (
                  <CachedImage key={uri} uri={uri} style={styles.evidenceThumb} contentFit="cover" />
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Timeline — real event projection when a case exists, otherwise
            the legacy static two-step timeline. Rendered as a flat vertical
            line with dots, never a card-on-card composition. */}
        <View>
          <Meta color={colors.textMuted} style={styles.sectionLabel}>TIMELINE</Meta>
          {caseLoading ? (
            <View style={styles.timelineLoading}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : publicEvents.length > 0 ? (
            <View style={styles.timeline}>
              {publicEvents.map((event, index) => {
                const desc = describeEvent(event.eventType);
                const isLast = index === publicEvents.length - 1;
                const payloadNote = typeof event.payload?.['note'] === 'string'
                  ? (event.payload['note'] as string)
                  : null;
                return (
                  <View key={event.id} style={styles.timelineEntry}>
                    <View style={styles.timelineRail}>
                      <View style={styles.timelineDot} />
                      {!isLast && <View style={styles.timelineConnector} />}
                    </View>
                    <View style={styles.timelineBody}>
                      <View style={styles.timelineTitleRow}>
                        <Ionicons name={desc.icon} size={14} color={colors.textSecondary} />
                        <Text style={styles.timelineItemTitle}>{desc.label}</Text>
                      </View>
                      <Text style={styles.timelineItemDate}>
                        {formatDate(event.createdAt)} · {formatTime(event.createdAt)}
                      </Text>
                      {payloadNote && (
                        <Text style={styles.timelineItemNote} numberOfLines={3}>{payloadNote}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.timeline}>
              <View style={styles.timelineEntry}>
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineConnector} />
                </View>
                <View style={styles.timelineBody}>
                  <View style={styles.timelineTitleRow}>
                    <Ionicons name="flag-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.timelineItemTitle}>Request submitted</Text>
                  </View>
                  <Text style={styles.timelineItemDate}>{createdDate}</Text>
                </View>
              </View>
              <View style={styles.timelineEntry}>
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot} />
                </View>
                <View style={styles.timelineBody}>
                  <View style={styles.timelineTitleRow}>
                    <Ionicons
                      name={ticket.status === 'open' ? 'time-outline' : ticket.status === 'resolved' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.timelineItemTitle}>
                      {ticket.status === 'open' ? 'Awaiting review' : ticket.status === 'resolved' ? 'Resolved' : 'Closed'}
                    </Text>
                  </View>
                  <Text style={styles.timelineItemDate}>
                    {ticket.status === 'open' ? 'In progress' : updatedDate}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          {ticket.status === 'open' && (
            <AppButton
              title="Close Request"
              variant="secondary"
              size="lg"
              icon={<Ionicons name="close-circle-outline" size={18} color={colors.textPrimary} />}
              style={styles.actionBtn}
              onPress={handleClose}
              hapticFeedback="medium"
              accessibilityLabel="Close support request"
            />
          )}
          {ticket.status !== 'open' && (
            <AppButton
              title="Reopen Request"
              variant="primary"
              size="lg"
              icon={<Ionicons name="refresh-outline" size={18} color={colors.background} />}
              style={styles.actionBtn}
              onPress={handleReopen}
              hapticFeedback="medium"
              accessibilityLabel="Reopen support request"
            />
          )}

          {hasConversation && (
            <AnimatedPressable
              style={styles.conversationLink}
              onPress={handleViewConversation}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="View conversation"
            >
              <Ionicons name="chatbubbles-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.conversationLinkText}>View conversation</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </AnimatedPressable>
          )}

          <AnimatedPressable
            style={styles.orderLink}
            onPress={() => navigation.navigate('OrderDetail', { orderId: ticket.orderId })}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="View order"
          >
            <Ionicons name="cube-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.orderLinkText}>View order</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </AnimatedPressable>
        </View>

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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Space.xl,
    gap: Space.md },
  emptyTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary,
    marginTop: Space.sm },
  emptySub: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted,
    textAlign: 'center' },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  statusTitle: {
    fontSize: TypographyV2.screenTitle.size,
    color: colors.textPrimary,
    marginBottom: Space.xs / 2 },
  statusId: {
    letterSpacing: TypographyV2.label.letterSpacing },
  metaRow: {
    flexDirection: 'row',
    gap: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: Space.md,
    marginTop: Space.md },
  metaItem: {
    gap: Space.xs },
  metaValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  dispositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: Space.md,
    marginTop: Space.md },
  dispositionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.meta.letterSpacing },
  dispositionValue: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand },
  sectionLabel: {
    marginLeft: Space.sm,
    letterSpacing: 1.2,
    marginBottom: Space.sm },
  detailsCard: {
    padding: Space.lg },
  detailsText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.body.lineHeight + 4 },
  actionsCard: {
    gap: Space.md },
  actionBtn: {
    width: '100%' },
  orderLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg },
  orderLinkText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  conversationLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg },
  conversationLinkText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  orderContextCard: {
    padding: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  orderContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  orderContextThumb: {
    width: Space.xl + Space.xl - 4,
    height: Space.xl + Space.xl - 4,
    borderRadius: Radius.md },
  orderContextInfo: {
    flex: 1,
    gap: Space.xs / 2 },
  orderContextTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  orderContextMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  orderContextStatus: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand,
    textTransform: 'capitalize' },
  evidenceCard: {
    padding: Space.md },
  evidenceThumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm },
  evidenceThumb: {
    width: Space.xxl + Space.xl,
    height: Space.xxl + Space.xl,
    borderRadius: Radius.md },
  // ── Timeline — flat vertical line with dots, no card wrapper ──
  timeline: {
    paddingVertical: Space.xs },
  timelineLoading: {
    paddingVertical: Space.lg,
    alignItems: 'center' },
  timelineEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 44 },
  timelineRail: {
    width: Space.md,
    alignItems: 'center',
    paddingTop: Space.xs },
  timelineDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.brand },
  timelineConnector: {
    width: Stroke.hairline,
    flex: 1,
    minHeight: Space.lg,
    backgroundColor: colors.border,
    marginTop: Space.xs / 2 },
  timelineBody: {
    flex: 1,
    paddingBottom: Space.lg,
    marginLeft: Space.sm },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  timelineItemTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  timelineItemDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs / 2 },
  timelineItemNote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    marginTop: Space.xs / 2,
    lineHeight: TypographyV2.meta.lineHeight + 2 } });
}
