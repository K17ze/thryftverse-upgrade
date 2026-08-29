import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Elevation, LetterSpacing, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, Meta } from '../components/ui/Text';
import { CommerceOrder, getOrder } from '../services/commerceApi';
import { normaliseOrderStatus } from '../components/orders/orderCapabilities';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import * as ImagePicker from 'expo-image-picker';
import { uploadMedia } from '../services/mediaUpload';
import { parseApiError } from '../lib/apiClient';
import { t } from '../i18n';


type Props = NativeStackScreenProps<RootStackParamList, 'OrderSupport'>;

interface SupportTopic {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  description: string;
  requiresStatus: string[] | null;
}

const ALL_SUPPORT_TOPICS: SupportTopic[] = [
  { id: 'not_received', icon: 'cube-outline', label: 'Item not received', description: 'My order has not arrived within the expected timeframe.', requiresStatus: ['shipped', 'in transit', 'out for delivery', 'delivered'] },
  { id: 'not_as_described', icon: 'alert-circle-outline', label: 'Not as described', description: 'The item condition, size, or authenticity does not match the listing.', requiresStatus: ['delivered'] },
  { id: 'damaged', icon: 'bandage-outline', label: 'Item arrived damaged', description: 'The item was damaged during shipping or arrived broken.', requiresStatus: ['delivered'] },
  { id: 'wrong_item', icon: 'shuffle-outline', label: 'Wrong item sent', description: 'I received a different item than what I ordered.', requiresStatus: ['delivered'] },
  { id: 'return', icon: 'return-down-back-outline', label: 'Request a return', description: 'I want to return the item for a refund.', requiresStatus: ['delivered'] },
  { id: 'payment_issue', icon: 'card-outline', label: 'Payment issue', description: 'There was a problem with payment or billing.', requiresStatus: ['created', 'paid'] },
  { id: 'other', icon: 'chatbubble-outline', label: 'Other issue', description: 'Something else is wrong with my order.', requiresStatus: null },
];

/**
 * Reason-specific evidence guidance.
 * The report (§11.4) requires that we only ask for evidence needed by the
 * chosen reason — no accusatory photo theatre for change-of-mind returns.
 */
const EVIDENCE_GUIDANCE: Record<string, { needsPhotos: boolean; hint: string }> = {
  not_received: { needsPhotos: false, hint: '' },
  not_as_described: { needsPhotos: true, hint: 'Attach photos showing how the item differs from the listing.' },
  damaged: { needsPhotos: true, hint: 'Attach photos of the damage and original packaging.' },
  wrong_item: { needsPhotos: true, hint: 'Attach photos of the received item.' },
  return: { needsPhotos: false, hint: '' },
  payment_issue: { needsPhotos: false, hint: '' },
  other: { needsPhotos: false, hint: 'Photos optional.' } };

/**
 * One-line outcome preview shown as a final confirmation right before the
 * submit button. Reduces uncertainty about what happens next.
 */
const OUTCOME_PREVIEW: Record<string, string> = {
  not_received: "We'll contact the seller to confirm dispatch.",
  not_as_described: "We'll compare your photos against the listing.",
  damaged: "We'll assess the damage and arrange a resolution.",
  wrong_item: "We'll review the photos and coordinate a return.",
  return: "We'll review your return eligibility.",
  payment_issue: "We'll investigate the payment discrepancy.",
  other: 'Our team will review and respond.' };

export default function OrderSupportScreen({ navigation, route }: Props) {
  const { orderId, categoryId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const [selectedTopic, setSelectedTopic] = useState<string | null>(categoryId ?? null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);
  const [order, setOrder] = React.useState<CommerceOrder | null>(null);
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);

  const createSupportTicketOnApi = useStore((state) => state.createSupportTicketOnApi);
  const getSupportTicketsForOrder = useStore((state) => state.getSupportTicketsForOrder);
  const loadSupportTicketsForOrderFromApi = useStore((state) => state.loadSupportTicketsForOrderFromApi);

  React.useEffect(() => {
    let cancelled = false;
    const fetchOrder = async () => {
      try {
        const fetched = await getOrder(orderId);
        if (!cancelled) setOrder(fetched);
      } catch {
        // Order context unavailable; support form still usable
      }
    };
    void fetchOrder();
    void loadSupportTicketsForOrderFromApi(orderId);
    return () => { cancelled = true; };
  }, [orderId, loadSupportTicketsForOrderFromApi]);

  const existingTickets = getSupportTicketsForOrder(orderId);
  const openTicket = existingTickets.find((t) => t.status === 'open');

  const orderStatus = normaliseOrderStatus(order?.status ?? 'unknown');
  const availableTopics = ALL_SUPPORT_TOPICS.filter((t) => {
    if (t.requiresStatus === null) return true;
    return t.requiresStatus.includes(orderStatus);
  });

  const canSubmit = selectedTopic && details.trim().length > 10 && !isSubmitting && !isSubmitted && !isUploadingEvidence;

  // Reason-specific evidence: only show the photo section when the chosen
  // reason actually needs it (or allows it as optional for "other").
  const evidenceConfig = selectedTopic ? EVIDENCE_GUIDANCE[selectedTopic] : null;
  const showEvidence = !!(evidenceConfig && (evidenceConfig.needsPhotos || selectedTopic === 'other'));

  const handlePickEvidence = useCallback(async () => {
    if (evidenceUris.length >= 3) {
      show('Attach up to 3 photos.', 'info');
      return;
    }
    haptic.light();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow gallery access to upload evidence.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: 3 - evidenceUris.length });
      if (result.canceled || !result.assets?.length) return;
      setIsUploadingEvidence(true);
      const uploaded: string[] = [];
      for (const asset of result.assets) {
        const uploadedMedia = await uploadMedia(asset.uri, 'evidence');
        uploaded.push(uploadedMedia.publicUrl);
      }
      setEvidenceUris((prev) => [...prev, ...uploaded]);
      show(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} attached.`, 'success');
    } catch {
      show('Unable to upload photo(s). Try again.', 'error');
    } finally {
      setIsUploadingEvidence(false);
    }
  }, [evidenceUris.length, haptic, show]);

  const handleRemoveEvidence = useCallback((index: number) => {
    haptic.light();
    setEvidenceUris((prev) => prev.filter((_, i) => i !== index));
  }, [haptic]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    haptic.medium();
    setIsSubmitting(true);

    try {
      const topic = ALL_SUPPORT_TOPICS.find((t) => t.id === selectedTopic)!;
      const ticketId = await createSupportTicketOnApi({
        orderId,
        topicId: topic.id,
        topicLabel: topic.label,
        details: details.trim(),
        evidenceMediaUrls: evidenceUris.length > 0 ? evidenceUris : undefined });

      setIsSubmitting(false);
      setIsSubmitted(true);
      setSubmittedTicketId(ticketId);
      show('Support request submitted. We\'ll review and respond as soon as possible.', 'success');
    } catch (err) {
      setIsSubmitting(false);
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
    }
  }, [canSubmit, haptic, createSupportTicketOnApi, orderId, selectedTopic, details, evidenceUris, show]);

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Order Support" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          {/* Order Context Card */}
          {order && (
            <View>
              <ElevatedSurface variant="surface" style={styles.orderCard}>
                <View style={styles.orderRow}>
                  {order.listingImageUrl && (
                    <CachedImage
                      uri={getListingCoverUri([order.listingImageUrl], '')}
                      style={styles.orderThumb}
                      contentFit="cover"
                    />
                  )}
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderTitle} numberOfLines={2}>{order.listingTitle}</Text>
                    <Text style={styles.orderMeta}>Order #{orderId.slice(-8).toUpperCase()}</Text>
                    <Text style={styles.orderStatus}>{order.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
                  </View>
                </View>
              </ElevatedSurface>
            </View>
          )}

          {/* Existing Open Ticket */}
          {openTicket && !isSubmitted && (
            <View>
              <ElevatedSurface variant="surface" style={styles.existingTicketCard}>
                <View style={styles.existingTicketRow}>
                  <Ionicons name="help-circle-outline" size={22} color={colors.brand} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.existingTicketLabel}>Open support request</Text>
                    <Caption color={colors.textMuted}>{openTicket.topicLabel}</Caption>
                  </View>
                </View>
                <AppButton
                  title="View ticket"
                  variant="secondary"
                  size="sm"
                  onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: openTicket.id })}
                />
              </ElevatedSurface>
            </View>
          )}

          <View>
            <Meta color={colors.textMuted} style={styles.sectionLabel}>REASON</Meta>
            <View style={styles.topicsCard}>
              {availableTopics.map((topic, index) => {
                const isActive = selectedTopic === topic.id;
                const isLast = index === availableTopics.length - 1;
                return (
                  <AnimatedPressable
                    key={topic.id}
                    onPress={() => {
                      haptic.light();
                      setSelectedTopic(topic.id);
                    }}
                    activeOpacity={0.7}
                    scaleValue={0.99}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isActive }}
                    accessibilityLabel={topic.label}
                  >
                    <View style={[styles.topicRow, !isLast && styles.topicRowSeparator, isActive && styles.topicRowActive]}>
                      <View style={styles.topicText}>
                        <Text style={[styles.topicLabel, isActive && styles.topicLabelActive]}>
                          {topic.label}
                        </Text>
                        <Caption
                          color={isActive ? colors.brand : colors.textMuted}
                          numberOfLines={2}
                        >
                          {topic.description}
                        </Caption>
                      </View>
                      {isActive && (
                        <Ionicons name="checkmark" size={20} color={colors.brand} />
                      )}
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          {/* What happens next — contextual guidance after topic selection */}
          {selectedTopic && !isSubmitted && (() => {
            const topic = ALL_SUPPORT_TOPICS.find((t) => t.id === selectedTopic);
            if (!topic) return null;
            const isEscrowHeld = orderStatus === 'paid' || orderStatus === 'shipped' || orderStatus === 'in transit' || orderStatus === 'out for delivery';
            const guidance: Record<string, string> = {
              not_received: 'We\'ll contact the seller to confirm dispatch and tracking. If the item cannot be located, we\'ll work with you on a resolution.',
              not_as_described: 'Provide photos showing the discrepancy. We\'ll compare against the listing and help resolve this with the seller.',
              damaged: 'Attach photos of the damage and original packaging. We\'ll assess the situation and help arrange a resolution.',
              wrong_item: 'Attach photos of the received item. We\'ll review and help coordinate a return or resolution.',
              return: 'We\'ll review your return eligibility and guide you through the next steps.',
              payment_issue: 'We\'ll investigate the payment and billing discrepancy and correct any erroneous charges.',
              other: 'Describe the issue in detail below. Our support team will review and respond.' };
            return (
              <View>
                <View style={styles.guidanceCard}>
                  <View style={styles.guidanceHeader}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.brand} />
                    <Text style={styles.guidanceTitle}>What happens next</Text>
                  </View>
                  <Text style={styles.guidanceBody}>{guidance[topic.id] ?? guidance.other}</Text>
                  {isEscrowHeld && (
                    <View style={styles.escrowNoticeRow}>
                      <Ionicons name="lock-closed" size={12} color={colors.success} />
                      <Text style={styles.escrowNoticeText}>
                        Your funds remain held in escrow while this request is open.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}

          <View>
            <Meta color={colors.textMuted} style={styles.sectionLabel}>DETAILS</Meta>
            <View style={styles.detailsCard}>
              <AppInput
                value={details}
                onChangeText={setDetails}
                placeholder="Describe your issue in detail..."
                multiline
                maxLength={800}
                inputContainerStyle={styles.textArea}
                accessibilityLabel="Support details input"
              />
              <Text style={styles.charCount}>{details.length}/800</Text>
            </View>
          </View>

          {/* Evidence upload — reason-specific. Hidden entirely for reasons
              that don't need photos (no accusatory photo theatre). */}
          {!isSubmitted && showEvidence && evidenceConfig && (
            <View>
              <Meta color={colors.textMuted} style={styles.sectionLabel}>
                {evidenceConfig.needsPhotos ? 'EVIDENCE' : 'EVIDENCE (OPTIONAL)'}
              </Meta>
              <View style={styles.evidenceCard}>
                {evidenceConfig.hint ? (
                  <Text style={styles.evidenceHint}>{evidenceConfig.hint}</Text>
                ) : null}
                {evidenceUris.length > 0 && (
                  <View style={styles.evidenceThumbs}>
                    {evidenceUris.map((uri, index) => (
                      <View key={uri} style={styles.evidenceThumbWrap}>
                        <CachedImage uri={uri} style={styles.evidenceThumb} contentFit="cover" />
                        <Pressable
                          style={styles.evidenceRemoveBtn}
                          onPress={() => handleRemoveEvidence(index)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel="Remove evidence photo"
                        >
                          <Ionicons name="close-circle" size={20} color={colors.textInverse} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                {evidenceUris.length < 3 && (
                  <Pressable
                    style={styles.evidenceAddBtn}
                    onPress={handlePickEvidence}
                    disabled={isUploadingEvidence}
                    accessibilityRole="button"
                    accessibilityLabel="Add evidence photo"
                  >
                    {isUploadingEvidence ? (
                      <ActivityIndicator size="small" color={colors.brand} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={22} color={colors.brand} />
                        <Text style={styles.evidenceAddText}>Add photo ({evidenceUris.length}/3)</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {isSubmitted && submittedTicketId && (
            <View style={styles.timeline}>
              <View style={styles.timelineStep}>
                <View style={styles.timelineMarker}>
                  <View style={styles.timelineCheck}>
                    <Ionicons name="checkmark" size={18} color={colors.surface} />
                  </View>
                </View>
                <View style={styles.timelineStepContent}>
                  <Text style={styles.timelineStepTitle}>Case submitted</Text>
                  <Caption color={colors.textSecondary} style={styles.timelineStepSub}>
                    We'll review your case and respond within 24 hours.
                  </Caption>
                </View>
              </View>

              <View style={styles.timelineConnector} />

              <View style={styles.timelineStep}>
                <View style={styles.timelineMarker}>
                  <View style={styles.timelineDot} />
                </View>
                <View style={styles.timelineStepContent}>
                  <Text style={styles.timelineStepLabel}>Next: Seller response</Text>
                  <Caption color={colors.textMuted} style={styles.timelineStepSub}>
                    The seller has 3 days to respond.
                  </Caption>
                </View>
              </View>

              <View style={styles.timelineActions}>
                <AppButton
                  title="View case details"
                  variant="secondary"
                  size="md"
                  onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: submittedTicketId })}
                />
              </View>
            </View>
          )}

          {!isSubmitted && selectedTopic && (
            <View style={styles.outcomePreview}>
              <Caption color={colors.textMuted} style={styles.outcomePreviewText}>
                Next: {OUTCOME_PREVIEW[selectedTopic] ?? OUTCOME_PREVIEW.other}
              </Caption>
            </View>
          )}

        <View style={styles.footer}>
          {isSubmitted ? (
            <AppButton
              title="Done"
              onPress={() => navigation.goBack()}
              variant="primary"
              size="lg"
              hapticFeedback="medium"
              accessibilityLabel="Close support request"
            />
          ) : (
            <AppButton
              title={isSubmitting ? 'Submitting...' : 'Submit support request'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              variant="primary"
              size="lg"
              style={[!canSubmit && styles.btnDisabled]}
              hapticFeedback="medium"
              accessibilityLabel="Submit support request"
            />
          )}
        </View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    flex: 1 },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.lg },
  sectionLabel: {
    marginLeft: Space.sm,
    letterSpacing: LetterSpacing.caps,
    marginBottom: Space.sm },
  topicsCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Elevation.subtle },
  guidanceCard: {
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.brandSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandBorder,
    gap: Space.xs + 2 },
  guidanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  guidanceTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  guidanceBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.size + 5 },
  escrowNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    marginTop: Space.xs / 2 },
  escrowNoticeText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.success },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    minHeight: 44 },
  topicRowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  topicRowActive: {
    backgroundColor: colors.brandSubtle },
  topicText: {
    flex: 1 },
  topicLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing,
    marginBottom: Space.xs / 2 },
  topicLabelActive: {
    color: colors.brand },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle },
  textArea: {
    minHeight: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 4,
    textAlignVertical: 'top' },
  charCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: Space.xs },
  evidenceHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.size + 5,
    marginBottom: Space.sm },
  outcomePreview: {
    paddingHorizontal: Space.sm },
  outcomePreviewText: {
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  footer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  btnDisabled: {
    opacity: 0.45 },
  timeline: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm },
  timelineMarker: {
    width: 28,
    alignItems: 'center' },
  timelineCheck: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center' },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: colors.border,
    marginTop: Space.sm },
  timelineStepContent: {
    flex: 1,
    paddingTop: Space.xs / 2 },
  timelineStepTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    marginBottom: Space.xs / 2 },
  timelineStepLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary,
    marginBottom: Space.xs / 2 },
  timelineStepSub: {
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  timelineConnector: {
    marginLeft: 14,
    width: StyleSheet.hairlineWidth,
    height: Space.md,
    backgroundColor: colors.border },
  timelineActions: {
    marginTop: Space.lg,
    flexDirection: 'row',
    gap: Space.sm },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  orderThumb: {
    width: Space.xl + Space.xl - 4,
    height: Space.xl + Space.xl - 4,
    borderRadius: Radius.md },
  orderInfo: {
    flex: 1,
    gap: Space.xs / 2 },
  orderTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  orderMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  orderStatus: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand,
    textTransform: 'capitalize' },
  existingTicketCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
    ...Elevation.subtle },
  existingTicketRow: {
    flexDirection: 'row',
    alignItems: 'center' },
  existingTicketLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  evidenceCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle },
  evidenceThumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginBottom: Space.sm },
  evidenceThumbWrap: {
    position: 'relative' },
  evidenceThumb: {
    width: Space.xl + Space.xl + Space.sm,
    height: Space.xl + Space.xl + Space.sm,
    borderRadius: Radius.md },
  evidenceRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.full },
  evidenceAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed',
    borderColor: colors.border },
  evidenceAddText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand } });
}