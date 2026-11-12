import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isIosDevice } from '@/libs/pwa/platform';
import vectors from './__fixtures__/vectors.json';
import { getAppleAppSiteAssociation, getPasskeyAssetLinks } from './association';
import { base64UrlDecode, base64UrlEncode, encodeEnvelope } from './envelope';
import { mailboxChannel, mailboxKeyBytes, prfSalt, sealMailbox } from './mailbox';
import {
  buildPasskeyRequest,
  getPasskeyAssertion,
  isPasskeySignInSupported,
  PasskeyCeremonyError,
  preparePasskeyRequest,
  readPasskeyClientCapabilities,
  shouldUsePasskeyImmediateMode,
} from './passkey';

vi.mock('@/libs/pwa/platform', () => ({
  isIosDevice: vi.fn(() => false),
  isAndroidIntentDevice: vi.fn(() => true),
}));

const authClientId = vi.hoisted(() => ({ value: 'localhost' }));
vi.mock('@/config/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/auth')>()),
  getAuthClientId: () => authClientId.value,
}));

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const fromHex = (value: string) => new Uint8Array(Buffer.from(value, 'hex'));
const RP_ID = vectors.mailbox.rpId;

describe('passkey envelope', () => {
  it('matches the vector shared with Pubky Ring', () => {
    const { input } = vectors.envelope;
    const encoded = encodeEnvelope({ ...input, nonce: fromHex(input.nonce) });
    expect(hex(encoded)).toBe(vectors.envelope.hex);
    expect(base64UrlEncode(encoded)).toBe(vectors.envelope.base64url);
    expect(hex(base64UrlDecode(vectors.envelope.base64url))).toBe(vectors.envelope.hex);
  });

  it('rejects a nonce of the wrong length', () => {
    expect(() => encodeEnvelope({ exp: 1, nonce: new Uint8Array(8), url: 'pubkyauth://x' })).toThrow();
  });
});

describe('passkey mailbox', () => {
  it('derives the salt, key and channel shared with Pubky Ring', async () => {
    const salt = await prfSalt(fromHex(vectors.mailbox.prfInputHex));
    expect(hex(salt)).toBe(vectors.mailbox.prfSaltHex);
    expect(hex(await mailboxKeyBytes(salt))).toBe(vectors.mailbox.keyHex);
    expect(await mailboxChannel(salt)).toBe(vectors.mailbox.channel);
  });

  it('seals the envelope exactly as Pubky Ring expects', async () => {
    const sealed = await sealMailbox({
      prfInput: fromHex(vectors.mailbox.prfInputHex),
      envelope: fromHex(vectors.envelope.hex),
      rpId: RP_ID,
      gcmNonce: fromHex(vectors.mailbox.gcmNonceHex),
    });
    expect(sealed.channel).toBe(vectors.mailbox.channel);
    expect(hex(sealed.body)).toBe(vectors.mailbox.bodyHex);
  });
});

describe('buildPasskeyRequest', () => {
  const authorizationUrl = vectors.envelope.input.url;

  it('puts the envelope in the challenge with an empty allow list (Android)', async () => {
    const { options, envelope, mailbox } = await buildPasskeyRequest({
      authorizationUrl,
      rpId: RP_ID,
      route: 'challenge',
      nowSeconds: 1000,
    });
    const publicKey = options.publicKey!;
    expect(publicKey.rpId).toBe(RP_ID);
    expect(publicKey.challenge).toBe(envelope);
    expect(publicKey.allowCredentials).toEqual([]);
    expect(new TextDecoder().decode(envelope.subarray(0, 6))).toBe('PKYWA1');
    expect(new DataView(envelope.buffer).getUint32(8)).toBe(1120);
    expect(mailbox).toBeUndefined();
  });

  it('adds a mailbox on the iOS route', async () => {
    const { mailbox, options } = await buildPasskeyRequest({ authorizationUrl, rpId: RP_ID, route: 'mailbox' });
    expect(mailbox?.channel).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const prf = (options.publicKey!.extensions as { prf: { eval: { first: Uint8Array } } }).prf;
    expect(prf.eval.first).toHaveLength(32);
  });

  it('sends the envelope as a credential ID on the allowCredentials route', async () => {
    const { options, envelope } = await buildPasskeyRequest({
      authorizationUrl,
      rpId: RP_ID,
      route: 'allowCredentials',
    });
    expect(options.publicKey!.allowCredentials).toEqual([{ type: 'public-key', id: envelope }]);
  });

  it('asks for immediate UI mode on the challenge route when told to', async () => {
    const { options } = await buildPasskeyRequest({
      authorizationUrl,
      rpId: RP_ID,
      route: 'challenge',
      immediate: true,
    });
    expect(options.uiMode).toBe('immediate');
    expect(options).not.toHaveProperty('mediation');
  });

  it('keeps the normal sheet by default and on routes immediate mode cannot serve', async () => {
    const normal = await buildPasskeyRequest({ authorizationUrl, rpId: RP_ID, route: 'challenge' });
    expect(normal.options).not.toHaveProperty('uiMode');
    const allowList = await buildPasskeyRequest({
      authorizationUrl,
      rpId: RP_ID,
      route: 'allowCredentials',
      immediate: true,
    });
    expect(allowList.options).not.toHaveProperty('uiMode');
    const mailbox = await buildPasskeyRequest({ authorizationUrl, rpId: RP_ID, route: 'mailbox', immediate: true });
    expect(mailbox.options).not.toHaveProperty('uiMode');
  });
});

describe('shouldUsePasskeyImmediateMode', () => {
  afterEach(() => {
    vi.mocked(isIosDevice).mockReturnValue(false);
    window.history.replaceState(null, '', '/');
  });

  it('is on only when the browser reports immediateGet', () => {
    expect(shouldUsePasskeyImmediateMode({ immediateGet: true }, 'challenge')).toBe(true);
    expect(shouldUsePasskeyImmediateMode({ immediateGet: false }, 'challenge')).toBe(false);
    expect(shouldUsePasskeyImmediateMode({}, 'challenge')).toBe(false);
  });

  it('keeps the iOS routes on the normal sheet', () => {
    expect(shouldUsePasskeyImmediateMode({ immediateGet: true }, 'mailbox')).toBe(false);
    expect(shouldUsePasskeyImmediateMode({ immediateGet: true }, 'allowCredentials')).toBe(false);
    vi.mocked(isIosDevice).mockReturnValue(true);
    expect(shouldUsePasskeyImmediateMode({ immediateGet: true }, 'challenge')).toBe(false);
    expect(shouldUsePasskeyImmediateMode({ immediateGet: true })).toBe(false);
  });

  it('can be turned off with a query parameter', () => {
    window.history.replaceState(null, '', '/?ringImmediate=0');
    expect(shouldUsePasskeyImmediateMode({ immediateGet: true }, 'challenge')).toBe(false);
  });
});

describe('readPasskeyClientCapabilities', () => {
  const setPublicKeyCredential = (value: unknown) => {
    Object.defineProperty(window, 'PublicKeyCredential', { value, configurable: true });
  };

  afterEach(() => {
    setPublicKeyCredential(undefined);
  });

  it('returns what the browser reports', async () => {
    const capabilities = { immediateGet: true, passkeyPlatformAuthenticator: true };
    setPublicKeyCredential(
      Object.assign(function PublicKeyCredential() {}, { getClientCapabilities: async () => capabilities }),
    );
    await expect(readPasskeyClientCapabilities()).resolves.toEqual(capabilities);
  });

  it('returns nothing where WebAuthn or getClientCapabilities is missing, or it throws', async () => {
    setPublicKeyCredential(undefined);
    await expect(readPasskeyClientCapabilities()).resolves.toEqual({});
    setPublicKeyCredential(function PublicKeyCredential() {});
    await expect(readPasskeyClientCapabilities()).resolves.toEqual({});
    setPublicKeyCredential(
      Object.assign(function PublicKeyCredential() {}, {
        getClientCapabilities: async () => {
          throw new DOMException('nope', 'NotSupportedError');
        },
      }),
    );
    await expect(readPasskeyClientCapabilities()).resolves.toEqual({});
  });
});

describe('getPasskeyAssertion', () => {
  const originalCredentials = navigator.credentials;

  afterEach(() => {
    Object.defineProperty(navigator, 'credentials', { value: originalCredentials, configurable: true });
  });

  const mockGet = (impl: () => Promise<unknown>) => {
    Object.defineProperty(navigator, 'credentials', { value: { get: vi.fn(impl) }, configurable: true });
  };

  it('returns the pubky from the userHandle', async () => {
    mockGet(async () => ({
      rawId: new Uint8Array([1, 2, 3]).buffer,
      response: { userHandle: new TextEncoder().encode(vectors.credentialId.pubky).buffer },
    }));
    const request = await buildPasskeyRequest({ authorizationUrl: 'pubkyauth://x', rpId: RP_ID, route: 'challenge' });
    await expect(getPasskeyAssertion(request)).resolves.toEqual({
      pubky: vectors.credentialId.pubky,
      credentialId: 'AQID',
    });
  });

  it('reports a cancelled sheet', async () => {
    mockGet(async () => {
      throw new DOMException('cancelled', 'NotAllowedError');
    });
    const request = await buildPasskeyRequest({ authorizationUrl: 'pubkyauth://x', rpId: RP_ID, route: 'challenge' });
    await expect(getPasskeyAssertion(request)).rejects.toMatchObject({ reason: 'cancelled' });
  });

  it('refuses an assertion without a userHandle', async () => {
    mockGet(async () => ({ rawId: new ArrayBuffer(1), response: { userHandle: null } }));
    const request = await buildPasskeyRequest({ authorizationUrl: 'pubkyauth://x', rpId: RP_ID, route: 'challenge' });
    await expect(getPasskeyAssertion(request)).rejects.toBeInstanceOf(PasskeyCeremonyError);
  });
});

describe('isPasskeySignInSupported', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: function PublicKeyCredential() {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'credentials', { value: { get: vi.fn() }, configurable: true });
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    authClientId.value = 'localhost';
  });

  it('is on for mobile browsers with WebAuthn', () => {
    expect(isPasskeySignInSupported()).toBe(true);
  });

  it('is off when the client ID is not this host, since Ring would refuse it', () => {
    authClientId.value = 'staging.pubky.app';
    expect(isPasskeySignInSupported()).toBe(false);
  });

  it('can be turned off with a query parameter or localStorage', () => {
    window.history.replaceState(null, '', '/?ringPasskey=0');
    expect(isPasskeySignInSupported()).toBe(false);
    window.history.replaceState(null, '', '/');
    window.localStorage.setItem('pubky-ring-passkey-disabled', 'true');
    expect(isPasskeySignInSupported()).toBe(false);
  });

  it('is off outside a secure context or without WebAuthn', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    expect(isPasskeySignInSupported()).toBe(false);
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
    expect(isPasskeySignInSupported()).toBe(false);
  });

  it('stays on when the client capabilities are silent or positive', () => {
    expect(isPasskeySignInSupported({})).toBe(true);
    expect(isPasskeySignInSupported({ passkeyPlatformAuthenticator: true, immediateGet: false })).toBe(true);
    expect(isPasskeySignInSupported({ passkeyPlatformAuthenticator: false })).toBe(true);
  });

  it('is off when the client capabilities report no platform passkeys at all', () => {
    expect(
      isPasskeySignInSupported({ passkeyPlatformAuthenticator: false, userVerifyingPlatformAuthenticator: false }),
    ).toBe(false);
  });

  it('is off on the iOS mailbox route without the PRF extension', () => {
    vi.mocked(isIosDevice).mockReturnValue(true);
    try {
      expect(isPasskeySignInSupported({ 'extension:prf': true })).toBe(true);
      expect(isPasskeySignInSupported({ 'extension:prf': false })).toBe(false);
    } finally {
      vi.mocked(isIosDevice).mockReturnValue(false);
    }
  });
});

describe('preparePasskeyRequest', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: function PublicKeyCredential() {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'credentials', { value: { get: vi.fn() }, configurable: true });
  });

  it('uses immediate UI mode where the capabilities allow it', async () => {
    const { options } = await preparePasskeyRequest({
      authorizationUrl: 'pubkyauth://x',
      relay: 'https://relay.example.com/inbox',
      capabilities: { immediateGet: true },
    });
    expect(options.uiMode).toBe('immediate');
  });

  it('uses the normal sheet without immediateGet', async () => {
    const { options } = await preparePasskeyRequest({
      authorizationUrl: 'pubkyauth://x',
      relay: 'https://relay.example.com/inbox',
    });
    expect(options).not.toHaveProperty('uiMode');
  });

  it('refuses to build a request the capabilities rule out', async () => {
    await expect(
      preparePasskeyRequest({
        authorizationUrl: 'pubkyauth://x',
        relay: 'https://relay.example.com/inbox',
        capabilities: { passkeyPlatformAuthenticator: false, userVerifyingPlatformAuthenticator: false },
      }),
    ).rejects.toMatchObject({ reason: 'unsupported' });
  });
});

describe('association files', () => {
  it('serve nothing until configured', () => {
    expect(getPasskeyAssetLinks({})).toEqual([]);
    expect(getAppleAppSiteAssociation({})).toEqual({ webcredentials: { apps: [] } });
  });

  it('list the configured apps', () => {
    expect(getPasskeyAssetLinks({ PASSKEY_ANDROID_CERT_SHA256: 'aa:bb, cc:dd' })).toEqual([
      {
        relation: ['delegate_permission/common.get_login_creds'],
        target: {
          namespace: 'android_app',
          package_name: 'to.pubky.ring',
          sha256_cert_fingerprints: ['AA:BB', 'CC:DD'],
        },
      },
    ]);
    expect(getAppleAppSiteAssociation({ PASSKEY_IOS_APP_IDS: 'TEAMID.app.example.ring' })).toEqual({
      webcredentials: { apps: ['TEAMID.app.example.ring'] },
    });
  });
});
