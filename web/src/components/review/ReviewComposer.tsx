'use client';

/**
 * ReviewComposer — the write-review form, ported from the mobile
 * WriteReviewScreen: order context row, dominant star rating, optional
 * tag chips, free text with a 2000-char budget, optional photos with the
 * privacy line, then the publish footer. Flat canvas + hairlines — no
 * card chrome, same as mobile.
 */

import { useRef, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import {
  MAX_REVIEW_CHARS,
  MAX_REVIEW_PHOTOS,
  REVIEW_TAGS,
  type ReviewSubmission,
} from './reviewModel';
import { RatingInput } from './RatingInput';

interface ReviewComposerProps {
  itemTitle: string | null;
  itemImage: string | null;
  /** Display ref — e.g. "Order #1A2B3C4D". */
  orderRef: string;
  /** True when a platform auto-feedback row exists — this review replaces it. */
  autoReview: boolean;
  submitting: boolean;
  onSubmit: (input: ReviewSubmission) => void;
}

export function ReviewComposer({
  itemTitle,
  itemImage,
  orderRef,
  autoReview,
  submitting,
  onSubmit,
}: ReviewComposerProps) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit = rating > 0 && !submitting;
  const slotsLeft = MAX_REVIEW_PHOTOS - photoUrls.length;

  const toggleTag = (key: string) =>
    setTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const attachFiles = (files: File[]) => {
    if (slotsLeft <= 0 || files.length === 0) return;
    const urls = files.slice(0, slotsLeft).map((f) => URL.createObjectURL(f));
    setPhotoUrls((prev) => [...prev, ...urls]);
  };

  const removePhoto = (index: number) =>
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-6">
      {/* Order context — flat row, the listing image is the dominant object */}
      <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
        {itemImage ? (
          <span className="w-12 shrink-0 overflow-hidden rounded-md">
            <AppImage src={itemImage} alt={itemTitle ?? 'Order item'} aspectRatio={1} sizes="48px" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="clamp-2 text-body text-text-primary">
            {itemTitle ?? 'Your item'}
          </p>
          <p className="mt-0.5 text-meta text-text-secondary">{orderRef}</p>
        </div>
      </div>

      {autoReview ? (
        // Platform auto-feedback exists — the buyer's submission supersedes
        // it in place, same semantics as the mobile screen.
        <p className="text-caption leading-relaxed text-text-muted">
          Automatic feedback was recorded for this order. Your review replaces it.
        </p>
      ) : null}

      {/* Rating — the primary control */}
      <section>
        <h2 className="text-item-title font-semibold text-text-primary sm:text-screen-title">
          Rate this purchase
        </h2>
        <div className="mt-3">
          <RatingInput rating={rating} onChange={setRating} />
        </div>
      </section>

      {/* Tags — optional qualifiers buyers scan on seller reviews */}
      <section>
        <p className="mb-2.5 text-caption font-semibold text-text-primary">
          What stood out? <span className="font-normal text-text-muted">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => (
            <Chip
              key={tag.key}
              selected={tags.includes(tag.key)}
              onClick={() => toggleTag(tag.key)}
            >
              {tag.label}
            </Chip>
          ))}
        </div>
      </section>

      {/* Text — flat input, hairline border, placeholder is the prompt */}
      <section>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_REVIEW_CHARS}
          rows={5}
          placeholder="What should another buyer know?"
          aria-label="Review text"
          className="w-full resize-y rounded-md border border-border bg-input px-3 py-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
        />
        <p className="mt-1 text-right text-meta text-text-muted">
          {text.length}/{MAX_REVIEW_CHARS}
        </p>
      </section>

      {/* Photos — optional, with privacy guidance */}
      <section>
        {photoUrls.length > 0 ? (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {photoUrls.map((uri, index) => (
              <div key={uri} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- object-URL previews cannot go through next/image */}
                <img
                  src={uri}
                  alt={`Review photo ${index + 1}`}
                  className="h-[72px] w-[72px] rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="pressable absolute -right-1.5 -top-1.5 rounded-full bg-background text-danger-text"
                >
                  <Icon name="close" filled size={20} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {slotsLeft > 0 ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                attachFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-3"
            >
              <Icon name="camera" size={18} className="shrink-0 text-brand" />
              <span className="flex-1 text-left text-body text-brand">
                {photoUrls.length > 0 ? 'Add more' : 'Add photos'}
              </span>
              <span className="text-meta text-text-muted">
                {photoUrls.length}/{MAX_REVIEW_PHOTOS}
              </span>
            </button>
          </>
        ) : null}
        <p className="mt-2 text-meta leading-relaxed text-text-muted">
          Remove labels, addresses and faces you don’t want public.
        </p>
      </section>

      {/* Footer — publish is gated on a rating, honest about progress */}
      <div className="border-t border-border-subtle pt-4">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({ rating, text: text.trim(), tags, photoUrls })
          }
        >
          {submitting ? 'Publishing…' : 'Publish review'}
        </Button>
      </div>
    </div>
  );
}
