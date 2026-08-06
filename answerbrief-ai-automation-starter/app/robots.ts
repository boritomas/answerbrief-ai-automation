import type { MetadataRoute } from 'next';

// First robots.txt in this repo. Keeps crawlers out of admin/API/internal
// routes on general principle (robots.txt is a hint, not the actual access
// control -- those routes are separately authenticated) while allowing
// everything else, including the public /tomas page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/founder-dashboard', '/career-os/admin'],
    },
    sitemap: 'https://tomasnieves.com/sitemap.xml',
  };
}
