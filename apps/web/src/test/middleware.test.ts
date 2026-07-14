import { describe, it, expect, vi, afterEach } from 'vitest';

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

  it('mirrors the CSP onto the request header so Next stamps the same nonce on inline scripts', () => {
    // Regression: without a matching Content-Security-Policy on the REQUEST
    // headers, Next cannot read the nonce and its inline bootstrap scripts get
    // no (or a mismatched) nonce. Under the strict prod script-src the browser
    // then blocks them, hydration never boots, and the page flashes then blanks.
    const { responseHeaders, requestHeaders } = captureResponse();
    middleware(makeRequest());
    const responseCsp = responseHeaders.get('Content-Security-Policy') ?? '';
    expect(requestHeaders['content-security-policy']).toBe(responseCsp);
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

  // Next dev's Fast-Refresh runtime evaluates strings as JS (eval). A strict
  // prod CSP with no 'unsafe-eval' throws EvalError there, aborting the webpack
  // bootstrap so nothing hydrates. Dev must permit eval; prod must not.
  describe("script-src 'unsafe-eval' gating", () => {
    afterEach(() => vi.unstubAllEnvs());

    function scriptSrc() {
      const { responseHeaders } = captureResponse();
      middleware(makeRequest());
      const csp = responseHeaders.get('Content-Security-Policy') ?? '';
      return csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    }

    it("permits 'unsafe-eval' in development", () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(scriptSrc()).toContain("'unsafe-eval'");
    });

    it("forbids 'unsafe-eval' in production", () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(scriptSrc()).not.toContain("'unsafe-eval'");
    });
  });
});
