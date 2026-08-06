import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const TOMAS_HOSTS = new Set(['tomasnieves.com', 'www.tomasnieves.com']);

// sitemap.xml is one file shared by both domains, so it must branch on the
// requesting host -- otherwise answer-brief.com's sitemap request returned
// Tomas's personal page instead of (or in addition to) AnswerBrief's own
// pages. AnswerBrief AI's own pages still aren't in this map yet; that is
// an unrelated, already-deferred SEO pass, not something this fix invents.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hostname = ((await headers()).get('host') ?? '').split(':')[0].toLowerCase();

  if (TOMAS_HOSTS.has(hostname)) {
    return [
      {
        url: 'https://tomasnieves.com',
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 1,
      },
    ];
  }

  return [];
}
