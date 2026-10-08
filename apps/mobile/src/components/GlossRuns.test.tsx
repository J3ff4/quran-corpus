import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { GlossRuns } from './GlossRuns';
import { themeColors } from '@/theme/tokens';
import { contrast } from '@/testing/contrast';
import { rgb } from '@/testing/rgb';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return { Text: host('span') };
});

describe('GlossRuns', () => {
  afterEach(cleanup);

  it('renders bracketed runs in mutedText, the rest inherits', () => {
    render(
      <Text testID="host">
        <GlossRuns text="(the) Symbols" />
      </Text>,
    );

    expect(screen.getByText('(the)').style.color).toBe(rgb(themeColors.light.mutedText));
    expect(screen.getByTestId('host').textContent).toBe('(the) Symbols');
    // The undimmed remainder carries no colour of its own: the host's wins.
    expect(screen.getByText('(the)').parentElement).toBe(screen.getByTestId('host'));
  });

  it('mutedText is AA on every gloss host', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const bg of [themeColors[mode].background, themeColors[mode].surface]) {
        expect(contrast(themeColors[mode].mutedText, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
