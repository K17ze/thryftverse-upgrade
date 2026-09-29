import { ImageResponse } from 'next/og';

/** Apple touch icon — same wordmark tile as icon.tsx at 180px (opaque
 *  background, which Apple requires). */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          fontSize: 120,
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
