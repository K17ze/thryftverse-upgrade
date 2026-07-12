import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { useHaptic } from '../hooks/useHaptic';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';
import { Meta, BodyEmphasis, Caption } from '../components/ui/Text';
import { CommerceOrder, getOrder } from '../services/commerceApi';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = StackScreenProps<RootStackParamList, 'SupportTicketDetail'>;

const STATUS_CONFIG: Record<string, { label: string; tone: 'pending' | 'success' | 'error' | 'shipped' | 'paid' | 'delivered' }> = {
  open: { label: 'Open', tone: 'pending' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'error' },
};

export default function SupportTicketDetailScreen({ navigation, route }: Props) {
  const { ticketId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();

  const supportTickets = useStore((state) => state.supportTickets);
  const updateSupportTicketStatus = useStore((state) => state.updateSupportTicketStatus);
  const [order, setOrder] = useState<CommerceOrder | null>(null);

  const ticket = useMemo(
    () => supportTickets.find((t) => t.id === ticketId),
    [supportTickets, ticketId]
  );

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

  const config = ticket ? STATUS_CONFIG[ticket.status] : null;

  const handleClose = useCallback(() => {
    if (!ticket) return;
    haptic.heavy();
    Alert.alert(
      'Close this request?',
      'You can reopen it later if the issue is not resolved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: () => {
            updateSupportTicketStatus(ticket.id, 'closed');
            show('Request closed', 'info');
          },
        },
      ]
    );
  }, [ticket, haptic, updateSupportTicketStatus, show]);

  const handleReopen = useCallback(() => {
    if (!ticket) return;
    haptic.medium();
    updateSupportTicketStatus(ticket.id, 'open');
    show('Request reopened', 'success');
  }, [ticket, haptic, updateSupportTicketStatus, show]);

  if (!ticket) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="Support Request" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Ionicons name="help-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Ticket not found</Text>
          <Text style={styles.emptySub}>This support request may have been removed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const createdDate = new Date(ticket.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const updatedDate = new Date(ticket.updatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const evidenceUrls = ticket.evidenceMediaUrls ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="Support Request" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Order context card */}
        {order && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(20)}>
            <ElevatedSurface variant="surface" style={styles.orderContextCard}>
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
            </ElevatedSurface>
          </Reanimated.View>
        )}

        {/* Status header */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(40)}>
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={styles.statusIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={28} color={Colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <BodyEmphasis style={styles.statusTitle}>{ticket.topicLabel}</BodyEmphasis>
                <Caption color={Colors.textMuted} style={styles.statusId}>
                  Ticket #{ticket.id.slice(-8).toUpperCase()}
                </Caption>
              </View>
              {config && (
                <PremiumStatusPill
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
                <Meta color={Colors.textMuted}>ORDER</Meta>
                <Text style={styles.metaValue}>#{ticket.orderId.slice(-8).toUpperCase()}</Text>
              </View>
              <View style={styles.metaItem}>
                <Meta color={Colors.textMuted}>DATE</Meta>
                <Text style={styles.metaValue}>{createdDate}</Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Details */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}>
          <Meta color={Colors.textMuted} style={styles.sectionLabel}>DETAILS</Meta>
          <View style={styles.detailsCard}>
            <Text style={styles.detailsText}>{ticket.details}</Text>
          </View>
        </Reanimated.View>

        {/* Evidence */}
        {evidenceUrls.length > 0 && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(100)}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>EVIDENCE</Meta>
            <View style={styles.evidenceCard}>
              <View style={styles.evidenceThumbs}>
                {evidenceUrls.map((uri) => (
                  <CachedImage key={uri} uri={uri} style={styles.evidenceThumb} contentFit="cover" />
                ))}
              </View>
            </View>
          </Reanimated.View>
        )}

        {/* Timeline */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
          <Meta color={Colors.textMuted} style={styles.sectionLabel}>TIMELINE</Meta>
          <View style={styles.timelineListCard}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotActive]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineItemTitle}>Request submitted</Text>
                <Text style={styles.timelineItemDate}>{createdDate}</Text>
              </View>
            </View>
            <View style={styles.timelineLine} />
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, ticket.status !== 'open' ? styles.timelineDotActive : styles.timelineDotPending]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineItemTitle}>
                  {ticket.status === 'open' ? 'Awaiting review' : ticket.status === 'resolved' ? 'Resolved' : 'Closed'}
                </Text>
                <Text style={styles.timelineItemDate}>
                  {ticket.status === 'open' ? 'In progress' : updatedDate}
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Support note */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(140)} style={styles.timelineCard}>
          <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.timelineTitle}>Typical response time</Text>
            <Text style={styles.timelineSub}>
              Our support team typically responds within 24 hours. For urgent issues, contact us through the Help & Support page.
            </Text>
          </View>
        </Reanimated.View>

        {/* Actions */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(160)} style={styles.actionsCard}>
          {ticket.status === 'open' && (
            <AppButton
              title="Close Request"
              variant="secondary"
              size="lg"
              icon={<Ionicons name="close-circle-outline" size={18} color={Colors.textPrimary} />}
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
              icon={<Ionicons name="refresh-outline" size={18} color={Colors.background} />}
              style={styles.actionBtn}
              onPress={handleReopen}
              hapticFeedback="medium"
              accessibilityLabel="Reopen support request"
            />
          )}
          <AnimatedPressable
            style={styles.orderLink}
            onPress={() => navigation.navigate('OrderDetail', { orderId: ticket.orderId })}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
          >
            <Ionicons name="cube-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.orderLinkText}>View order</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </AnimatedPressable>
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Space.xl,
    gap: Space.md,
  },
  emptyTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginTop: Space.sm,
  },
  emptySub: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    ...Elevation.subtle,
    gap: Space.lg,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  statusIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: Type.title.size,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  statusId: {
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: Space.md,
  },
  metaItem: {
    gap: 4,
  },
  metaValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    marginLeft: Space.sm,
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    ...Elevation.subtle,
  },
  detailsText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: Type.body.lineHeight + 4,
  },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  timelineTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  timelineSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: Type.caption.lineHeight + 2,
  },
  actionsCard: {
    gap: Space.md,
  },
  actionBtn: {
    width: '100%',
  },
  orderLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    ...Elevation.subtle,
  },
  orderLinkText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  orderContextCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
  },
  orderContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  orderContextThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  orderContextInfo: {
    flex: 1,
    gap: 2,
  },
  orderContextTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  orderContextMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  orderContextStatus: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    textTransform: 'capitalize',
  },
  evidenceCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
  },
  evidenceThumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  evidenceThumb: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
  },
  timelineListCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    ...Elevation.subtle,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: Radius.full,
  },
  timelineDotActive: {
    backgroundColor: Colors.brand,
  },
  timelineDotPending: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  timelineLine: {
    width: 2,
    height: 24,
    backgroundColor: Colors.border,
    marginLeft: 5,
  },
  timelineContent: {
    flex: 1,
  },
  timelineItemTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  timelineItemDate: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
});