'use client';

/**
 * /seller-hub/quick-replies — the mobile ManageQuickRepliesScreen's web
 * counterpart. Sellers keep canned responses here; the inbox composer
 * inserts them from the bolt menu. Live + signed in, the list reads and
 * writes /chat/quick-replies; fixture mode and guests keep the
 * device-local store — the footer says which truth applies.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { INPUT_CLASS, SellField } from '@/components/sell/SellField';
import { BackBar } from '@/components/profile/BackBar';
import { useToast } from '@/components/ui/Toast';
import { useQuickRepliesData, useQuickReplyMutations } from '@/lib/hooks/chat-queries';
import type { QuickReply } from '@/lib/store/quickReplies';

export default function QuickRepliesPage() {
  const toast = useToast();
  const { replies, isLoading, isError, refetch, serverBacked } = useQuickRepliesData();
  const mutations = useQuickReplyMutations();

  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuickReply | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const current = editor?.id ? replies.find((r) => r.id === editor.id) : null;

  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-3xl">
      <BackBar />
      <div className="px-4 pb-24 pt-4 sm:px-0">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-screen-title text-text-primary">Quick replies</h1>
            <p className="mt-1 text-body text-text-secondary">
              Canned responses you can drop into buyer chats from the bolt menu.
            </p>
          </div>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditor({ id: null })}>
            New reply
          </Button>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3" aria-busy aria-label="Loading quick replies">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load quick replies"
            subtitle="Your saved replies didn't come through — check your connection and try again."
            actionLabel="Retry"
            onAction={refetch}
          />
        ) : replies.length === 0 ? (
          <EmptyState
            icon="zap"
            title="No quick replies"
            subtitle="Save the answers you type most — dispatch times, firm pricing, measurement requests."
            actionLabel="New reply"
            onAction={() => setEditor({ id: null })}
          />
        ) : (
          <ul className="mt-6 divide-y divide-border-subtle">
            {replies.map((r) => (
              <li key={r.id} className="flex items-start gap-2 py-3.5">
                <button
                  type="button"
                  onClick={() => setEditor({ id: r.id })}
                  className="pressable min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-text-primary"
                >
                  <p className="clamp-1 text-body font-semibold text-text-primary">{r.title}</p>
                  <p className="clamp-2 mt-0.5 text-body text-text-secondary">{r.message}</p>
                </button>
                {/* Always visible — touch has no hover; opacity-on-hover
                    would hide the only delete affordance. */}
                <IconButton
                  name="trash"
                  aria-label={`Delete "${r.title}"`}
                  onClick={() => setConfirmDelete(r)}
                  className="shrink-0 text-text-muted hover:text-danger-text"
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-meta text-text-muted">
          {serverBacked
            ? 'Saved to your account — they appear in every chat you open.'
            : 'Saved on this device — not synced to your account.'}
        </p>
      </div>

      <ReplySheet
        open={editor !== null}
        editing={current}
        onClose={() => setEditor(null)}
        onSave={async (id, r) => {
          // A failed write throws — the sheet stays open with the draft
          // intact and the error toast lands (never a silent swallow).
          if (id) {
            await mutations.update(id, r);
            toast.show('Reply updated', 'success');
          } else {
            await mutations.add(r);
            toast.show('Reply saved', 'success');
          }
          setEditor(null);
        }}
      />

      <Sheet
        open={confirmDelete !== null}
        onClose={() => {
          if (!deleteBusy) setConfirmDelete(null);
        }}
        title="Delete reply"
      >
        {confirmDelete ? (
          <div className="px-4 pb-6 pt-1">
            <p className="text-body text-text-secondary">
              Delete &ldquo;{confirmDelete.title}&rdquo;? You can&rsquo;t undo this.
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                disabled={deleteBusy}
                onClick={async () => {
                  const target = confirmDelete;
                  setDeleteBusy(true);
                  try {
                    await mutations.remove(target.id);
                    setConfirmDelete(null);
                    toast.show('Reply deleted', 'info');
                  } catch {
                    toast.show("Couldn't delete the reply — try again", 'error');
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </Button>
              <Button
                variant="secondary"
                disabled={deleteBusy}
                onClick={() => setConfirmDelete(null)}
              >
                Keep
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function ReplySheet({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: QuickReply | null | undefined;
  onClose: () => void;
  onSave: (id: string | null, r: { title: string; message: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);

  // Reset whenever the sheet opens for a different reply.
  const [seededFor, setSeededFor] = useState<string | null | 'closed'>(null);
  const openKey = open ? (editing?.id ?? 'new') : 'closed';
  if (openKey !== seededFor) {
    setSeededFor(openKey);
    setTitle(editing?.title ?? '');
    setMessage(editing?.message ?? '');
    setTouched(false);
  }

  // Mobile grammar: title 40, message 200 — the store the inbox composer
  // inserts from treats these as the caps, so they gate Save here too.
  const titleError = !title.trim()
    ? 'Give this reply a title'
    : title.trim().length > 40
      ? 'Keep the title under 40 characters.'
      : null;
  const messageError = !message.trim()
    ? 'Write the message buyers receive'
    : message.trim().length > 200
      ? 'Keep the message under 200 characters.'
      : null;
  const valid = !titleError && !messageError;

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit reply' : 'New quick reply'}>
      <div className="space-y-5 px-4 pb-6 pt-1">
        <SellField
          label="Shortcut title"
          id="qr-title"
          required
          done={!titleError && title.trim().length > 0}
          error={touched && titleError ? titleError : undefined}
          hint={!(touched && titleError) ? `Shown as the chip label in chat — ${title.length}/40` : undefined}
        >
          <input
            id="qr-title"
            className={INPUT_CLASS}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Dispatch time"
            maxLength={40}
            aria-invalid={Boolean(touched && titleError)}
            aria-describedby={touched && titleError ? 'qr-title-error' : undefined}
          />
        </SellField>
        <SellField
          label="Message"
          id="qr-message"
          required
          done={!messageError && message.trim().length > 0}
          error={touched && messageError ? messageError : undefined}
          hint={!(touched && messageError) ? `Inserted into the composer when tapped — ${message.length}/200` : undefined}
        >
          <textarea
            id="qr-message"
            className={`${INPUT_CLASS} h-auto resize-none py-2.5`}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Thanks for your order! I dispatch within…"
            maxLength={200}
            aria-invalid={Boolean(touched && messageError)}
            aria-describedby={touched && messageError ? 'qr-message-error' : undefined}
          />
        </SellField>
        <Button
          variant="primary"
          className="w-full"
          disabled={!valid}
          onClick={() => onSave(editing?.id ?? null, { title: title.trim(), message: message.trim() })}
        >
          {editing ? 'Save changes' : 'Save reply'}
        </Button>
      </div>
    </Sheet>
  );
}
