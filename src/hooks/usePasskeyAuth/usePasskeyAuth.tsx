'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@synonymdev/pubky';
import { getDefaultHttpRelay } from '@/config/network';
import { AuthController } from '@/controllers/auth/auth';
import { isAuthApprovalMismatchError, isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { isAppError, isWrongEnvironmentHomeserverError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import {
  getPasskeyAssertion,
  isPasskeySignInSupported,
  PasskeyCeremonyError,
  type PasskeyRequest,
  preparePasskeyRequest,
} from '@/libs/passkey/passkey';
import { isIosDevice } from '@/libs/pwa/platform';
import { toast } from '@/molecules/Toaster/toast';
import type { PasskeyAttemptResult, UsePasskeyAuthOptions, UsePasskeyAuthReturn } from './usePasskeyAuth.types';

/** Ring posts the approval before it returns the assertion; allow for relay latency after that. */
export const PASSKEY_APPROVAL_GRACE_MS = 30_000;
/** A NotAllowedError this fast on iOS means Safari refused the call, not that the user cancelled. */
const IOS_GESTURE_REFUSAL_MS = 1_500;

type Attempt = {
  request: PasskeyRequest;
  awaitApproval: Promise<Session>;
  cancelAuthFlow: () => void;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the Pubky Ring approval')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/**
 * Sign in with Pubky Ring through the OS passkey sheet (pubky-ring docs/passkey-provider/PLAN.md).
 * The WebAuthn ceremony only carries the request to Ring and proves which pubky the user picked;
 * the session still comes from the Pubky grant on the relay, exactly as with a QR scan.
 */
export function usePasskeyAuth(options: UsePasskeyAuthOptions = {}): UsePasskeyAuthReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const attemptRef = useRef<Attempt | null>(null);
  const nextIdRef = useRef(0);
  const onAttemptSettledRef = useRef(options.onAttemptSettled);

  useEffect(() => {
    onAttemptSettledRef.current = options.onAttemptSettled;
  }, [options.onAttemptSettled]);

  useEffect(() => {
    setIsSupported(isPasskeySignInSupported());
    return () => {
      attemptRef.current?.cancelAuthFlow();
      attemptRef.current = null;
    };
  }, []);

  const isCurrent = (attempt: Attempt) => attemptRef.current === attempt;

  const settle = (attempt: Attempt, result: PasskeyAttemptResult) => {
    if (!isCurrent(attempt)) return;
    attemptRef.current = null;
    setNeedsTap(false);
    setIsPending(false);
    if (result === 'failed' || result === 'cancelled') attempt.cancelAuthFlow();
    onAttemptSettledRef.current?.(result);
  };

  const runCeremony = async (attempt: Attempt) => {
    const startedAt = Date.now();
    try {
      const assertion = await getPasskeyAssertion(attempt.request);
      if (!isCurrent(attempt)) return;
      const session = await withTimeout(attempt.awaitApproval, PASSKEY_APPROVAL_GRACE_MS);
      if (!isCurrent(attempt)) return;
      // A provider that saw the request could race a forged approval for its own key onto the relay.
      // Only accept the session if the pubky that approved is the one the user picked in the OS sheet.
      if (session.info.publicKey.z32() !== assertion.pubky) {
        toast({ variant: 'error', description: 'Pubky Ring approved with a different key. Try again.' });
        settle(attempt, 'failed');
        return;
      }
      await AuthController.initializeAuthenticatedSession({ session });
      settle(attempt, 'session');
    } catch (error) {
      if (!isCurrent(attempt)) return;
      if (
        error instanceof PasskeyCeremonyError &&
        error.reason === 'cancelled' &&
        isIosDevice() &&
        Date.now() - startedAt < IOS_GESTURE_REFUSAL_MS
      ) {
        setNeedsTap(true);
        return;
      }
      if (isAuthFlowCanceledError(error)) {
        settle(attempt, 'superseded');
        return;
      }
      if (error instanceof PasskeyCeremonyError && error.reason === 'cancelled') {
        toast({
          variant: 'info',
          description: 'Passkey sign-in was cancelled, or Pubky Ring is not set up as a passkey provider.',
        });
        settle(attempt, 'cancelled');
        return;
      }
      if (!(error instanceof PasskeyCeremonyError) && !isAppError(error)) {
        Logger.error('Passkey sign-in failed:', error);
      }
      toast({
        variant: 'error',
        description: isWrongEnvironmentHomeserverError(error)
          ? 'This account is linked to a different homeserver. Use a staging account on this site.'
          : isAuthApprovalMismatchError(error)
            ? 'Approve with the account you are signed in with.'
            : error instanceof PasskeyCeremonyError && error.reason === 'mailbox'
              ? 'Could not reach the Pubky relay. Check your connection and try again.'
              : 'Passkey sign-in failed. Try again.',
      });
      settle(attempt, 'failed');
    }
  };

  const startPasskeyAuth = () => {
    if (attemptRef.current || isPending) return;
    const id = ++nextIdRef.current;
    const isLatest = () => nextIdRef.current === id;
    setIsPending(true);
    setNeedsTap(false);
    void (async () => {
      let flow: Awaited<ReturnType<typeof AuthController.getPasskeyAuthUrl>> | null = null;
      try {
        flow = await AuthController.getPasskeyAuthUrl();
        void flow.awaitApproval.catch(() => undefined);
        const request = await preparePasskeyRequest({
          authorizationUrl: flow.authorizationUrl,
          relay: getDefaultHttpRelay(),
        });
        if (!isLatest()) {
          flow.cancelAuthFlow();
          return;
        }
        const attempt: Attempt = { request, awaitApproval: flow.awaitApproval, cancelAuthFlow: flow.cancelAuthFlow };
        attemptRef.current = attempt;
        await runCeremony(attempt);
      } catch (error) {
        if (!isLatest()) return;
        flow?.cancelAuthFlow();
        setIsPending(false);
        const superseded = isAuthFlowCanceledError(error);
        if (!superseded) {
          toast({
            variant: 'error',
            description:
              error instanceof PasskeyCeremonyError && error.reason === 'mailbox'
                ? 'Could not reach the Pubky relay. Check your connection and try again.'
                : 'Could not start passkey sign-in. Try again.',
          });
        }
        onAttemptSettledRef.current?.(superseded ? 'superseded' : 'failed');
      }
    })();
  };

  const continuePasskeyAuth = () => {
    const attempt = attemptRef.current;
    if (!attempt || !needsTap) return;
    setNeedsTap(false);
    void runCeremony(attempt);
  };

  return { isSupported, startPasskeyAuth, continuePasskeyAuth, needsTap, isPending };
}
