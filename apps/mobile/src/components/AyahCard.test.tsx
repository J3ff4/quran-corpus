import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AyahCard } from './AyahCard';

vi.mock('react-native', async () => {
  const React = await import('react');
  const host =
    (tag: string) =>
    ({ accessibilityRole, accessibilityLabel, accessibilityState, children, disabled, onPress, ...props }: {
      accessibilityRole?: string;
      accessibilityLabel?: string;
      accessibilityState?: { disabled?: boolean; selected?: boolean };
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
    }) =>
      React.createElement(
        tag,
        {
          ...props,
          'aria-label': accessibilityLabel,
          // Mapped rather than spread: React warns about an unknown
          // accessibilityState attribute on a DOM node, and mapping it is what
          // lets the assertions below see the announced state.
          'aria-disabled': accessibilityState?.disabled,
          'aria-selected': accessibilityState?.selected,
          disabled,
          onClick: onPress,
          role: accessibilityRole,
        },
        children,
      );

  return {
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
  };
});

describe('AyahCard', () => {
  // This suite renders more than once and the project does not enable
  // testing-library's global auto-cleanup, so without this each case queries
  // the leftover DOM of the previous one.
  afterEach(cleanup);

  it('calls bookmark and audio handlers without exposing ayah text to callbacks', () => {
    const onToggleBookmark = vi.fn();
    const onToggleAudio = vi.fn();

    render(
      <AyahCard
        ayahNumber={1}
        arabicText="Arabic text"
        translationText="Translation text"
        bookmarked={false}
        playing={false}
        uiLocale="en"
        onToggleBookmark={onToggleBookmark}
        onToggleAudio={onToggleAudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(onToggleBookmark).toHaveBeenCalledWith(1);
    expect(onToggleAudio).toHaveBeenCalledWith(1);
  });

  it('announces the disabled audio control and the bookmarked state', () => {
    render(
      <AyahCard
        ayahNumber={255}
        arabicText="Arabic text"
        translationText="Translation text"
        bookmarked
        playing={false}
        uiLocale="en"
        audioDisabled
        onToggleBookmark={vi.fn()}
        onToggleAudio={vi.fn()}
      />,
    );

    // Without accessibilityState this announced as an ordinary button whose
    // press does nothing.
    expect(screen.getByRole('button', { name: 'Play' })).toHaveProperty('ariaDisabled', 'true');
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toHaveProperty('ariaSelected', 'true');
  });
});
