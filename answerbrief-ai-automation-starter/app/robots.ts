import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const TOMAS_HOSTS = new Set(['tomasnieves.com', 'www.tomasnieves.com']);

// robots.txt is one file shared by both tomasnieves.com and answer-brief.com,
// so it must branch on the requesting host -- otherwise answer-brief.com's
// crawlers were being pointed at Tomas's personal sitemap, and vice versa.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = ((await headers()).get('host') ?? '').split(':')[0].toLowerCase();

  if (TOMAS_HOSTS.has(hostname)) {
    return {
      rules: {
        userAgent: '*',
        allow: '/',
      },
      sitemap: 'https://tomasnieves.com/sitemap.xml',
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/founder-dashboard', '/career-os/admin', '/tomas'],
    },
    sitemap: 'https://www.answer-brief.com/sitemap.xml',
  };
}
