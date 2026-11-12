import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasskeyCeremonyError, type PasskeyClientCapabilities } from '@/libs/passkey/passkey';
import { toast } from '@/molecules/Toaster/toast';
import { mockRingSession } from '@/test-utils/pubky';
import { PASSKEY_APPROVAL_GRACE_MS, usePasskeyAuth } from './usePasskeyAuth';

const mockGetPasskeyAuthUrl = vi.fn();
const mockInitializeAuthenticatedSession = vi.fn();
const mockPrepare = vi.fn();
const mockGetAssertion = vi.fn();
const mockIsIos = vi.fn(() => false);
const mockIsSupported = vi.fn((_capabilities?: PasskeyClientCapabilities) => true);
const mockReadCapabilities = vi.fn(async (): Promise<PasskeyClientCapabilities> => ({}));

vi.mock('@/molecules/Toaster/toast');
vi.mock('@/config/network', () => ({ getDefaultHttpRelay: () => 'https://relay.example.com/inbox' }));
vi.mock('@/libs/pwa/platform', () => ({ isIosDevice: () => mockIsIos(), isAndroidIntentDevice: () => true }));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    getPasskeyAuthUrl: (...args: unknown[]) => mockGetPasskeyAuthUrl(...args),
    initializeAuthenticatedSession: (...args: unknown[]) => mockInitializeAuthenticatedSession(...args),
  },
}));
vi.mock('@/libs/passkey/passkey', async () => {
  const actual = await vi.importActual<typeof import('@/libs/passkey/passkey')>('@/libs/passkey/passkey');
  return {
    ...actual,
    isPasskeySignInSupported: (capabilities?: PasskeyClientCapabilities) => mockIsSupported(capabilities),
    readPasskeyClientCapabilities: () => mockReadCapabilities(),
    preparePasskeyRequest: (...args: unknown[]) => mockPrepare(...args),
    getPasskeyAssertion: (...args: unknown[]) => mockGetAssertion(...args),
  };
});

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const startFlow = (
  session = mockRingSession(['/pub/pubky.app/:rw'], PUBKY),
  awaitApproval: Promise<unknown> = Promise.resolve(session),
) => {
  const cancelAuthFlow = vi.fn();
  mockGetPasskeyAuthUrl.mockResolvedValue({
    authorizationUrl: 'pubkyauth://signin_grant?cid=demo.example',
    awaitApproval,
    cancelAuthFlow,
  });
  return { cancelAuthFlow, session };
};

describe('usePasskeyAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupported.mockReturnValue(true);
    mockReadCapabilities.mockResolvedValue({});
    mockPrepare.mockResolvedValue({ options: {}, envelope: new Uint8Array() });
    mockInitializeAuthenticatedSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adopts the session when the passkey names the approving pubky', async () => {
    const { session } = startFlow();
    mockGetAssertion.mockResolvedValue({ pubky: PUBKY, credentialId: 'abc' });
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));
    await waitFor(() => expect(result.current.isSupported).toBe(true));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('session'));
    expect(mockPrepare).toHaveBeenCalledWith({
      authorizationUrl: 'pubkyauth://signin_grant?cid=demo.example',
      relay: 'https://relay.example.com/inbox',
      capabilities: {},
    });
    expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session });
    expect(result.current.isPending).toBe(false);
  });

  it('passes the client capabilities to the request so it can pick immediate mode', async () => {
    const capabilities = { immediateGet: true };
    mockReadCapabilities.mockResolvedValue(capabilities);
    startFlow();
    mockGetAssertion.mockResolvedValue({ pubky: PUBKY, credentialId: 'abc' });
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));
    await waitFor(() => expect(mockIsSupported).toHaveBeenCalledWith(capabilities));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('session'));
    expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({ capabilities }));
  });

  it('turns support off when the client capabilities rule the passkey out', async () => {
    mockReadCapabilities.mockResolvedValue({ passkeyPlatformAuthenticator: false });
    mockIsSupported.mockImplementation((capabilities) => capabilities?.passkeyPlatformAuthenticator !== false);
    const { result } = renderHook(() => usePasskeyAuth());

    await waitFor(() => expect(mockReadCapabilities).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isSupported).toBe(false));
  });

  it('refuses a session approved by a different pubky and offers the deep link', async () => {
    const { cancelAuthFlow } = startFlow(mockRingSession(['/pub/pubky.app/:rw'], 'attacker-pubky'));
    mockGetAssertion.mockResolvedValue({ pubky: PUBKY, credentialId: 'abc' });
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('passkey-failed'));
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
    expect(cancelAuthFlow).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it.each([
    ['a cancelled or empty sheet', new PasskeyCeremonyError('cancelled', 'NotAllowedError')],
    ['an assertion without a pubky', new PasskeyCeremonyError('no-user-handle', 'no userHandle')],
    ['a failed ceremony', new PasskeyCeremonyError('failed', 'SecurityError')],
  ])('reports %s as a passkey failure without a toast', async (_label, error) => {
    const { cancelAuthFlow } = startFlow();
    mockGetAssertion.mockRejectedValue(error);
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('passkey-failed'));
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
    expect(cancelAuthFlow).toHaveBeenCalled();
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('reports a missing approval after the passkey as a passkey failure', async () => {
    vi.useFakeTimers();
    const { cancelAuthFlow } = startFlow(undefined, new Promise(() => undefined));
    mockGetAssertion.mockResolvedValue({ pubky: PUBKY, credentialId: 'abc' });
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PASSKEY_APPROVAL_GRACE_MS);
    });

    expect(onAttemptSettled).toHaveBeenCalledWith('passkey-failed');
    expect(cancelAuthFlow).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('reports an unsupported request as a passkey failure', async () => {
    const { cancelAuthFlow } = startFlow();
    mockPrepare.mockRejectedValue(new PasskeyCeremonyError('unsupported', 'unsupported'));
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('passkey-failed'));
    expect(cancelAuthFlow).toHaveBeenCalled();
    expect(mockGetAssertion).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps the relay error toast when the mailbox cannot be posted', async () => {
    startFlow();
    mockPrepare.mockRejectedValue(new PasskeyCeremonyError('mailbox', 'relay down'));
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('failed'));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        description: 'Could not reach the Pubky relay. Check your connection and try again.',
      }),
    );
  });

  it('keeps the error toast when the session cannot be set up', async () => {
    startFlow();
    mockGetAssertion.mockResolvedValue({ pubky: PUBKY, credentialId: 'abc' });
    mockInitializeAuthenticatedSession.mockRejectedValue(new Error('bootstrap failed'));
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('failed'));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('asks for a second tap when Safari refuses the call outside the gesture', async () => {
    mockIsIos.mockReturnValue(true);
    const { session } = startFlow();
    mockGetAssertion
      .mockRejectedValueOnce(new PasskeyCeremonyError('cancelled', 'NotAllowedError'))
      .mockResolvedValueOnce({ pubky: PUBKY, credentialId: 'abc' });
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());
    await waitFor(() => expect(result.current.needsTap).toBe(true));
    expect(onAttemptSettled).not.toHaveBeenCalled();

    act(() => result.current.continuePasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('session'));
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockGetAssertion).toHaveBeenCalledTimes(2);
    expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session });
    mockIsIos.mockReturnValue(false);
  });
});
