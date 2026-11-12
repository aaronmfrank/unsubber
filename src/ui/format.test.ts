import { describe, expect, it } from 'vitest';
import { cleanSnippet } from './format';

describe('cleanSnippet', () => {
  it('strips markup some senders leave in snippets', () => {
    expect(cleanSnippet('Sink hours into <em>Ascend from Nine Mountains</em> this <b class="x">Singles Day</b>')).toBe(
      'Sink hours into Ascend from Nine Mountains this Singles Day',
    );
  });

  it('keeps text that only looks like a comparison', () => {
    expect(cleanSnippet('Save 3 < 5 times > before')).toBe('Save 3 < 5 times > before');
  });

  it('removes invisible preheader padding and extra spaces', () => {
    expect(cleanSnippet('Shop now \u200c\u200c\u034f   before it ends')).toBe('Shop now before it ends');
  });
});
