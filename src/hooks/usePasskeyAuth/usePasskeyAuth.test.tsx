import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasskeyCeremonyError } from '@/libs/passkey/passkey';
import { toast } from '@/molecules/Toaster/toast';
import { mockRingSession } from '@/test-utils/pubky';
import { usePasskeyAuth } from './usePasskeyAuth';

const mockGetPasskeyAuthUrl = vi.fn();
const mockInitializeAuthenticatedSession = vi.fn();
const mockPrepare = vi.fn();
const mockGetAssertion = vi.fn();
const mockIsIos = vi.fn(() => false);

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
    isPasskeySignInSupported: () => true,
    preparePasskeyRequest: (...args: unknown[]) => mockPrepare(...args),
    getPasskeyAssertion: (...args: unknown[]) => mockGetAssertion(...args),
  };
});

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const startFlow = (session = mockRingSession(['/pub/pubky.app/:rw'], PUBKY)) => {
  const cancelAuthFlow = vi.fn();
  mockGetPasskeyAuthUrl.mockResolvedValue({
    authorizationUrl: 'pubkyauth://signin_grant?cid=demo.example',
    awaitApproval: Promise.resolve(session),
    cancelAuthFlow,
  });
  return { cancelAuthFlow, session };
};

describe('usePasskeyAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockResolvedValue({ options: {}, envelope: new Uint8Array() });
    mockInitializeAuthenticatedSession.mockResolvedValue(undefined);
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
    });
    expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session });
    expect(result.current.isPending).toBe(false);
  });

  it('refuses a session approved by a different pubky', async () => {
    const { cancelAuthFlow } = startFlow(mockRingSession(['/pub/pubky.app/:rw'], 'attacker-pubky'));
    mockGetAssertion.mockResolvedValue({ pubky: PUBKY, credentialId: 'abc' });
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('failed'));
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
    expect(cancelAuthFlow).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('reports a cancelled sheet so the page can offer the deep link again', async () => {
    const { cancelAuthFlow } = startFlow();
    mockGetAssertion.mockRejectedValue(new PasskeyCeremonyError('cancelled', 'NotAllowedError'));
    const onAttemptSettled = vi.fn();
    const { result } = renderHook(() => usePasskeyAuth({ onAttemptSettled }));

    act(() => result.current.startPasskeyAuth());

    await waitFor(() => expect(onAttemptSettled).toHaveBeenCalledWith('cancelled'));
    expect(cancelAuthFlow).toHaveBeenCalled();
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
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
