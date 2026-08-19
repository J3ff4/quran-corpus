import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryScreen } from './DictionaryScreen';

const mocks = vi.hoisted(() => ({ push: vi.fn(), setOptions: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('expo-router', () => ({
  router: { push: mocks.push },
  useNavigation: () => ({ setOptions: mocks.setOptions }),
}));
vi.mock('@/components/icons/Icon', () => ({ Icon: () => null }));
vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

describe('DictionaryScreen', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.setOptions.mockReset();
  });
  afterEach(cleanup);

  it('opens on Browse and routes a tapped letter to its own screen', () => {
    render(<DictionaryScreen />);

    fireEvent.click(screen.getAllByTestId('alphabet-cell')[1]!);

    // The second cell is ا. Encoded, like every other Arabic path segment this
    // app builds -- an unencoded Arabic letter in a route is what parseLetterParam
    // would then have to un-guess.
    expect(mocks.push).toHaveBeenCalledWith(`/dictionary/letter/${encodeURIComponent('ا')}`);
  });

  it('hides the grid on the Frequent pane', () => {
    render(<DictionaryScreen />);

    fireEvent.click(screen.getByTestId('dictionary-pane-frequent'));

    expect(screen.queryAllByTestId('alphabet-cell')).toHaveLength(0);
    expect(screen.getByTestId('dictionary-pane-frequent').getAttribute('aria-selected')).toBe('true');
  });

  it('puts a search button in the header', () => {
    render(<DictionaryScreen />);

    expect(mocks.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ headerRight: expect.any(Function) }),
    );
  });
});
