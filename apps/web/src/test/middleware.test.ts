import { describe, it, expect, vi } from 'vitest';

// Mock next/server before importing middleware
const mockNext = vi.fn();
vi.mock('next/server', () => ({
  NextResponse: {
    next: mockNext,
  },
}));

// Import after mock is set up
const { middleware } = await import('../middleware');

describe('CSP middleware', () => {
  function makeRequest(url = 'http://localhost/') {
    const headers = new Headers();
    return { headers, url } as unknown as import('next/server').NextRequest;
  }

  function captureResponse() {
    const responseHeaders = new Headers();
    const requestHeaders: Record<string, string> = {};
    mockNext.mockImplementation(({ request }: { request: { headers: Headers } }) => {
      request.headers.forEach((v, k) => { requestHeaders[k] = v; });
      return { headers: responseHeaders };
    });
    return { responseHeaders, requestHeaders };
  }

  it('sets Content-Security-Policy response header', () => {
    const { responseHeaders } = captureResponse();
    middleware(makeRequest());
    expect(responseHeaders.get('Content-Security-Policy')).toBeTruthy();
  });

  it('does not include unsafe-inline in script-src', () => {
    const { responseHeaders } = captureResponse();
    middleware(makeRequest());
    const csp = responseHeaders.get('Content-Security-Policy') ?? '';
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('includes a nonce in script-src', () => {
    const { responseHeaders } = captureResponse();
    middleware(makeRequest());
    const csp = responseHeaders.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/)
  });

  it('sets x-nonce request header matching the CSP nonce', () => {
    const { responseHeaders, requestHeaders } = captureResponse();
    middleware(makeRequest());
    const csp = responseHeaders.get('Content-Security-Policy') ?? '';
    const nonceMatch = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/);
    expect(nonceMatch).not.toBeNull();
    expect(requestHeaders['x-nonce']).toBe(nonceMatch![1]);
  });

  it('generates a different nonce per request', () => {
    const nonces: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { responseHeaders } = captureResponse();
      middleware(makeRequest());
      const csp = responseHeaders.get('Content-Security-Policy') ?? '';
      const match = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/);
      if (match?.[1]) nonces.push(match[1]);
    }
    expect(new Set(nonces).size).toBe(3);
  });

  it('retains worker-src self for service worker', () => {
    const { responseHeaders } = captureResponse();
    middleware(makeRequest());
    const csp = responseHeaders.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("worker-src 'self'");
  });

  it('sets object-src none and base-uri self', () => {
    const { responseHeaders } = captureResponse();
    middleware(makeRequest());
    const csp = responseHeaders.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
