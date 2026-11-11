import { getAuthClientId } from '@/config/auth';

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

/** WebAuthn rpId for the passkey path: the page's own host. */
export const getPasskeyRpId = (): string => window.location.hostname;

/** The app's grant client ID, which saved sessions must carry (`PUBKY_RUNTIME_AUTH_CLIENT_ID`). */
export const getPasskeyClientId = (): string => getAuthClientId();

/**
 * Ring refuses a `cid` that differs from the rpId (decision 4), so the passkey path is offered only
 * where the client ID is this host: pubky.app itself, or a deploy that sets the client ID to its host.
 */
export const isPasskeyClientIdUsable = (): boolean => getPasskeyClientId() === getPasskeyRpId();
