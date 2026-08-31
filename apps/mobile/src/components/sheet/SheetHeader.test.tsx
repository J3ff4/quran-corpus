import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetHeader } from './SheetHeader';

// react-native itself does not run under jsdom; every suite that renders a
// host component maps it through rnHosts, same as BrowseList.test.tsx and
// ClampedText.test.tsx.
vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#111', mutedText: '#777' }),
}));

afterEach(cleanup);

describe('SheetHeader', () => {
  it('publishes the title as a heading', () => {
    render(<SheetHeader title="Choose reciter" />);
    expect(screen.getByRole('heading', { name: 'Choose reciter' })).toBeTruthy();
  });

  it('renders a subtitle under the title when one is given', () => {
    render(<SheetHeader title="Add note" subtitle="Aal-Imran 3:9" />);
    expect(screen.getByText('Aal-Imran 3:9')).toBeTruthy();
  });

  it('renders nothing extra when there is no subtitle', () => {
    const { container } = render(<SheetHeader title="Add note" />);
    // Exactly one text node: a stray empty <Text> still occupies a row in the
    // sheet's `gap: 14` column and pushes the body down.
    expect(container.querySelectorAll('span').length).toBe(1);
  });
});
