'use client';

import { useEffect, useState } from 'react';
import { getDefaultHttpRelay } from '@/config/network';
import { getPasskeyClientId, getPasskeyRpId } from '@/config/passkey';
import { AuthController } from '@/controllers/auth/auth';
import { base64UrlEncode, randomBytes } from '@/libs/passkey/envelope';
import {
  defaultPasskeyRoute,
  getPasskeyAssertion,
  isPasskeySignInSupported,
  type PasskeyRoute,
  preparePasskeyRequest,
} from '@/libs/passkey/passkey';

type LogLine = { at: string; text: string };

const ROUTES: { value: PasskeyRoute; label: string }[] = [
  { value: 'challenge', label: 'Challenge (Android)' },
  { value: 'mailbox', label: 'PRF mailbox (iOS 18+)' },
  { value: 'allowCredentials', label: 'allowCredentials (iOS 17 experiment)' },
];

/**
 * Device harness for Pubky Ring as an OS passkey provider. It runs the same request the sign-in
 * page sends and logs every step. It never adopts the session.
 */
export function PasskeySpike() {
  const [route, setRoute] = useState<PasskeyRoute>('challenge');
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<Record<string, string>>({});

  const write = (text: string) => setLog((lines) => [...lines, { at: new Date().toISOString().slice(11, 23), text }]);

  useEffect(() => {
    setRoute(defaultPasskeyRoute());
    const details: Record<string, string> = {
      rpId: getPasskeyRpId(),
      clientId: getPasskeyClientId(),
      relay: getDefaultHttpRelay(),
      secureContext: String(window.isSecureContext),
      passkeySignInSupported: String(isPasskeySignInSupported()),
      userAgent: navigator.userAgent,
    };
    setInfo(details);
    const getCapabilities = (
      window.PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }
    )?.getClientCapabilities;
    if (getCapabilities) {
      void getCapabilities()
        .then((capabilities) =>
          setInfo((current) => ({ ...current, clientCapabilities: JSON.stringify(capabilities) })),
        )
        .catch(() => undefined);
    }
  }, []);

  const runSignIn = async () => {
    setBusy(true);
    setLog([]);
    let flow: Awaited<ReturnType<typeof AuthController.getPasskeyAuthUrl>> | null = null;
    try {
      flow = await AuthController.getPasskeyAuthUrl();
      write(`Grant flow started: ${flow.authorizationUrl}`);
      const approval = flow.awaitApproval;
      approval.catch(() => undefined);
      const request = await preparePasskeyRequest({
        authorizationUrl: flow.authorizationUrl,
        relay: getDefaultHttpRelay(),
        route,
      });
      write(`Envelope: ${request.envelope.length} bytes, route ${route}`);
      if (request.mailbox) write(`Mailbox posted on channel ${request.mailbox.channel}`);
      write('Calling navigator.credentials.get()...');
      const assertion = await getPasskeyAssertion(request);
      write(`Assertion: credential ${assertion.credentialId}, userHandle ${assertion.pubky}`);
      const session = await approval;
      const approver = session.info.publicKey.z32();
      write(`Session from relay: ${approver}`);
      write(
        approver === assertion.pubky
          ? 'PASS: userHandle matches the approving pubky'
          : 'FAIL: userHandle does not match the approving pubky',
      );
      write(`Capabilities: ${session.info.capabilities.join(', ')}`);
    } catch (error) {
      const name = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      write(`Error: ${name}`);
    } finally {
      flow?.cancelAuthFlow();
      setBusy(false);
    }
  };

  const runEnrolment = async () => {
    setBusy(true);
    setLog([]);
    try {
      write('Calling navigator.credentials.create() to register Pubky Ring for this site (iOS)...');
      const credential = (await navigator.credentials.create({
        publicKey: {
          rp: { id: getPasskeyRpId(), name: 'Pubky' },
          user: { id: randomBytes(16), name: 'Pubky Ring', displayName: 'Pubky Ring' },
          challenge: randomBytes(32),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
          attestation: 'none',
          timeout: 120_000,
          hints: ['client-device'],
        } as PublicKeyCredentialCreationOptions,
      })) as PublicKeyCredential | null;
      write(
        credential ? `Registered credential ${base64UrlEncode(new Uint8Array(credential.rawId))}` : 'No credential',
      );
    } catch (error) {
      write(`Error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6 text-sm">
      <h1 className="text-2xl font-bold">{'Pubky Ring passkey spike'}</h1>
      <p className="text-muted-foreground">
        {'Runs a Pubky sign-in request through the OS passkey sheet. Pick Pubky Ring in the sheet.'}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all" data-testid="passkey-spike-info">
        {Object.entries(info).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-bold">{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-bold">{'Request route'}</legend>
        {ROUTES.map((option) => (
          <label key={option.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="route"
              value={option.value}
              checked={route === option.value}
              onChange={() => setRoute(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="rounded-md bg-brand px-4 py-3 font-bold text-black disabled:opacity-50"
        onClick={() => void runSignIn()}
        disabled={busy}
        data-testid="passkey-spike-sign-in"
      >
        {'Sign in with Pubky Ring passkey'}
      </button>
      <button
        type="button"
        className="rounded-md border px-4 py-3 disabled:opacity-50"
        onClick={() => void runEnrolment()}
        disabled={busy}
        data-testid="passkey-spike-enrol"
      >
        {'Register Pubky Ring for this site (iOS)'}
      </button>
      <ol className="flex flex-col gap-1 font-mono text-xs break-all" data-testid="passkey-spike-log">
        {log.map((line, index) => (
          <li key={index}>
            <span className="text-muted-foreground">{line.at}</span> {line.text}
          </li>
        ))}
      </ol>
    </main>
  );
}
