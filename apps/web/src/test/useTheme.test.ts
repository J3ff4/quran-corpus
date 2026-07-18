import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme';

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: prefersDark })));
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });

  it('defaults to OS preference when nothing stored (dark system)', async () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('stored choice beats OS preference', async () => {
    stubMatchMedia(true);
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggle flips theme, applies class, and persists', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('light'));

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('storage event from another tab syncs state', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('light'));

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
    });
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
