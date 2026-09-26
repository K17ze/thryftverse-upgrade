'use client';

/**
 * AuthShell — the shared auth composition: editorial media collage on the
 * left (wordmark + value prop + trust points on a media scrim), flat form
 * panel on the right. Mobile gets a compact media band above the panel.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Logo } from '@/components/layout/Logo';
import { useSession } from '@/lib/session/SessionProvider';

const img = (id: string, w = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const COLLAGE = {
  lead: img('photo-1485968579580-b6d095142e6e', 1100),
  second: img('photo-1496747611176-843222e1e57c', 800),
  third: img('photo-1523398002811-999ca8dec234', 800),
};

const MOBILE_BAND = [
  img('photo-1485968579580-b6d095142e6e', 500),
  img('photo-1523398002811-999ca8dec234', 500),
  img('photo-1496747611176-843222e1e57c', 500),
];

const TRUST_POINTS: { icon: AppIconName; label: string }[] = [
  { icon: 'shieldCheck', label: 'Buyer protection on every order' },
  { icon: 'verified', label: 'Verified sellers' },
  { icon: 'lock', label: 'Secure payments' },
];

export function AuthShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isGuest } = useSession();

  // The auth stack is guest-only, like mobile — a signed-in session
  // that lands here goes straight back home.
  useEffect(() => {
    if (!isGuest) router.replace('/');
  }, [isGuest, router]);

  if (!isGuest) return null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Editorial collage — media is the color; scrim carries the copy. */}
      <aside className="relative hidden lg:block" aria-hidden>
        <div className="absolute inset-0 grid grid-cols-2 gap-3 p-3">
          <AppImage
            src={COLLAGE.lead}
            alt=""
            fill
            className="h-full rounded-xl"
            sizes="30vw"
            priority
          />
          <div className="flex flex-col gap-3 pt-[14%]">
            <AppImage
              src={COLLAGE.second}
              alt=""
              aspectRatio={0.8}
              className="rounded-xl"
              sizes="22vw"
              priority
            />
            <AppImage
              src={COLLAGE.third}
              alt=""
              aspectRatio={0.9}
              className="rounded-xl"
              sizes="22vw"
            />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-12">
          <p className="text-[26px] font-extrabold tracking-[-0.8px] text-scrim-text-primary">
            ThryftVerse
          </p>
          <p className="mt-2 max-w-sm text-body-large text-scrim-text-secondary">
            The flagship marketplace for pre-loved fashion.
          </p>
          <ul className="mt-7 flex flex-col gap-2.5">
            {TRUST_POINTS.map((point) => (
              <li
                key={point.label}
                className="flex items-center gap-2.5 text-body text-scrim-text-secondary"
              >
                <Icon name={point.icon} size={16} className="shrink-0 text-scrim-text-primary" />
                {point.label}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form panel — flat canvas, no card chrome. */}
      <div className="flex min-h-dvh flex-col lg:min-h-0">
        <div className="grid h-36 shrink-0 grid-cols-3 gap-1 p-1 lg:hidden" aria-hidden>
          {MOBILE_BAND.map((src) => (
            <AppImage key={src} src={src} alt="" fill className="h-full rounded-md" sizes="33vw" />
          ))}
        </div>

        <div className="flex flex-1 flex-col px-6 py-10 sm:px-10">
          <Logo className="lg:hidden" />
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
