import { notFound } from 'next/navigation';
import { getDeployEnv } from '@/config/network';
import { PasskeySpike } from '@/organisms/PasskeySpike/PasskeySpike';

/**
 * Device harness for Pubky Ring as an OS passkey provider. Reachable on staging deploys only.
 * The deploy environment is a runtime value, so the gate is evaluated per request.
 */
export const dynamic = 'force-dynamic';

export default function PasskeySpikePage() {
  if (getDeployEnv() === 'production') notFound();
  return <PasskeySpike />;
}
