import { getDefaultHttpRelay } from '@/config/network';

/**
 * Tells Pubky Ring's iOS passkey extension which relay holds this site's request mailbox
 * (pubky-ring docs/passkey-provider/PLAN.md, section 14 decision 6).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { mailboxRelay: getDefaultHttpRelay() },
    { headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } },
  );
}
