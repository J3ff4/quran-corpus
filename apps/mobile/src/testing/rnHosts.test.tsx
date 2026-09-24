import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { host } from './rnHosts';

const View = host('div');

function paddingOf(style: React.CSSProperties) {
  render(<View testID="box" style={style} />);
  return screen.getByTestId('box').style;
}

/**
 * The shim's own gate. Every spacing prop in the app is written in RN's
 * shorthand, and jsdom drops any property CSS has never heard of -- so a suite
 * reading `style.paddingTop` read `''` for all of them and a cell padded 9 and
 * a cell padded 2 were the same element to a test.
 */
describe('rnHosts spacing', () => {
  afterEach(cleanup);

  it('expands the axis shorthand to the sides it covers', () => {
    const style = paddingOf({ paddingVertical: 9, paddingHorizontal: 4 } as React.CSSProperties);

    expect(style.paddingTop).toBe('9px');
    expect(style.paddingBottom).toBe('9px');
    expect(style.paddingLeft).toBe('4px');
  });

  it('expands the all-sides shorthand too', () => {
    const style = paddingOf({ margin: 8 } as React.CSSProperties);

    expect(style.marginTop).toBe('8px');
    expect(style.marginLeft).toBe('8px');
  });

  it('resolves all-sides under axis under longhand, as RN does', () => {
    // Written with the all-sides value LAST, which is where CSS and RN part
    // company: to the browser `padding` is a shorthand that clobbers whatever
    // came before it, to RN it is the weakest of the three however it is
    // ordered. A style object's key order is not something a screen's author
    // is thinking about, so the shim has to be blind to it.
    const style = paddingOf({
      paddingTop: 3,
      paddingVertical: 2,
      padding: 1,
    } as React.CSSProperties);

    expect(style.paddingTop).toBe('3px');
    // The axis beats the all-sides value on the side it names...
    expect(style.paddingBottom).toBe('2px');
    // ...and the all-sides value still covers the sides neither one claimed.
    expect(style.paddingLeft).toBe('1px');
  });
});
