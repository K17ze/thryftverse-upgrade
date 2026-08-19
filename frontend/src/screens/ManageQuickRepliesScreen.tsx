import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore, type QuickReply } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { useHaptic } from '../hooks/useHaptic';

type Props = NativeStackScreenProps<RootStackParamList, 'ManageQuickReplies'>;

const MAX_TITLE_LEN = 40;
const MAX_MSG_LEN = 200;

export default function ManageQuickRepliesScreen({ navigation, route }: Props) {
  const { role } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();

  const replies = useStore((s) => (role === 'seller' ? s.sellerQuickReplies : s.buyerQuickReplies));
  const addReply = useStore((s) => (role === 'seller' ? s.addSellerQuickReply : s.addBuyerQuickReply));
  const updateReply = useStore((s) => (role === 'seller' ? s.updateSellerQuickReply : s.updateBuyerQuickReply));
  const removeReply = useStore((s) => (role === 'seller' ? s.removeSellerQuickReply : s.removeBuyerQuickReply));

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const openAdd = () => {
    setEditingIndex(null);
    setDraftTitle('');
    setDraftMessage('');
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    const reply = replies[index];
    if (!reply) return;
    setEditingIndex(index);
    setDraftTitle(reply.title);
    setDraftMessage(reply.message);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDraftTitle('');
    setDraftMessage('');
    setEditingIndex(null);
  };

  const trimmedTitle = draftTitle.trim();
  const trimmedMessage = draftMessage.trim();
  const validationError =
    trimmedTitle.length === 0
      ? 'Add a shortcut title.'
      : trimmedTitle.length > MAX_TITLE_LEN
      ? `Keep the title under ${MAX_TITLE_LEN} characters.`
      : trimmedMessage.length === 0
      ? 'Reply message cannot be empty.'
      : trimmedMessage.length > MAX_MSG_LEN
      ? `Keep the message under ${MAX_MSG_LEN} characters.`
      : null;

  const handleSave = () => {
    if (validationError) {
      haptic.light();
      return;
    }
    setSubmitting(true);
    try {
      const reply: QuickReply = {
        id: editingIndex !== null ? (replies[editingIndex]?.id ?? `qr-${Date.now()}`) : `qr-${Date.now()}`,
        title: trimmedTitle,
        message: trimmedMessage,
      };
      if (editingIndex !== null) {
        updateReply(editingIndex, reply);
        show('Quick reply updated', 'success');
      } else {
        addReply(reply);
        show('Quick reply added', 'success');
      }
      haptic.medium();
      closeModal();
    } catch {
      show('Could not save this reply. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (index: number) => {
    Alert.alert(
      'Delete quick reply?',
      'This reply will be removed from your list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeReply(index);
            haptic.medium();
            show('Quick reply deleted', 'info');
          },
        },
      ]
    );
  };

  const title = role === 'seller' ? 'Seller quick replies' : 'Buyer quick replies';
  const subtitle =
    role === 'seller'
      ? 'Reusable replies for buyer questions'
      : 'Reusable messages for sellers';

  const modalTitle = editingIndex !== null ? 'Edit reply' : 'New quick reply';

  return (
    <>
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={title}
          subtitle={subtitle}
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={openAdd}
              scaleValue={0.9}
              hapticFeedback="medium"
              accessibilityLabel="Add quick reply"
              accessibilityRole="button"
              style={styles.addHeaderBtn}
            >
              <Ionicons name="add" size={Control.icon} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
    >
      {replies.length === 0 ? (
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title="No quick replies yet — add one to save time"
          subtitle="Save reusable replies for common buyer questions and reply faster in chat."
          ctaLabel="Add your first reply"
          onCtaPress={openAdd}
        />
      ) : (
        <View style={styles.list}>
          <ScrollView
            horizontal={false}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {replies.map((reply, index) => (
              <View key={`reply-${index}`}>
                <View style={styles.replyRow}>
                  <Pressable
                    onPress={() => openEdit(index)}
                    style={styles.replyBody}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit reply ${index + 1}: ${reply.title}`}
                  >
                    <Text style={styles.replyTitle} numberOfLines={1}>{reply.title}</Text>
                    <Text style={styles.replyText} numberOfLines={2}>{reply.message}</Text>
                  </Pressable>
                  <AnimatedPressable
                    onPress={() => openEdit(index)}
                    scaleValue={0.9}
                    hapticFeedback="light"
                    accessibilityLabel={`Edit reply ${index + 1}`}
                    accessibilityRole="button"
                    style={styles.iconBtn}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => handleDelete(index)}
                    scaleValue={0.9}
                    hapticFeedback="medium"
                    accessibilityLabel={`Delete reply ${index + 1}`}
                    accessibilityRole="button"
                    style={styles.iconBtn}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </AnimatedPressable>
                </View>
                {index < replies.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </FlagshipScreen>

    {/* Add / Edit modal */}

    <Modal
      visible={modalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeModal}
    >
      <Pressable style={styles.modalOverlay} onPress={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalAvoid}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <AnimatedPressable
                onPress={closeModal}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityLabel="Close editor"
                accessibilityRole="button"
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </AnimatedPressable>
            </View>

            <Text style={styles.fieldLabel}>SHORTCUT TITLE</Text>
            <TextInput
              style={[styles.field, styles.fieldSingle, validationError && styles.fieldError]}
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="e.g. Still available"
              placeholderTextColor={colors.textMuted}
              autoFocus
              maxLength={MAX_TITLE_LEN}
              accessibilityLabel="Quick reply shortcut title"
            />
            <View style={styles.fieldMetaRow}>
              {validationError && trimmedTitle.length === 0 ? (
                <Text style={styles.fieldErrorText}>{validationError}</Text>
              ) : (
                <Text style={styles.fieldHint}>Shown as the chip label in chat.</Text>
              )}
              <Text style={styles.charCount}>{draftTitle.length}/{MAX_TITLE_LEN}</Text>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: Space.md }]}>MESSAGE</Text>
            <TextInput
              style={[styles.field, validationError && styles.fieldError]}
              value={draftMessage}
              onChangeText={setDraftMessage}
              placeholder="Type a reusable reply..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_MSG_LEN}
              textAlignVertical="top"
              accessibilityLabel="Quick reply message"
            />
            <View style={styles.fieldMetaRow}>
              {validationError && trimmedTitle.length > 0 ? (
                <Text style={styles.fieldErrorText}>{validationError}</Text>
              ) : (
                <Text style={styles.fieldHint}>Inserted into the composer when tapped.</Text>
              )}
              <Text style={styles.charCount}>{draftMessage.length}/{MAX_MSG_LEN}</Text>
            </View>

            <View style={styles.modalActions}>
              <AnimatedPressable
                onPress={closeModal}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityLabel="Cancel"
                accessibilityRole="button"
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={handleSave}
                scaleValue={0.96}
                hapticFeedback="medium"
                disabled={!!validationError || submitting}
                accessibilityLabel={editingIndex !== null ? 'Save changes' : 'Add reply'}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!validationError || submitting }}
                style={[styles.modalSaveBtn, (!!validationError || submitting) && styles.modalSaveDisabled]}
              >
                <Text style={styles.modalSaveText}>
                  {editingIndex !== null ? 'Save' : 'Add'}
                </Text>
              </AnimatedPressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    addHeaderBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    replyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      paddingLeft: Space.md,
      paddingRight: Space.sm,
      minHeight: Control.hit + Space.sm,
      gap: Space.xs,
    },
    replyBody: {
      flex: 1,
    },
    replyTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      lineHeight: Type.bodyStrong.lineHeight,
      marginBottom: 2,
    },
    replyText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.lineHeight,
    },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: Space.md,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalAvoid: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      padding: Space.lg,
      paddingBottom: Space.xxl,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.md,
    },
    modalTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    modalCloseBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      letterSpacing: 0.5,
      marginBottom: Space.xs + 2,
    },
    field: {
      minHeight: Space.xxl * 2,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    fieldSingle: {
      minHeight: Control.hit,
    },
    fieldError: {
      borderColor: colors.danger,
    },
    fieldMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Space.xs,
      gap: Space.sm,
    },
    fieldHint: {
      flex: 1,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    fieldErrorText: {
      flex: 1,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.danger,
    },
    charCount: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    modalActions: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.lg,
    },
    modalCancelBtn: {
      flex: 1,
      minHeight: Control.hit,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    modalSaveBtn: {
      flex: 1,
      minHeight: Control.hit,
      borderRadius: Radius.full,
      backgroundColor: colors.textPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSaveDisabled: {
      opacity: 0.4,
    },
    modalSaveText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textInverse,
    },
  });
}
