/**
 * How one passkey attempt ended.
 * - `passkey-failed`: the passkey step itself did not work (cancelled or empty sheet, no credential,
 *   timeout, a pubky that does not match the approval). No toast is shown; the caller offers the
 *   Ring deep link instead.
 * - `failed`: something after or around the passkey failed (relay, homeserver, session); the hook
 *   has already shown an error toast.
 */
export type PasskeyAttemptResult = 'session' | 'failed' | 'passkey-failed' | 'superseded';

export type UsePasskeyAuthOptions = {
  /** Called once when an attempt settles. */
  onAttemptSettled?: (result: PasskeyAttemptResult) => void;
};

export type UsePasskeyAuthReturn = {
  /**
   * True when this browser can offer Pubky Ring through the OS passkey sheet. Starts from the
   * synchronous checks and can turn false once the client capabilities resolve.
   */
  isSupported: boolean;
  /** Start one attempt from a click handler. */
  startPasskeyAuth: () => void;
  /**
   * Safari can refuse a WebAuthn call that no longer counts as part of the tap. The prepared
   * request is then kept and this re-runs it from a new tap.
   */
  continuePasskeyAuth: () => void;
  /** True while a prepared request is waiting for that second tap. */
  needsTap: boolean;
  /** True from the click until the attempt settles. */
  isPending: boolean;
};
