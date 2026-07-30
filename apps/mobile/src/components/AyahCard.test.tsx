import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AyahCard } from './AyahCard';

vi.mock('react-native', async () => {
  const React = await import('react');
  const host =
    (tag: string) =>
    ({ accessibilityRole, accessibilityLabel, children, disabled, onPress, ...props }: {
      accessibilityRole?: string;
      accessibilityLabel?: string;
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
    }) =>
      React.createElement(
        tag,
        {
          ...props,
          'aria-label': accessibilityLabel,
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
});
