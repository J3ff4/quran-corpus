import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahFrame } from '../components/reader/ornaments/SurahFrame';

describe('SurahFrame', () => {
  it('frames the surah name and hides decoration from a11y', () => {
    render(
      <SurahFrame>
        <span>البقرة</span>
      </SurahFrame>,
    );
    expect(screen.getByText('البقرة')).toBeInTheDocument();
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });
});
