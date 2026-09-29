import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/layout/AppShell';
import { AccessibilityPrefs } from '@/components/settings/AccessibilityPrefs';
import { PlatformRuntime } from '@/components/flagship/PlatformRuntime';

// Vendored variable fonts (latin subsets of Google's Inter + Playfair
// Display, same faces next/font/google serves) — local files keep builds
// reproducible and remove the build-time fetch dependency entirely.
const inter = localFont({
  src: './fonts/inter-var.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

const playfair = localFont({
  src: './fonts/playfair-var.woff2',
  variable: '--font-playfair',
  weight: '100 900',
  display: 'swap',
});

/** Canonical origin for metadata URL resolution (og:image, alternates,
 *  robots sitemap). Public base — NEXT_PUBLIC_ so it also survives into
 *  any client-rendered share copy that wants an absolute URL. */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.thryftverse.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ThryftVerse — Buy and sell pre-loved fashion',
    template: '%s · ThryftVerse',
  },
  description:
    'ThryftVerse is the marketplace for pre-loved fashion. Discover, buy and sell second-hand clothing, accessories and more.',
  applicationName: 'ThryftVerse',
  openGraph: {
    type: 'website',
    siteName: 'ThryftVerse',
    title: 'ThryftVerse — Buy and sell pre-loved fashion',
    description:
      'ThryftVerse is the marketplace for pre-loved fashion. Discover, buy and sell second-hand clothing, accessories and more.',
    url: '/',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ThryftVerse — Buy and sell pre-loved fashion',
    description:
      'ThryftVerse is the marketplace for pre-loved fashion. Discover, buy and sell second-hand clothing, accessories and more.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Resolve the theme before first paint — SSR always emits dark,
            so without this script every light-OS visitor gets a dark flash.
            The same pass restores persisted accessibility prefs (text-size
            zoom, reduce-motion/high-contrast classes) plus the platform
            prefs (density/accent data attrs, locale lang/dir) so they
            apply from first paint instead of popping in after hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('thryftverse.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t;var p=(JSON.parse(localStorage.getItem('thryftverse.web.settings-prefs')||'{}').state)||{};var z={small:'0.9',large:'1.125',xlarge:'1.25'}[p.textSize];if(z)document.documentElement.style.zoom=z;var d=document.documentElement.classList;if(p.reduceMotion)d.add('reduce-motion');if(p.highContrast)d.add('high-contrast');var dd=(JSON.parse(localStorage.getItem('thryftverse.web.density')||'{}').state||{}).density;if(dd==='compact'||dd==='editorial')document.documentElement.dataset.density=dd;var ac=(JSON.parse(localStorage.getItem('thryftverse.web.accent')||'{}').state||{}).accent;if(ac&&ac!=='default')document.documentElement.dataset.accent=ac;var lc=(JSON.parse(localStorage.getItem('thryftverse.web.locale')||'{}').state||{}).locale;if(lc){document.documentElement.lang=lc;if(lc==='ar')document.documentElement.dir='rtl'}}catch(e){}",
          }}
        />
      </head>
      <body className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
        {/* Keyboard/AT path past the sticky chrome — visually hidden until
            focused (the left offset is the hiding mechanism, not sr-only,
            so the link stays in the focus order without layout churn). */}
        <a
          href="#main-content"
          className="absolute -left-[9999px] top-3 z-toast rounded-md border border-border bg-surface-elevated px-4 py-3 text-body font-semibold text-text-primary shadow-floating focus:left-4"
        >
          Skip to content
        </a>
        <AccessibilityPrefs />
        <Providers>
          {/* Density/accent/locale mirroring + global offline banner. */}
          <PlatformRuntime />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
