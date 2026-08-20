import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LemmaRoute from '../../app/lemma/[lemma]';

const mocks = vi.hoisted(() => ({
  lemma: undefined as string | string[] | undefined,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ lemma: mocks.lemma }),
}));

// Stubbed to the one prop the route computes: this suite is about what the
// route forwards to the screen, not what the screen does with it -- that is
// LemmaScreen.test.tsx's job.
vi.mock('@/screens/LemmaScreen', () => ({
  LemmaScreen: ({ lemmaBuckwalter }: { lemmaBuckwalter: string | null }) =>
    React.createElement('div', { 'data-testid': 'lemma-screen', 'data-lemma': String(lemmaBuckwalter) }),
}));

describe('LemmaRoute', () => {
  beforeEach(() => {
    mocks.lemma = undefined;
  });
  afterEach(cleanup);

  it('decodes a percent-encoded raw param before forwarding it', () => {
    // Raw and parsed MUST differ here, or this test cannot distinguish
    // "forwarded the raw param" from "forwarded the parsed one".
    mocks.lemma = '%7Bll~ah';

    render(<LemmaRoute />);

    expect(screen.getByTestId('lemma-screen').getAttribute('data-lemma')).toBe('{ll~ah');
  });

  it('forwards null, not the string "undefined", for a missing param', () => {
    mocks.lemma = undefined;

    render(<LemmaRoute />);

    const forwarded = screen.getByTestId('lemma-screen').getAttribute('data-lemma');
    // parseLemmaParam(undefined as unknown as string) returns the valid
    // Buckwalter identifier "undefined" -- a raw, unguarded call reaches SQLite
    // with it. The route must never hand that string down.
    expect(forwarded).not.toBe('undefined');
    expect(forwarded).toBe('null');
  });

  it('never forwards a comma-joined string for an array param', () => {
    mocks.lemma = ['qAl', 'mA'];

    render(<LemmaRoute />);

    const forwarded = screen.getByTestId('lemma-screen').getAttribute('data-lemma');
    // parseLemmaParam(['qAl','mA'] as unknown as string) joins to "qAl,mA",
    // which also passes the Buckwalter charset test (',' is in it).
    expect(forwarded).not.toBe('qAl,mA');
  });
});
