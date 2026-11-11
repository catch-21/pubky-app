/**
 * Pubky WebAuthn envelope ("E"), carried in the WebAuthn challenge (Android) or the iOS PRF
 * mailbox. Byte layout, all integers big-endian, shared with Pubky Ring
 * (src/passkey/envelope.ts and ios/PubkyPasskeyExtension):
 *
 *   "PKYWA1" (6) | version u8 | flags u8 | exp u32 (unix s) | nonce (16) | urlLen u16 | URL (UTF-8)
 */

const MAGIC = new TextEncoder().encode('PKYWA1');
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_NONCE_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + 1 + 4 + ENVELOPE_NONCE_LENGTH + 2;
const MAX_URL_LENGTH = 4096;

export interface PubkyEnvelopeInput {
  exp: number;
  nonce: Uint8Array;
  url: string;
  version?: number;
  flags?: number;
}

export function encodeEnvelope({ exp, nonce, url, version = ENVELOPE_VERSION, flags = 0 }: PubkyEnvelopeInput) {
  if (nonce.length !== ENVELOPE_NONCE_LENGTH) throw new Error('Envelope nonce must be 16 bytes');
  const urlBytes = new TextEncoder().encode(url);
  if (urlBytes.length > MAX_URL_LENGTH) throw new Error('Envelope URL is too long');
  const out = new Uint8Array(HEADER_LENGTH + urlBytes.length);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  out[6] = version;
  out[7] = flags;
  view.setUint32(8, exp);
  out.set(nonce, 12);
  view.setUint16(12 + ENVELOPE_NONCE_LENGTH, urlBytes.length);
  out.set(urlBytes, HEADER_LENGTH);
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}
