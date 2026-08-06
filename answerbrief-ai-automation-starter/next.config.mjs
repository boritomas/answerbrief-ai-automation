const nextConfig = {
  async rewrites() {
    return {
      // tomasnieves.com is attached to this same Vercel project as
      // answer-brief.com. This rewrite only maps that host's root path to
      // the existing /tomas page so it's reachable at the domain root --
      // it does not isolate the two properties from each other. That
      // isolation (blocking AnswerBrief's routes on tomasnieves.com and
      // blocking /tomas on answer-brief.com) is enforced by middleware.ts.
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
