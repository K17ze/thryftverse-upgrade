import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useAppTheme } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useConnectivity } from '../hooks/useConnectivity';
import { Caption } from '../components/ui/Text';
import {
  useGroupMembersActions,
  useGroupMembersAddFlow,
  useGroupMembersData,
  useGroupMembersRealtime } from '../hooks/groupmembers';
import { GroupMembersSearchRow } from '../components/groupmembers/GroupMembersSearchRow';
import { GroupMembersAddRow } from '../components/groupmembers/GroupMembersAddRow';
import { GroupMembersAddSection } from '../components/groupmembers/GroupMembersAddSection';
import { GroupMembersList } from '../components/groupmembers/GroupMembersList';
import { GroupMembersSheets } from '../components/groupmembers/GroupMembersSheets';
import type { GroupMemberView } from '../components/groupmembers/groupMembersViewModels';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupMembers'>;

export default function GroupMembersScreen({ navigation, route }: Props) {
  const { conversationId } = route.params ?? {};
  const { colors } = useAppTheme();
  const { isOffline } = useConnectivity();

  // Data: conversation, participant lookups, viewer role/capabilities,
  // member view-models, and the member-search filter.
  const {
    conversation,
    currentUser,
    canManage,
    canAddMembers,
    members,
    searchQuery,
    setSearchQuery,
    filteredMembers,
  } = useGroupMembersData(conversationId);

  // Realtime membership events: reconcile the store and reset to Inbox when
  // the removed/left member is the viewer.
  useGroupMembersRealtime(conversationId, currentUser?.id, useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Inbox' } }] });
  }, [navigation]));

  // Inline add-members flow: search, multi-select, optimistic add.
  const addFlow = useGroupMembersAddFlow(conversationId, conversation, currentUser?.id);

  // Member management + leave-group actions and their sheets.
  const {
    removingId,
    isLeaving,
    memberActionMenu,
    dismissMemberActionMenu,
    confirmSheet,
    dismissConfirmSheet,
    handleMemberLongPress,
    handleRemoveMember,
    handleLeaveGroup,
  } = useGroupMembersActions({
    conversationId,
    conversation,
    currentUserId: currentUser?.id,
    canManage,
    onLeftGroup: useCallback(() => {
      navigation.navigate('MainTabs', { screen: 'Inbox' });
    }, [navigation]),
  });

  const handleMemberPress = useCallback(
    (member: GroupMemberView) => openProfile(navigation, member.id, currentUser?.id),
    [navigation, currentUser?.id]
  );

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Members" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen header={<FlagshipHeader title="Members" subtitle={`${members.length} total`} onBack={() => navigation.goBack()} />} scrollEnabled={false}>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <GroupMembersSearchRow value={searchQuery} onChangeText={setSearchQuery} />

        {canAddMembers && !addFlow.showAddMembers && (
          <GroupMembersAddRow onPress={addFlow.openAddMembers} />
        )}

        {addFlow.showAddMembers && (
          <GroupMembersAddSection
            addQuery={addFlow.addQuery}
            onAddQueryChange={addFlow.setAddQuery}
            onCancel={addFlow.cancelAddMembers}
            isSearching={addFlow.isSearching}
            searchError={addFlow.searchError}
            isOffline={isOffline}
            hasSearched={addFlow.hasSearched}
            searchResults={addFlow.searchResults}
            selectedToAdd={addFlow.selectedToAdd}
            onToggleSelect={addFlow.toggleSelectToAdd}
            isAdding={addFlow.isAdding}
            onConfirm={addFlow.handleAddMembers}
          />
        )}

        <GroupMembersList
          members={filteredMembers}
          canManage={canManage}
          removingId={removingId}
          isLeaving={isLeaving}
          onMemberPress={handleMemberPress}
          onMemberLongPress={handleMemberLongPress}
          onLeaveGroup={handleLeaveGroup}
          onRemoveMember={handleRemoveMember}
        />
      </ScrollView>
      <GroupMembersSheets
        confirmSheet={confirmSheet}
        onDismissConfirm={dismissConfirmSheet}
        memberActionMenu={memberActionMenu}
        onDismissActionMenu={dismissMemberActionMenu}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center' },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.md } });
