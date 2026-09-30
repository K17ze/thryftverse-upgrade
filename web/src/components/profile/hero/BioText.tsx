'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

// ── Bio — linkified + see-more truncated, mirrors mobile BioText ──
// URLs open externally, @mentions route to the member's profile, and
// hashtags stay inert text (no hashtag surface exists). Long bios collapse
// to 200 chars with a trailing "more" toggle.
export const BIO_TRUNCATE_CHARS = 200;
export const BIO_LINK_PATTERN =
  /((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+[^\s]*|@[\w.]+)/g;

export interface BioSegment {
  text: string;
  kind: 'text' | 'url' | 'mention';
}

export function bioSegments(bio: string): BioSegment[] {
  const out: BioSegment[] = [];
  let last = 0;
  const pattern = new RegExp(BIO_LINK_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(bio)) !== null) {
    if (m.index > last) out.push({ text: bio.slice(last, m.index), kind: 'text' });
    const token = m[0];
    out.push({
      text: token,
      kind: token.startsWith('@') ? 'mention' : 'url',
    });
    last = m.index + token.length;
  }
  if (last < bio.length) out.push({ text: bio.slice(last), kind: 'text' });
  return out.length > 0 ? out : [{ text: bio, kind: 'text' }];
}

export function BioText({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncate = bio.length > BIO_TRUNCATE_CHARS;
  const shown = truncate && !expanded ? `${bio.slice(0, BIO_TRUNCATE_CHARS).trimEnd()}…` : bio;
  const segments = useMemo(() => bioSegments(shown), [shown]);

  return (
    <p className="mt-1.5 max-w-xl text-body text-text-primary">
      {segments.map((seg, i) =>
        seg.kind === 'mention' ? (
          <Link
            key={i}
            href={`/u/${seg.text.slice(1)}`}
            className="font-medium text-text-primary hover:underline"
          >
            {seg.text}
          </Link>
        ) : seg.kind === 'url' ? (
          <a
            key={i}
            href={/^https?:\/\//i.test(seg.text) ? seg.text : `https://${seg.text}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
      {truncate ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-semibold text-text-secondary hover:text-text-primary"
          aria-label={expanded ? 'Show less bio' : 'Show more bio'}
        >
          {expanded ? ' less' : ' more'}
        </button>
      ) : null}
    </p>
  );
}
