import withSerwist from '@serwist/next';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // packages/config ships raw .ts (no build step), so Next has to compile it --
  // the ayah-medallion geometry is imported from there by a client component.
  transpilePackages: ['@quran-corpus/config'],
  // @libsql/client uses native Node.js bindings — must not be bundled by webpack.
  // serverExternalPackages is listed here for clarity; webpack externals below handles pnpm virtual store paths.
  serverExternalPackages: ['@libsql/client', 'libsql'],
  webpack: (webpackConfig, { isServer }) => {
    if (isServer) {
      webpackConfig.externals = [
        ...(Array.isArray(webpackConfig.externals) ? webpackConfig.externals : []),
        /^@libsql\//,
        'libsql',
      ];
    }
    return webpackConfig;
  },
  // CSP with per-request nonce is set in middleware.ts — only static headers here.
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
      ],
    },
  ],
};

export default withSerwist({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})(config);
