import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlossRuns } from '../components/shared/GlossRuns';
import { GlossText } from '../components/shared/GlossText';

describe('GlossRuns', () => {
  it('dims bracketed runs only', () => {
    render(
      <p>
        <GlossRuns gloss="(the) Symbols" />
      </p>,
    );
    const dim = screen.getByText('(the)');
    expect(dim.tagName).toBe('SPAN');
    expect(dim.className).toContain('text-paper-600');
    // paper-600 alone fails AA on night-300.
    expect(dim.className).toContain('dark:text-paper-400');
    expect(screen.getByText('Symbols', { exact: false }).className ?? '').not.toContain(
      'text-paper-600',
    );
  });

  it('GlossText renders through GlossRuns', () => {
    render(<GlossText gloss="и [знайте]" glossLang="ru" pageLang="ru" />);
    expect(screen.getByText('[знайте]').className).toContain('text-paper-600');
  });
});
