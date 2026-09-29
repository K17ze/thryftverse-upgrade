import { ImageResponse } from 'next/og';

/**
 * Favicon / app icon — the wordmark 'T' on the dark canvas with the cream
 * brand ink (globals.css --background #0A0A0A / --brand #F4F0E8).
 */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
          color: '#F4F0E8',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 340,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
