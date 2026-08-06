import type { MetadataRoute } from 'next';

// Scoped to the tomasnieves.com personal page for now -- this is the first
// sitemap in this repo. AnswerBrief AI's own pages aren't in this map yet;
// add them separately when answer-brief.com gets its own SEO pass.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://tomasnieves.com',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
