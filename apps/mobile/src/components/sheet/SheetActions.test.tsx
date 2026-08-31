import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetActions } from './SheetActions';

// react-native itself does not run under jsdom; every suite that renders a
// host component maps it through rnHosts, same as BrowseList.test.tsx.
vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({
    accent: '#1f6f5b', onAccent: '#fff', mutedText: '#777', danger: '#9f2d2d', text: '#111',
  }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));

const base = {
  cancelLabel: 'Cancel', onCancel: () => {},
  confirmLabel: 'Save', onConfirm: () => {},
};

afterEach(cleanup);

describe('SheetActions', () => {
  it('gives both buttons the 48dp floor', () => {
    render(<SheetActions {...base} cancelTestID="c" confirmTestID="k" />);
    // The whole point of this component. A padded <Text> measured ~33dp, and
    // the button that missed was the one that discarded a note.
    for (const id of ['c', 'k']) {
      expect(screen.getByTestId(id).style.minHeight).toBe('48px');
    }
  });

  it('calls back on each button', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<SheetActions {...base} onCancel={onCancel} onConfirm={onConfirm} cancelTestID="c" confirmTestID="k" />);
    fireEvent.click(screen.getByTestId('c'));
    fireEvent.click(screen.getByTestId('k'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fills the confirm button when the tone asks for it', () => {
    render(<SheetActions {...base} tone="filled" confirmTestID="k" />);
    expect(screen.getByTestId('k').style.backgroundColor).toBe('rgb(31, 111, 91)');
  });

  it('leaves the confirm button unfilled otherwise', () => {
    // A danger confirm is danger-coloured TEXT, never a red block: `danger` is
    // tuned to be readable type, and as a solid fill it is a pale pink slab
    // (the dangerFill note in BookmarksScreen).
    render(<SheetActions {...base} tone="danger" confirmTestID="k" />);
    expect(screen.getByTestId('k').style.backgroundColor).toBe('');
  });

  it('names both buttons for a screen reader', () => {
    render(<SheetActions {...base} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});
