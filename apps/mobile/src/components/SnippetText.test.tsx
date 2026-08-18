import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnippetText } from './SnippetText';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Text: host('span') };
});

const START = '';
const END = '';

describe('SnippetText', () => {
  afterEach(cleanup);

  it('highlights the delimited run and nothing else', () => {
    render(
      <SnippetText
        snippet={`in the name of ${START}Allah${END} the merciful`}
        highlightColor="#f00"
      />,
    );

    const marks = screen.getAllByTestId('snippet-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('Allah');
  });

  it('leaves the delimiters out of the rendered text', () => {
    render(<SnippetText snippet={`a ${START}b${END} c`} highlightColor="#f00" />);

    // A stray U+0002 on screen is a visible box glyph, and it is the giveaway
    // that the snippet was rendered as one plain string.
    expect(screen.getByTestId('snippet').textContent).toBe('a b c');
  });

  it('renders an undelimited snippet unchanged', () => {
    render(<SnippetText snippet="no match markers here" highlightColor="#f00" />);

    expect(screen.queryAllByTestId('snippet-mark')).toHaveLength(0);
    expect(screen.getByTestId('snippet').textContent).toBe('no match markers here');
  });
});
