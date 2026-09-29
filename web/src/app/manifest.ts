import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ThryftVerse — Buy and sell pre-loved fashion',
    short_name: 'ThryftVerse',
    description:
      'ThryftVerse is the marketplace for pre-loved fashion. Discover, buy and sell second-hand clothing, accessories and more.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
