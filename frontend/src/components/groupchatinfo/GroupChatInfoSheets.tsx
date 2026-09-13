/**
 * GroupChatInfoSheets — bottom-sheet cluster for the group details screen:
 * the shared confirmation sheet, the media source/preset picker, the
 * privacy transparency sheet, the theme picker, the member actions sheet
 * and the member activity ledger.
 *
 * Presentation only — the screen owns all state, resolved labels and
 * navigation wiring so the copy/authority rules stay in the orchestrator.
 * Extracted verbatim from GroupChatInfoScreen.
 */

import React from 'react';
import { ConfirmationSheet } from '../ConfirmationSheet';
import {
  GroupMediaSourceSheet,
  type GroupMediaSource,
} from '../chat/GroupMediaSourceSheet';
import { GroupPrivacySheet } from '../groupchat/GroupPrivacySheet';
import { GroupThemeSheet } from '../groupchat/GroupThemeSheet';
import {
  GroupMemberActionsSheet,
  type GroupMemberActionsTarget,
} from '../groupchat/GroupMemberActionsSheet';
import { GroupMemberActivitySheet } from '../groupchat/GroupMemberActivitySheet';
import { getAestheticPresets } from '../../constants/groupAesthetics';
import type { ChatTheme } from '../../services/chatPreferencesApi';
import type { GroupInfoConfirmSheetState } from '../../hooks/groupchatinfo/types';

export interface GroupChatInfoMediaSheetState {
  visible: boolean;
  target: 'avatar' | 'cover';
}

export interface GroupChatInfoSheetsProps {
  confirmSheet: GroupInfoConfirmSheetState;
  onDismissConfirmSheet: () => void;
  mediaSheet: GroupChatInfoMediaSheetState;
  onCloseMediaSheet: () => void;
  onSelectMediaSource: (source: GroupMediaSource) => void;
  onSelectPreset: (url: string) => void;
  canRemoveMedia: boolean;
  onRemoveMedia: () => void;
  isPrivacySheetVisible: boolean;
  onDismissPrivacySheet: () => void;
  isThemeSheetVisible: boolean;
  onDismissThemeSheet: () => void;
  themes: readonly ChatTheme[];
  selectedTheme: ChatTheme;
  themeSaveError: string | null;
  onSelectTheme: (theme: ChatTheme) => void;
  selectedMember: GroupMemberActionsTarget | null;
  onDismissMemberSheet: () => void;
  canManageMembers: boolean;
  isSelfMember: boolean;
  memberAdminActionLabel: string;
  memberRemoveLabel: string;
  memberMessageLabel: string;
  onViewMemberProfile: (userId: string) => void;
  onMessageMember: (member: GroupMemberActionsTarget) => void;
  onToggleMemberAdmin: (member: GroupMemberActionsTarget) => void;
  onRemoveMember: (member: GroupMemberActionsTarget) => void;
  isActivitySheetVisible: boolean;
  onDismissActivitySheet: () => void;
  conversationId: string;
  conversationCreatedAt?: string | null;
  memberLabel: (userId: string) => string;
  memberRole: (userId: string) => 'owner' | 'admin' | 'member' | undefined;
  activityTitle: string;
  activitySubtitle: string;
}

export function GroupChatInfoSheets({
  confirmSheet,
  onDismissConfirmSheet,
  mediaSheet,
  onCloseMediaSheet,
  onSelectMediaSource,
  onSelectPreset,
  canRemoveMedia,
  onRemoveMedia,
  isPrivacySheetVisible,
  onDismissPrivacySheet,
  isThemeSheetVisible,
  onDismissThemeSheet,
  themes,
  selectedTheme,
  themeSaveError,
  onSelectTheme,
  selectedMember,
  onDismissMemberSheet,
  canManageMembers,
  isSelfMember,
  memberAdminActionLabel,
  memberRemoveLabel,
  memberMessageLabel,
  onViewMemberProfile,
  onMessageMember,
  onToggleMemberAdmin,
  onRemoveMember,
  isActivitySheetVisible,
  onDismissActivitySheet,
  conversationId,
  conversationCreatedAt,
  memberLabel,
  memberRole,
  activityTitle,
  activitySubtitle,
}: GroupChatInfoSheetsProps) {
  return (
    <>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={onDismissConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />

      <GroupMediaSourceSheet
        visible={mediaSheet.visible}
        onClose={onCloseMediaSheet}
        onSelect={onSelectMediaSource}
        title={mediaSheet.target === 'avatar' ? 'Group profile photo' : 'Cover banner'}
        presets={getAestheticPresets(mediaSheet.target)}
        onSelectPreset={onSelectPreset}
        canRemove={canRemoveMedia}
        onRemove={onRemoveMedia}
      />

      <GroupPrivacySheet
        visible={isPrivacySheetVisible}
        onDismiss={onDismissPrivacySheet}
      />

      <GroupThemeSheet
        visible={isThemeSheetVisible}
        onDismiss={onDismissThemeSheet}
        themes={themes}
        selected={selectedTheme}
        error={themeSaveError}
        onSelect={onSelectTheme}
      />

      <GroupMemberActionsSheet
        member={selectedMember}
        onDismiss={onDismissMemberSheet}
        canManageMembers={canManageMembers}
        isSelf={isSelfMember}
        adminActionLabel={memberAdminActionLabel}
        removeLabel={memberRemoveLabel}
        messageLabel={memberMessageLabel}
        onViewProfile={onViewMemberProfile}
        onMessage={onMessageMember}
        onToggleAdmin={onToggleMemberAdmin}
        onRemove={onRemoveMember}
      />

      <GroupMemberActivitySheet
        visible={isActivitySheetVisible}
        onDismiss={onDismissActivitySheet}
        conversationId={conversationId}
        createdAt={conversationCreatedAt}
        memberLabel={memberLabel}
        memberRole={memberRole}
        title={activityTitle}
        subtitle={activitySubtitle}
      />
    </>
  );
}
