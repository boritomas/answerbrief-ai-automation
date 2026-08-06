const nextConfig = {
  async rewrites() {
    return {
      // Once tomasnieves.com is attached to this Vercel project (see the
      // Cloudflare DNS records in the PR description), requests to its root
      // are served by the existing /tomas page -- no separate deployment or
      // duplicate content, one canonical page reachable at the domain root.
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'host', value: 'tomasnieves.com' }],
          destination: '/tomas',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.tomasnieves.com' }],
          destination: '/tomas',
        },
      ],
    };
  },
};

export default nextConfig;
