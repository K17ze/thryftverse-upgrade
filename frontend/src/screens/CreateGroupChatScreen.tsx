/**
 * CreateGroupChatScreen — thin orchestrator for the two-stage
 * create-group flow (member select → group details). All state, search,
 * selection, media and submit logic lives in useCreateGroupChat; the
 * stage UIs live in components/groupchat.
 */

import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useConnectivity } from '../hooks/useConnectivity';
import { useCreateGroupChat } from '../hooks/groupchat';
import { GroupMemberSelectStage } from '../components/groupchat/GroupMemberSelectStage';
import { GroupDetailsStage } from '../components/groupchat/GroupDetailsStage';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroupChat'>;

export default function CreateGroupChatScreen({ navigation, route }: Props) {
  const { isOffline } = useConnectivity();
  const group = useCreateGroupChat({ navigation, route });

  if (group.stage === 'details') {
    return (
      <GroupDetailsStage
        title={group.title}
        onTitleChange={group.onTitleChange}
        description={group.description}
        onDescriptionChange={group.onDescriptionChange}
        createError={group.createError}
        onRetryCreate={group.onRetryCreate}
        isCreating={group.isCreating}
        isUploadingPhoto={group.media.isUploadingPhoto}
        isUploadingCover={group.media.isUploadingCover}
        avatarDisplayUri={group.media.avatarDisplayUri}
        coverDisplayUri={group.media.coverDisplayUri}
        onPickGroupPhoto={group.media.pickGroupPhoto}
        onPickCoverPhoto={group.media.pickCoverPhoto}
        onRemoveGroupPhoto={group.media.removeGroupPhoto}
        onRemoveCoverPhoto={group.media.removeCoverPhoto}
        mosaicMembers={group.mosaicMembers}
        mosaicGroupId={group.idempotencyKey}
        avatarUploadFailed={group.media.groupMedia.avatar.status === 'failed'}
        avatarUploadError={group.media.groupMedia.avatar.error}
        onRetryAvatarUpload={() => void group.media.groupMedia.retryAvatar()}
        selectedIds={group.selection.selectedIds}
        selectedUsers={group.selection.selectedUsers}
        onCreateGroup={group.onCreateGroup}
        onBack={group.onBackToSelect}
        mediaSheetVisible={group.media.mediaSourceSheet.visible}
        mediaSheetTarget={group.media.mediaSourceSheet.target}
        onCloseMediaSheet={group.media.closeMediaSourceSheet}
        onSelectMediaSource={group.media.selectMediaSource}
        onSelectPreset={group.media.selectPreset}
      />
    );
  }

  return (
    <GroupMemberSelectStage
      searchQuery={group.search.searchQuery}
      onSearchQueryChange={group.search.setSearchQuery}
      selectedIds={group.selection.selectedIds}
      selectedUsers={group.selection.selectedUsers}
      onToggleMember={group.selection.toggleMember}
      searchError={group.search.searchError}
      isOffline={isOffline}
      onRetrySearch={group.onRetrySearch}
      showRecents={group.showRecents}
      recentUsers={group.recentUsers}
      suggestedUsers={group.suggestedUsers}
      isSearching={group.search.isSearching}
      hasSearched={group.search.hasSearched}
      results={group.filteredResults}
      onContinue={group.onContinueToDetails}
      onBack={group.onBack}
    />
  );
}
