import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * BackToTop — quiet floating control that appears after ~2 viewports of
 * scroll (Pinterest/Vinted deep-feed grammar). Reduced-motion sessions
 * jump instead of smooth-scrolling; the button mounts only when useful,
 * so it never sits in the tab order at the top of the feed.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight * 2);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() =>
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
      className="fade-in pressable fixed bottom-[88px] right-4 z-sticky flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-primary shadow-floating md:bottom-6 md:right-6"
    >
      <Icon name="arrowUp" size={20} />
    </button>
  );
}
