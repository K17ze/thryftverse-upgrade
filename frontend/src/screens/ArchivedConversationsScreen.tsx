import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { ConversationListSkeleton } from '../components/SkeletonLoader';
import { ConversationManagementRow } from '../components/chat/ConversationManagementRow';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import type { Conversation } from '../domain';
import { deleteConversationOnApi, unarchiveConversationOnApi } from '../services/chatApi';
import { useAppTranslation } from '../i18n/useAppTranslation';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function ArchivedConversationsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const conversations = useStore((s) => s.conversations);
  const conversationsLoaded = useStore((s) => s.conversationsLoaded);
  const archivedIds = useStore((s) => s.archivedConversationIds);
  const toggleArchived = useStore((s) => s.toggleArchivedConversation);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const currentUser = useStore((s) => s.currentUser);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const archivedConversations = useMemo(() => {
    return conversations.filter((c) => archivedIds.includes(c.id));
  }, [conversations, archivedIds]);

  const handleRestore = async (id: string) => {
    try {
      await unarchiveConversationOnApi(id);
      toggleArchived(id);
      show(t('archived.restored'), 'success');
    } catch {
      show(t('archived.restoreError'), 'error');
    }
  };

  const handleDelete = (id: string, title: string) => {
    setConfirmSheet({
      visible: true,
      title: t('archived.removeConfirmationTitle'),
      message: t('archived.removeConfirmationMessage', { title }),
      confirmLabel: t('common.remove'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        try {
          await deleteConversationOnApi(id, 'me');
          deleteConversation(id);
          show(t('archived.removed'), 'info');
        } catch {
          show(t('archived.removeError'), 'error');
        }
      } });
  };

  const handleClearAll = () => {
    if (archivedConversations.length === 0) return;
    setConfirmSheet({
      visible: true,
      title: t('archived.clearAllConfirmationTitle'),
      message: t('archived.clearAllConfirmationMessage'),
      confirmLabel: t('common.clearAll'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        let failedCount = 0;
        await Promise.all(
          archivedConversations.map(async (c) => {
            try {
              await deleteConversationOnApi(c.id, 'me');
              deleteConversation(c.id);
            } catch {
              failedCount++;
            }
          })
        );
        if (failedCount > 0) {
          show(t('archived.clearError', { deleted: archivedConversations.length - failedCount, failed: failedCount }), 'error');
        } else {
          show(t('archived.cleared'), 'info');
        }
      } });
  };

  const renderItem = useCallback(
    ({ item: convo, index }: { item: Conversation; index: number }) => {
      return (
        <ConversationManagementRow
          conversation={convo}
          currentUserId={currentUser?.id}
          onOpen={() => navigation.navigate('Chat', { conversationId: convo.id })}
          actionIcon="arrow-undo-outline"
          actionLabel={t('common.restore')}
          onAction={() => handleRestore(convo.id)}
          secondaryActionIcon="trash-outline"
          secondaryActionLabel="Delete"
          onSecondaryAction={() =>
            handleDelete(
              convo.id,
              convo.type === 'group'
                ? convo.title || 'Group conversation'
                : convo.participantProfiles?.find(
                    (profile) => profile.id !== currentUser?.id && profile.id !== 'me'
                  )?.displayName ||
                  convo.participantProfiles?.find(
                    (profile) => profile.id !== currentUser?.id && profile.id !== 'me'
                  )?.username ||
                  'Conversation'
            )
          }
          secondaryDestructive
          isLast={index === archivedConversations.length - 1}
        />
      );
    },
    [navigation, currentUser, handleRestore, handleDelete, archivedConversations]
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('archived.title')}
          subtitle={t('archived.subtitle')}
          onBack={() => navigation.goBack()}
          rightAction={
            archivedConversations.length > 0 ? (
              <AnimatedPressable
                onPress={handleClearAll}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                hapticFeedback="medium"
                accessibilityLabel={t('archived.clearAllConversations')}
                accessibilityRole="button"
              >
                <Text style={styles.clearAllBtn}>{t('common.clearAll')}</Text>
              </AnimatedPressable>
            ) : undefined
          }
        />
      }
    >
      {!conversationsLoaded ? (
        <View style={styles.skeletonWrap}>
          <ConversationListSkeleton count={5} />
        </View>
      ) : archivedConversations.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title={t('archived.noArchived')}
          subtitle={t('archived.noArchivedSubtitle')}
          ctaLabel="Browse conversations"
          onCtaPress={() => navigation.goBack()}
        />
      ) : (
        <FlashList
          data={archivedConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
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
    skeletonWrap: {
      paddingTop: Space.sm },
    listContent: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    clearAllBtn: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
