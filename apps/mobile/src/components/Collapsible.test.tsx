import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// useReducedMotion reads the in-app setting as well as the system one; the
// real store opens expo-secure-store, which jsdom has no counterpart for.
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }),
}));

import { Collapsible } from './Collapsible';

describe('Collapsible', () => {
  afterEach(cleanup);

  it('keeps its children out of the tree while shut', () => {
    // Not merely clipped: a shut curtain holding a mounted row leaves that
    // row focusable by TalkBack and re-laid-out on every parent render.
    const result = render(
      <Collapsible open={false}>
        <div data-testid="child" />
      </Collapsible>,
    );

    expect(result.queryByTestId('child')).toBeNull();
  });

  it('clips from the top, so the content drops as one block', () => {
    // A curtain, not a fade (owner ruling R7). overflow:hidden on the clip is
    // what makes the height animation read as an unroll rather than as the
    // children squashing with the container.
    const result = render(
      <Collapsible open testID="clip">
        <div data-testid="child" />
      </Collapsible>,
    );

    expect(result.getByTestId('clip').style.overflow).toBe('hidden');
    expect(result.getByTestId('child')).not.toBeNull();
  });
  it('unmounts its children once the close lands', () => {
    // Not at the top of the close: that collapses the clip instantly and
    // there is no curtain left to watch. But they must go eventually --
    // children left behind a shut curtain stay focusable by TalkBack.
    const result = render(
      <Collapsible open>
        <div data-testid="child" />
      </Collapsible>,
    );
    expect(result.getByTestId('child')).not.toBeNull();

    result.rerender(
      <Collapsible open={false}>
        <div data-testid="child" />
      </Collapsible>,
    );

    expect(result.queryByTestId('child')).toBeNull();
  });
});
