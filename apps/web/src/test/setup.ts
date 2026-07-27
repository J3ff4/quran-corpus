import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// The App Router hooks throw outside a router provider, and BookmarkButton
// (router.refresh on toggle) is rendered by half the component suites. Stubbed
// once here rather than repeated in each of them; a file that needs to assert
// on navigation still declares its own vi.mock, which takes precedence.
//
// Only the hooks are replaced. The rest of the module is spread back in so the
// page-level suites keep the real notFound/redirect — stubbing those would turn
// a 404 path into "notFound is not a function".
vi.mock('next/navigation', async () => ({
  ...(await vi.importActual<typeof import('next/navigation')>('next/navigation')),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Automatically clean up the DOM after each test
afterEach(() => {
  cleanup();
});
