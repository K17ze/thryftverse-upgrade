'use client';

/**
 * /seller-hub/quick-replies — the mobile ManageQuickRepliesScreen's web
 * counterpart. Sellers keep canned responses here; the inbox composer
 * inserts them from the bolt menu.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { INPUT_CLASS, SellField } from '@/components/sell/SellField';
import { BackBar } from '@/components/profile/BackBar';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useQuickReplies, type QuickReply } from '@/lib/store/quickReplies';

export default function QuickRepliesPage() {
  const hydrated = useHydrated();
  const toast = useToast();
  const replies = useQuickReplies((s) => s.replies);
  const add = useQuickReplies((s) => s.add);
  const update = useQuickReplies((s) => s.update);
  const remove = useQuickReplies((s) => s.remove);

  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuickReply | null>(null);

  const current = editor?.id ? replies.find((r) => r.id === editor.id) : null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <BackBar />
      <div className="px-4 pb-24 pt-4 sm:px-0">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-title font-semibold text-text-primary">Quick replies</h1>
            <p className="mt-1 text-body text-text-secondary">
              Canned responses you can drop into buyer chats from the bolt menu.
            </p>
          </div>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditor({ id: null })}>
            New reply
          </Button>
        </div>

        {!hydrated ? null : replies.length === 0 ? (
          <EmptyState
            icon="zap"
            title="No quick replies"
            subtitle="Save the answers you type most — dispatch times, firm pricing, measurement requests."
          />
        ) : (
          <ul className="mt-6 divide-y divide-border-subtle">
            {replies.map((r) => (
              <li key={r.id} className="group flex items-start gap-2 py-3.5">
                <button
                  type="button"
                  onClick={() => setEditor({ id: r.id })}
                  className="pressable min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-text-primary"
                >
                  <p className="text-body font-semibold text-text-primary">{r.title}</p>
                  <p className="clamp-2 mt-0.5 text-body text-text-secondary">{r.message}</p>
                </button>
                <IconButton
                  name="trash"
                  aria-label={`Delete "${r.title}"`}
                  onClick={() => setConfirmDelete(r)}
                  className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-meta text-text-muted">
          Saved on this device — a live build syncs these to your account.
        </p>
      </div>

      <ReplySheet
        open={editor !== null}
        editing={current}
        onClose={() => setEditor(null)}
        onSave={(id, r) => {
          if (id) {
            update(id, r);
            toast.show('Reply updated', 'success');
          } else {
            add(r);
            toast.show('Reply saved', 'success');
          }
          setEditor(null);
        }}
      />

      <Sheet open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete reply">
        {confirmDelete ? (
          <div className="px-4 pb-6 pt-1">
            <p className="text-body text-text-secondary">
              Delete &ldquo;{confirmDelete.title}&rdquo;? You can&rsquo;t undo this.
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  remove(confirmDelete.id);
                  setConfirmDelete(null);
                  toast.show('Reply deleted', 'info');
                }}
              >
                Delete
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
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

  const valid = title.trim().length > 0 && message.trim().length > 0;

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit reply' : 'New quick reply'}>
      <div className="space-y-5 px-4 pb-6 pt-1">
        <SellField
          label="Shortcut title"
          id="qr-title"
          required
          error={touched && !title.trim() ? 'Give this reply a title' : undefined}
        >
          <input
            id="qr-title"
            className={INPUT_CLASS}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Dispatch time"
            maxLength={40}
          />
        </SellField>
        <SellField
          label="Message"
          id="qr-message"
          required
          error={touched && !message.trim() ? 'Write the message buyers receive' : undefined}
        >
          <textarea
            id="qr-message"
            className={`${INPUT_CLASS} h-auto resize-none py-2.5`}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Thanks for your order! I dispatch within…"
            maxLength={500}
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
