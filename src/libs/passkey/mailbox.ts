import { base64UrlEncode, randomBytes } from './envelope';

/**
 * iOS request mailbox. iOS gives a passkey provider the rpId and the PRF input, but not the
 * challenge, so the page leaves the envelope on the HTTP relay under a channel and key that only
 * someone holding the PRF input can derive. Providers receive the PRF salt
 * s = SHA-256("WebAuthn PRF" || 0x00 || r), so everything is derived from s.
 */
const DOMAIN = 'pubky-ring-webauthn-mailbox-v1';
const encoder = new TextEncoder();

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const sha256 = async (...parts: Uint8Array[]): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', concat(...parts)));

export const prfSalt = (prfInput: Uint8Array) => sha256(encoder.encode('WebAuthn PRF'), new Uint8Array([0]), prfInput);

export async function mailboxKeyBytes(salt: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const ikm = await crypto.subtle.importKey('raw', concat(salt), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(`${DOMAIN}/key`) },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}

export const mailboxChannel = async (salt: Uint8Array): Promise<string> =>
  base64UrlEncode(await sha256(encoder.encode(`${DOMAIN}/channel`), salt));

/** body = gcmNonce (12) || AES-256-GCM(key, gcmNonce, envelope, aad = rpId) */
export async function sealMailbox({
  prfInput,
  envelope,
  rpId,
  gcmNonce = randomBytes(12),
}: {
  prfInput: Uint8Array;
  envelope: Uint8Array;
  rpId: string;
  gcmNonce?: Uint8Array;
}): Promise<{ channel: string; body: Uint8Array<ArrayBuffer> }> {
  const salt = await prfSalt(prfInput);
  const key = await crypto.subtle.importKey('raw', await mailboxKeyBytes(salt), 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: concat(gcmNonce), additionalData: encoder.encode(rpId) },
    key,
    concat(envelope),
  );
  return { channel: await mailboxChannel(salt), body: concat(gcmNonce, new Uint8Array(ciphertext)) };
}

/** Leaves the sealed envelope on the relay inbox, where Ring's extension fetches it. */
export async function postMailbox({
  relay,
  channel,
  body,
  signal,
}: {
  relay: string;
  channel: string;
  body: Uint8Array<ArrayBuffer>;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(`${relay.replace(/\/+$/, '')}/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body,
    signal,
  });
  if (!response.ok) throw new Error(`Mailbox relay responded ${response.status}`);
}
