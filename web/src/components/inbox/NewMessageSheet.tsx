'use client';

/**
 * NewMessageSheet — port of the mobile NewMessageScreen + CreateGroupChat
 * two-stage flow, folded into one sheet:
 *
 *   contacts → tap a person to open/create the DM; "Start group chat"
 *              quick action enters member select
 *   members  → search + chip rail + checkable rows, ≥2 members to continue
 *   details  → live mosaic preview, group name (required), optional
 *              description (280), member list, "Create group" CTA
 *
 * Creation goes through useCreateConversation — the query cache doubles as
 * the session store (same pattern as collections / support tickets).
 */

import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useNewMessageWorkflow } from './newMessage/useNewMessageWorkflow';
import { NewMessageContactsStage } from './newMessage/NewMessageContactsStage';
import { NewMessageMembersStage } from './newMessage/NewMessageMembersStage';
import { NewMessageDetailsStage } from './newMessage/NewMessageDetailsStage';

interface NewMessageSheetProps {
  open: boolean;
  onClose: () => void;
}

export function NewMessageSheet({ open, onClose }: NewMessageSheetProps) {
  const w = useNewMessageWorkflow(open, onClose);

  return (
    <Sheet open={open} onClose={onClose} title={w.sheetTitle} maxWidth={440}>
      <div className="flex h-[min(70dvh,560px)] flex-col">
        {/* Stage back navigation — the sheet header owns title/close only. */}
        {w.stage !== 'contacts' ? (
          <div className="flex shrink-0 items-center px-1 pt-1">
            <IconButton
              name="back"
              aria-label={w.stage === 'members' ? 'Back to contacts' : 'Back to member selection'}
              onClick={() => w.setStage(w.stage === 'details' ? 'members' : 'contacts')}
            />
          </div>
        ) : null}

        {w.stage === 'contacts' ? (
          <NewMessageContactsStage
            query={w.query}
            searchQuery={w.q}
            onSearchChange={w.setQ}
            searchRef={w.searchRef}
            onStartGroup={() => w.setStage('members')}
            recentContacts={w.recentContacts}
            existingDmIds={w.existingDmIds}
            directoryUsers={w.directoryUsers}
            directoryLoading={w.directoryLoading}
            directoryError={w.directoryError}
            onRetryDirectory={() => void w.refetchDirectory()}
            onOpenDm={w.openDm}
            isCreating={w.isCreating}
          />
        ) : w.stage === 'members' ? (
          <NewMessageMembersStage
            query={w.query}
            searchQuery={w.q}
            onSearchChange={w.setQ}
            searchRef={w.searchRef}
            selected={w.selected}
            selectedIds={w.selectedIds}
            onToggleMember={w.toggleMember}
            directoryUsers={w.directoryUsers}
            directoryLoading={w.directoryLoading}
            directoryError={w.directoryError}
            onRetryDirectory={() => void w.refetchDirectory()}
            onContinue={() => w.setStage('details')}
          />
        ) : (
          <NewMessageDetailsStage
            selected={w.selected}
            groupTitle={w.groupTitle}
            onGroupTitleChange={w.setGroupTitle}
            description={w.description}
            onDescriptionChange={w.setDescription}
            onToggleMember={w.toggleMember}
            user={w.user}
            isCreating={w.isCreating}
            onCreateGroup={w.createGroup}
          />
        )}
      </div>
    </Sheet>
  );
}
