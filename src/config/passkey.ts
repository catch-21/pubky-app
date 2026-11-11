/**
 * Passkey sign-in with Pubky Ring as the OS passkey provider. Design and decisions:
 * pubky-ring docs/passkey-provider/PLAN.md (section 14).
 */

/** How long Ring accepts the envelope. Ring refuses anything longer than 300 s. */
export const PASSKEY_ENVELOPE_LIFETIME_S = 120;

/** WebAuthn get() timeout. Covers the OS sheet, Ring's consent screen and the relay post. */
export const PASSKEY_CEREMONY_TIMEOUT_MS = 120_000;

/** Query parameter that forces the iOS 17 `allowCredentials` request route (debug only). */
export const PASSKEY_ROUTE_QUERY = 'ringTransport';

/** Query parameter or localStorage key that turns passkey sign-in off and restores the deep link. */
export const PASSKEY_DISABLE_QUERY = 'ringPasskey';
export const PASSKEY_DISABLE_STORAGE_KEY = 'pubky-ring-passkey-disabled';

/**
 * WebAuthn rpId and Pubky client ID for the passkey path. Ring requires `cid` to equal the
 * rpId exactly (decision 4), so both are the page's own host.
 */
export const getPasskeyRpId = (): string => window.location.hostname;
export const getPasskeyClientId = (): string => getPasskeyRpId();
