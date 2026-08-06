import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default async function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1c2430',
          color: '#fafaf8',
          fontFamily: 'Georgia, serif',
          fontSize: 34,
        }}
      >
        TN
      </div>
    ),
    { ...size },
  );
}
