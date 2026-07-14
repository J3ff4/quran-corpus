import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  // Next dev's Fast-Refresh runtime evaluates strings as JS (eval). Without
  // 'unsafe-eval' the browser throws EvalError during the webpack bootstrap,
  // aborting it so no client component hydrates. Dev-only — the production
  // bundle contains no eval, so the strict policy applies there.
  const scriptSrc =
    process.env.NODE_ENV === 'development'
      ? `script-src 'self' 'unsafe-eval' 'nonce-${nonce}'`
      : `script-src 'self' 'nonce-${nonce}'`;
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' https:",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads the nonce by parsing the CSP on the REQUEST headers and stamps it
  // onto its inline bootstrap/RSC scripts. Without this the strict prod policy
  // (no 'unsafe-inline') blocks those inline scripts, hydration never boots, and
  // the page flashes then blanks. Must mirror the response CSP exactly.
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon\\.ico|icons|sw\\.js|manifest\\.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
