/**
 * useGroupInviteLinks — invite-link state and actions for the group
 * details screen: the locally created link, the active link fetched from
 * the server, and the generate / revoke / copy / share / quick-share
 * actions (with their toasts and haptics preserved verbatim).
 * Extracted verbatim from GroupChatInfoScreen.
 */

import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import {
  createGroupInviteLinkOnApi,
  fetchGroupInviteLinksOnApi,
  revokeGroupInviteLinkOnApi,
  type GroupInviteLink,
} from '../../services/chatApi';
import { parseApiError } from '../../lib/apiClient';
import type { GroupInfoConfirmSheetSetter } from './types';

export function useGroupInviteLinks({
  conversationId,
  canAddMembers,
  setConfirmSheet,
}: {
  conversationId: string;
  canAddMembers: boolean;
  setConfirmSheet: GroupInfoConfirmSheetSetter;
}) {
  const { show } = useToast();
  const haptic = useHaptic();

  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<GroupInviteLink | null>(null);
  const [activeInviteSummary, setActiveInviteSummary] = useState<GroupInviteLink | null>(null);
  const displayedInviteSummary = inviteLink ?? activeInviteSummary;

  useEffect(() => {
    if (!canAddMembers) return;
    fetchGroupInviteLinksOnApi(conversationId)
      .then((links) =>
        setActiveInviteSummary(links.find((link) => !link.isExpired && !link.isRevoked) ?? null)
      )
      .catch(() => setActiveInviteSummary(null));
  }, [canAddMembers, conversationId]);

  const generateInviteLink = async () => {
    haptic.light();
    setIsGeneratingInvite(true);
    try {
      const link = await createGroupInviteLinkOnApi(conversationId, {
        expiresInHours: 72,
      });
      setInviteLink(link);
      setActiveInviteSummary(link);
      show('Invite link created', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not create invite link. Try again.').message, 'error');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const revokeInviteLink = () => {
    const link = inviteLink ?? activeInviteSummary;
    if (!link?.id) return;
    setConfirmSheet({
      visible: true,
      title: 'Revoke invite link?',
      message: 'Anyone using this link will no longer be able to join with it.',
      confirmLabel: 'Revoke link',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((state) => ({ ...state, visible: false }));
        try {
          await revokeGroupInviteLinkOnApi(conversationId, link.id);
          setInviteLink(null);
          setActiveInviteSummary(null);
          show('Invite link revoked', 'info');
        } catch (error) {
          show(parseApiError(error, 'Could not revoke invite link.').message, 'error');
        }
      },
    });
  };

  const copyInviteLink = async () => {
    const link = inviteLink ?? activeInviteSummary;
    if (!link) return;
    haptic.light();
    try {
      await Clipboard.setStringAsync(link.inviteLink);
      show('Invite link copied', 'success');
    } catch {
      show('Could not copy link. Long-press to copy manually.', 'error');
    }
  };

  const shareInviteLink = async () => {
    const link = inviteLink ?? activeInviteSummary;
    if (!link) return;
    haptic.light();
    try {
      await Share.share({ message: link.inviteLink });
    } catch {
      // user cancelled
    }
  };

  const shareGroupInvite = async (groupTitle?: string) => {
    haptic.light();
    try {
      if (displayedInviteSummary) {
        await Share.share({
          message: `Join ${groupTitle || 'our group'} on ThryftVerse: ${displayedInviteSummary.inviteLink}`,
        });
      } else {
        await Share.share({ message: `Join ${groupTitle || 'our group'} on ThryftVerse!` });
      }
    } catch {
      // user cancelled
    }
  };

  return {
    displayedInviteSummary,
    isGeneratingInvite,
    generateInviteLink,
    revokeInviteLink,
    copyInviteLink,
    shareInviteLink,
    shareGroupInvite,
  };
}
