import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/layout/AppShell';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ThryftVerse — Buy and sell pre-loved fashion',
    template: '%s · ThryftVerse',
  },
  description:
    'ThryftVerse is the marketplace for pre-loved fashion. Discover, buy and sell second-hand clothing, accessories and more.',
  applicationName: 'ThryftVerse',
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
            so without this script every light-OS visitor gets a dark flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('thryftverse.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
      </head>
      <body className={`${inter.variable} ${playfair.variable}`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
