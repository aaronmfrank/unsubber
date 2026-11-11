import { describe, expect, it } from 'vitest';
import { decodeMimeWords, parseAddressList, parseMailbox } from './headers';

describe('decodeMimeWords', () => {
  it('leaves plain text alone', () => {
    expect(decodeMimeWords('48 hours only: 30% off')).toBe('48 hours only: 30% off');
  });

  it('decodes base64 and quoted-printable words', () => {
    expect(decodeMimeWords('=?UTF-8?B?Q2Fmw6kgTm9pcg==?=')).toBe('Café Noir');
    expect(decodeMimeWords('=?iso-8859-1?Q?Caf=E9_Noir?=')).toBe('Café Noir');
  });

  it('joins adjacent encoded words, keeping a character split across them', () => {
    // "é" is 0xC3 0xA9 in UTF-8, split across two words.
    expect(decodeMimeWords('=?UTF-8?Q?Caf=C3?= =?UTF-8?Q?=A9?=')).toBe('Café');
  });

  it('keeps plain text between encoded words', () => {
    expect(decodeMimeWords('Sale: =?UTF-8?Q?50=25?= off')).toBe('Sale: 50% off');
  });
});

describe('parseMailbox', () => {
  it('reads quoted and unquoted names', () => {
    expect(parseMailbox('"Brand X" <Deals@BrandX.com>')).toEqual({ name: 'Brand X', address: 'deals@brandx.com' });
    expect(parseMailbox('Brand X <deals@brandx.com>')).toEqual({ name: 'Brand X', address: 'deals@brandx.com' });
  });

  it('reads bare addresses and comment names', () => {
    expect(parseMailbox('deals@brandx.com')).toEqual({ name: '', address: 'deals@brandx.com' });
    expect(parseMailbox('deals@brandx.com (Brand X)')).toEqual({ name: 'Brand X', address: 'deals@brandx.com' });
  });

  it('decodes encoded names and handles escaped quotes', () => {
    expect(parseMailbox('=?UTF-8?B?Q2Fmw6kgTm9pcg==?= <hi@cafe.fr>')?.name).toBe('Café Noir');
    expect(parseMailbox('"Brand \\"X\\"" <a@b.com>')?.name).toBe('Brand "X"');
  });

  it('drops a name that just repeats the address', () => {
    expect(parseMailbox('"a@b.com" <a@b.com>')).toEqual({ name: '', address: 'a@b.com' });
  });

  it('rejects values without an address', () => {
    expect(parseMailbox('Mail Delivery System')).toBeNull();
    expect(parseMailbox('<>')).toBeNull();
  });
});

describe('parseAddressList', () => {
  it('splits on commas outside quotes', () => {
    expect(parseAddressList('"Frank, Aaron" <aaron@x.com>, bea@y.com, Cal <CAL@z.com>')).toEqual([
      'aaron@x.com',
      'bea@y.com',
      'cal@z.com',
    ]);
  });

  it('reads group members and skips empty groups', () => {
    expect(parseAddressList('Team: a@x.com, b@x.com;')).toEqual(['a@x.com', 'b@x.com']);
    expect(parseAddressList('undisclosed-recipients:;')).toEqual([]);
  });

  it('handles missing headers', () => {
    expect(parseAddressList(undefined)).toEqual([]);
  });
});
