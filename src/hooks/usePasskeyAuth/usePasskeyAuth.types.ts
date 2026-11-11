/**
 * How one passkey attempt ended. Only `failed` and `cancelled` mean the user should be offered
 * another way in (for example regenerating the Ring deep link on `/sign-in`).
 */
export type PasskeyAttemptResult = 'session' | 'failed' | 'cancelled' | 'superseded';

export type UsePasskeyAuthOptions = {
  /** Called once when an attempt settles. */
  onAttemptSettled?: (result: PasskeyAttemptResult) => void;
};

export type UsePasskeyAuthReturn = {
  /** True when this browser can offer Pubky Ring through the OS passkey sheet. */
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
