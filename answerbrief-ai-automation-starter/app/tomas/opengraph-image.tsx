import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Tomas Nieves, Senior Product Manager';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  // og-headshot.jpg is a resize-only, format-converted derivative of the
  // approved headshot (public/tomas/tomas-nieves-headshot.png), sized for
  // this fixed 1200x630 canvas -- no crop beyond the source photo's own
  // framing, no stylization. See the PRODUCTION ASSET AND CAREER DOCUMENT
  // CORRECTION directive for the approved-photo usage rules.
  const imageData = await fetch(new URL('./og-headshot.jpg', import.meta.url)).then((res) => res.arrayBuffer());
  const imageSrc = `data:image/jpeg;base64,${Buffer.from(imageData).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '72px',
          background: '#fafaf8',
          color: '#1c2430',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 48 }}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#5b6472',
              fontFamily: 'sans-serif',
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            Senior Product Manager
          </div>
          <div style={{ fontSize: 62, marginBottom: 18, display: 'flex' }}>Tomas Nieves</div>
          <div style={{ fontSize: 22, lineHeight: 1.4, color: '#5b6472', display: 'flex' }}>
            Enterprise Product Strategy &middot; Customer Experience &middot; Digital Transformation
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          width={300}
          height={300}
          alt=""
          style={{ borderRadius: 16, objectFit: 'cover', objectPosition: 'center 20%', flexShrink: 0 }}
        />
      </div>
    ),
    { ...size },
  );
}
