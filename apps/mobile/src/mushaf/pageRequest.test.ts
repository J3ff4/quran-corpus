import { beforeEach, describe, expect, it } from 'vitest';

import { requestMushafPage, takeMushafPage } from './pageRequest';

beforeEach(() => {
  // Module state, so a request left by one test is visible to the next.
  takeMushafPage();
});

describe('mushaf page request', () => {
  it('has nothing pending by default', () => {
    expect(takeMushafPage()).toBeNull();
  });

  it('hands over the requested page', () => {
    requestMushafPage(418);
    expect(takeMushafPage()).toBe(418);
  });

  it('is consumed by the first take', () => {
    // The whole reason this is a store and not a route param: a value that
    // survives its first read would re-open the khatm page every time the
    // mushaf tab was focused for the rest of the session.
    requestMushafPage(418);
    takeMushafPage();
    expect(takeMushafPage()).toBeNull();
  });

  it('keeps the latest request when two arrive before a take', () => {
    requestMushafPage(100);
    requestMushafPage(418);
    expect(takeMushafPage()).toBe(418);
  });
});
