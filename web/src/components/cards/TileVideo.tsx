'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface TileVideoProps {
  src: string;
  label: string;
  aspectRatio: number;
}

/**
 * TileVideo — feed video grammar, mirrors the mobile feed's viewability
 * autoplay: muted, inline, looping, and only while at least half the
 * tile is on screen. Two honest gates keep it opt-out friendly —
 * prefers-reduced-motion and the network Save-Data hint both leave the
 * clip paused (the first frame still renders; the play badge stays so
 * the tile still reads as video). A paused clip on scroll-away resumes
 * on return; it never plays with sound.
 */
export function TileVideo({ src, label, aspectRatio }: TileVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** False until mounted + permitted — SSR never claims autoplay. */
  const [autoplayAllowed, setAutoplayAllowed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const update = () =>
      setAutoplayAllowed(!motion.matches && connection?.saveData !== true);
    update();
    motion.addEventListener('change', update);
    return () => motion.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!autoplayAllowed) {
      // Policy flipped mid-scroll — honour it immediately.
      video.pause();
      return;
    }
    if (!('IntersectionObserver' in window)) {
      // No observer (very old engine) — treat as always visible.
      void video.play().catch(() => undefined);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            void video.play().catch(() => undefined);
          } else if (!video.paused) {
            video.pause();
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [autoplayAllowed]);

  return (
    <div className="w-full" style={{ aspectRatio: String(aspectRatio) }}>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        loop
        preload="metadata"
        aria-label={label}
        className="media-zoom h-full w-full object-cover"
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {/* Pause toggle — WCAG 2.2.2: an auto-playing loop needs a user
          stop. The badge becomes the control: paused shows play,
          playing surfaces pause on hover/focus. */}
      <button
        type="button"
        aria-label={playing ? 'Pause video' : 'Play video'}
        aria-pressed={playing}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play().catch(() => undefined);
          else video.pause();
        }}
        className={`absolute right-1.5 top-1.5 z-elevated inline-flex items-center rounded-md bg-overlay px-1.5 py-1 text-scrim-text-primary transition-opacity ${
          playing
            ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            : ''
        }`}
      >
        <Icon name={playing ? 'pause' : 'play'} filled size={11} />
      </button>
    </div>
  );
}
