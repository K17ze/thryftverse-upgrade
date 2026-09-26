'use client';

/**
 * Composer — chat input bar. Auto-growing textarea inside a 20px pill,
 * photo attach that stages a local preview before sending (remove before
 * it goes out), quick-reply bolt picker, brand send button enabled with
 * text or a staged photo. Enter sends, Shift+Enter newline; the send and
 * attach controls disable while a send is in flight — the optimistic
 * bubble's clock receipt carries the honest in-flight state.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { SendChatMessageInput } from '@/lib/hooks/queries';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useQuickReplies } from '@/lib/store/quickReplies';
import { useHydrated } from '@/lib/store/useStore';

const MAX_HEIGHT = 128;

interface ComposerProps {
  onSend: (input: SendChatMessageInput) => void;
  /** True while a send is in flight — controls disable, no double-send. */
  sending?: boolean;
}

export function Composer({ onSend, sending = false }: ComposerProps) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [staged, setStaged] = useState<{ uri: string; mediaType: 'image' } | null>(null);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const repliesWrapRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const replies = useQuickReplies((s) => s.replies);

  useEffect(() => {
    if (!repliesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (repliesWrapRef.current && !repliesWrapRef.current.contains(e.target as Node)) {
        setRepliesOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRepliesOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [repliesOpen]);

  const grow = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  };

  const submit = () => {
    if (sending) return;
    const text = value.trim();
    if (!text && !staged) return;
    onSend({
      text: text || undefined,
      mediaUri: staged?.uri,
      mediaType: staged?.mediaType,
    });
    setValue('');
    setStaged(null);
    requestAnimationFrame(() => {
      if (areaRef.current) areaRef.current.style.height = 'auto';
    });
  };

  const pickPhoto = () => {
    fileRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.show('Only photos can be shared here', 'info');
      return;
    }
    setStaged({ uri: URL.createObjectURL(file), mediaType: 'image' });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 border-t border-border-subtle bg-background"
    >
      {/* Staged attachment — WhatsApp's preview-before-send. The pick is a
          local blob URL; it renders through a plain img. */}
      {staged ? (
        <div className="flex items-center gap-2 px-3 pt-2.5 md:px-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable */}
            <img src={staged.uri} alt="Photo ready to send" className="h-full w-full object-cover" />
          </div>
          <IconButton
            name="close"
            size={16}
            aria-label="Remove photo"
            className="h-9 w-9"
            onClick={() => setStaged(null)}
          />
        </div>
      ) : null}
      <div className="flex items-end gap-1 px-2 py-2 md:px-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onFile}
        />
        <IconButton
          name="image"
          aria-label="Attach a photo"
          onClick={pickPhoto}
          disabled={sending}
        />
        {hydrated && replies.length > 0 ? (
          <div ref={repliesWrapRef} className="relative shrink-0">
            <IconButton
              name="zap"
              aria-label="Quick replies"
              aria-expanded={repliesOpen}
              aria-haspopup="menu"
              onClick={() => setRepliesOpen((o) => !o)}
              disabled={sending}
            />
            {repliesOpen ? (
              <div
                role="menu"
                className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
              >
                <p className="px-3.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-text-muted">
                  Quick replies
                </p>
                {replies.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setValue(r.message);
                      setRepliesOpen(false);
                      requestAnimationFrame(() => {
                        grow();
                        areaRef.current?.focus();
                      });
                    }}
                    className="pressable block w-full px-3.5 py-2.5 text-left hover:bg-row-pressed"
                  >
                    <span className="block text-body font-semibold text-text-primary">{r.title}</span>
                    <span className="clamp-1 mt-0.5 block text-meta text-text-muted">{r.message}</span>
                  </button>
                ))}
                <Link
                  href="/seller-hub/quick-replies"
                  className="block border-t border-border-subtle px-3.5 py-2.5 text-body font-semibold text-text-primary hover:bg-row-pressed"
                >
                  Manage quick replies
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 rounded-chat bg-surface-alt px-4 py-1.5">
          <textarea
            ref={areaRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message…"
            aria-label="Message"
            className="max-h-32 w-full resize-none bg-transparent py-1.5 text-body text-input-text placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={sending || (!value.trim() && !staged)}
          aria-label={sending ? 'Sending message' : 'Send message'}
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-text-inverse disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name={sending ? 'clock' : 'send'} size={18} />
        </button>
      </div>
    </form>
  );
}
