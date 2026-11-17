/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['@agentopia/lib', '@agentopia/viewer', '@agentopia/core'],
  reactStrictMode: true,
  // The office's bottom corners hold its credits and controls.
  devIndicators: { position: 'top-right' },
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  async rewrites() {
    return [
      {
        source: '/s/:slug*',
        destination: '/api/script/:slug*',
      },
    ];
  },
  headers: async () => [
    // Pages answer `Accept: text/markdown` with their markdown (src/proxy.ts),
    // so caches must keep the two apart.
    ...['/', '/about', '/privacy', '/terms'].map((source) => ({
      source,
      headers: [{ key: 'Vary', value: 'Accept' }],
    })),
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none';",
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
      ],
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        search: '',
      },
    ],
  },
};
