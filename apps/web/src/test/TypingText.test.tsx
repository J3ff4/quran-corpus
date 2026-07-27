import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { TypingText } from '../components/ui/TypingText';

const TEXT = 'No bookmarks yet. Tap the bookmark icon on any ayah to save it here.';

function chars(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.typing-char'));
}

function delayMs(el: HTMLElement): number {
  return Number.parseFloat(el.style.animationDelay);
}

describe('TypingText', () => {
  it('renders the complete string, one span per character', () => {
    render(<TypingText text={TEXT} />);
    const spans = chars();
    expect(spans).toHaveLength(TEXT.length);
    expect(spans.map((s) => s.textContent).join('')).toBe(TEXT);
  });

  it('keeps the whole message in the server HTML, so it never waits on hydration', () => {
    // The regression this component was rewritten to avoid: a JS-seeded reveal
    // ships an empty (or fully transparent) paragraph and only becomes legible
    // once the bundle lands.
    const html = renderToStaticMarkup(<TypingText text={TEXT} className="text-paper-500" />);
    expect(html).toContain('animation-delay');
    const textOnly = html.replace(/<[^>]*>/g, '');
    expect(textOnly).toBe(TEXT);
  });

  it('staggers each character after the one before it', () => {
    render(<TypingText text="abcd" />);
    const delays = chars().map(delayMs);
    expect(delays[0]).toBe(90); // START_DELAY_MS
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it('runs straight through punctuation without stalling', () => {
    render(<TypingText text="ab. cd" />);
    const delays = chars().map(delayMs);
    // Every gap is an ordinary keystroke -- the '.' at index 2 opens no beat.
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]! - delays[i - 1]!).toBeLessThan(30);
    }
  });

  it('types the whole message in about a second', () => {
    render(<TypingText text={TEXT} />);
    const last = delayMs(chars().at(-1)!);
    expect(last).toBeLessThan(1300);
  });

  it('gives identical delays on every render, so server and client HTML agree', () => {
    const a = renderToStaticMarkup(<TypingText text={TEXT} />);
    const b = renderToStaticMarkup(<TypingText text={TEXT} />);
    expect(a).toBe(b);
  });

  it('applies the caller className to the paragraph', () => {
    render(<TypingText text={TEXT} className="text-paper-500" />);
    const p = document.querySelector('p')!;
    expect(p).toHaveClass('text-paper-500');
    expect(p).toHaveTextContent(TEXT);
  });
});
