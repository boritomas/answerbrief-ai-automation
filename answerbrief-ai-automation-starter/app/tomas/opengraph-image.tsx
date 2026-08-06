import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Tomas Nieves, Senior Product Manager';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#fafaf8',
          color: '#1c2430',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#5b6472',
            fontFamily: 'sans-serif',
            fontWeight: 700,
            marginBottom: 20,
          }}
        >
          Senior Product Manager
        </div>
        <div style={{ fontSize: 84, marginBottom: 24, display: 'flex' }}>Tomas Nieves</div>
        <div style={{ fontSize: 32, color: '#5b6472', display: 'flex' }}>
          Enterprise Product Strategy &middot; Digital Transformation &middot; Customer Experience
        </div>
      </div>
    ),
    { ...size },
  );
}
