import {
  getPasskeyRpId,
  PASSKEY_CEREMONY_TIMEOUT_MS,
  PASSKEY_DISABLE_QUERY,
  PASSKEY_DISABLE_STORAGE_KEY,
  PASSKEY_ENVELOPE_LIFETIME_S,
  PASSKEY_ROUTE_QUERY,
} from '@/config/passkey';
import { isAndroidIntentDevice, isIosDevice } from '@/libs/pwa/platform';
import { base64UrlEncode, encodeEnvelope, ENVELOPE_NONCE_LENGTH, randomBytes } from './envelope';
import { postMailbox, sealMailbox } from './mailbox';

/**
 * How the envelope reaches Ring:
 * - `challenge`: Android. Credential Manager passes the full request JSON, including the challenge.
 * - `mailbox`: iOS 18+. The envelope waits on the relay under a key derived from the PRF input.
 * - `allowCredentials`: iOS 17 experiment. The envelope is sent as a credential ID. Undocumented.
 */
export type PasskeyRoute = 'challenge' | 'mailbox' | 'allowCredentials';

export interface PasskeyAssertion {
  /** z-base-32 pubky Ring returned as the WebAuthn userHandle. */
  pubky: string;
  credentialId: string;
}

export class PasskeyCeremonyError extends Error {
  constructor(
    readonly reason: 'unsupported' | 'cancelled' | 'mailbox' | 'no-user-handle' | 'failed',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PasskeyCeremonyError';
  }
}

const readFlag = (name: string): string | null => {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
};

/** Mobile browsers with WebAuthn, unless turned off with `?ringPasskey=0` or the localStorage switch. */
export function isPasskeySignInSupported(): boolean {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (typeof window.PublicKeyCredential === 'undefined' || !navigator.credentials?.get) return false;
  const queryFlag = readFlag(PASSKEY_DISABLE_QUERY);
  if (queryFlag === '0' || queryFlag === 'false') return false;
  try {
    if (window.localStorage.getItem(PASSKEY_DISABLE_STORAGE_KEY) === 'true') return false;
  } catch {
    // Storage can be unavailable in private modes; the passkey path stays on.
  }
  return isIosDevice() || isAndroidIntentDevice();
}

export function defaultPasskeyRoute(): PasskeyRoute {
  if (!isIosDevice()) return 'challenge';
  return readFlag(PASSKEY_ROUTE_QUERY) === 'allowCredentials' ? 'allowCredentials' : 'mailbox';
}

export interface PasskeyRequest {
  options: CredentialRequestOptions;
  envelope: Uint8Array<ArrayBuffer>;
  mailbox?: { channel: string; body: Uint8Array<ArrayBuffer> };
}

export async function buildPasskeyRequest({
  authorizationUrl,
  rpId = getPasskeyRpId(),
  route = defaultPasskeyRoute(),
  nowSeconds = Math.floor(Date.now() / 1000),
  signal,
}: {
  authorizationUrl: string;
  rpId?: string;
  route?: PasskeyRoute;
  nowSeconds?: number;
  signal?: AbortSignal;
}): Promise<PasskeyRequest> {
  const envelope = encodeEnvelope({
    exp: nowSeconds + PASSKEY_ENVELOPE_LIFETIME_S,
    nonce: randomBytes(ENVELOPE_NONCE_LENGTH),
    url: authorizationUrl,
  }) as Uint8Array<ArrayBuffer>;
  const prfInput = randomBytes(32);
  const mailbox = route === 'mailbox' ? await sealMailbox({ prfInput, envelope, rpId }) : undefined;
  const publicKey: PublicKeyCredentialRequestOptions & { hints?: string[] } = {
    challenge: envelope,
    rpId,
    allowCredentials: route === 'allowCredentials' ? [{ type: 'public-key', id: envelope }] : [],
    userVerification: 'preferred',
    timeout: PASSKEY_CEREMONY_TIMEOUT_MS,
    // Keep the request on this phone: a cross-device (hybrid QR) passkey cannot be Ring here.
    hints: ['client-device'],
    extensions: { prf: { eval: { first: prfInput } } } as AuthenticationExtensionsClientInputs,
  };
  return { options: { publicKey, ...(signal ? { signal } : {}) }, envelope, mailbox };
}

/** Builds the request and, on the mailbox route, leaves the sealed envelope on the relay. */
export async function preparePasskeyRequest({
  authorizationUrl,
  relay,
  route,
  signal,
}: {
  authorizationUrl: string;
  relay: string;
  route?: PasskeyRoute;
  signal?: AbortSignal;
}): Promise<PasskeyRequest> {
  if (!isPasskeySignInSupported()) throw new PasskeyCeremonyError('unsupported', 'Passkey sign-in is not supported');
  const request = await buildPasskeyRequest({ authorizationUrl, route, signal });
  if (request.mailbox) {
    try {
      await postMailbox({ relay, ...request.mailbox, signal });
    } catch (error) {
      throw new PasskeyCeremonyError('mailbox', 'Could not reach the relay', error);
    }
  }
  return request;
}

/**
 * Runs the WebAuthn ceremony that hands the Pubky grant request to Ring. Ring posts the signed
 * approval to the relay before it returns, so the caller's `awaitApproval` delivers the session.
 * The assertion itself is not a credential: callers only use its userHandle to check that the
 * approving pubky is the one the user picked in the OS sheet.
 *
 * `navigator.credentials.get` is called synchronously, so a click handler keeps its user activation.
 */
export async function getPasskeyAssertion(request: PasskeyRequest): Promise<PasskeyAssertion> {
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get(request.options);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    throw new PasskeyCeremonyError(
      name === 'NotAllowedError' || name === 'AbortError' ? 'cancelled' : 'failed',
      error instanceof Error ? error.message : 'Passkey request failed',
      error,
    );
  }
  const assertion = credential as PublicKeyCredential | null;
  const response = assertion?.response as AuthenticatorAssertionResponse | undefined;
  const userHandle = response?.userHandle;
  if (!assertion || !userHandle || userHandle.byteLength === 0) {
    throw new PasskeyCeremonyError('no-user-handle', 'The passkey did not identify a pubky');
  }
  return {
    pubky: new TextDecoder().decode(userHandle),
    credentialId: base64UrlEncode(new Uint8Array(assertion.rawId)),
  };
}
