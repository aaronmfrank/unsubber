function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Header values come from the sender's mailto link, so line breaks are stripped to block header injection. */
function headerValue(value: string): string {
  const flat = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7E]*$/.test(flat) ? flat : `=?UTF-8?B?${utf8Base64(flat)}?=`;
}

function addressValue(address: string): string {
  return address.replace(/[\r\n<>,;\s]/g, '');
}

export interface PlainEmail {
  from: string;
  to: string[];
  subject: string;
  body: string;
}

/** Builds a plain-text RFC 2822 message. */
export function buildEmail({ from, to, subject, body }: PlainEmail): string {
  const encodedBody = utf8Base64(body).replace(/.{1,76}/g, '$&\r\n');
  return [
    `From: ${addressValue(from)}`,
    `To: ${to.map(addressValue).join(', ')}`,
    `Subject: ${headerValue(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
  ].join('\r\n');
}

/** The `raw` field Gmail's messages.send expects. */
export function toBase64Url(message: string): string {
  return utf8Base64(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
