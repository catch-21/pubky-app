import { NextResponse } from 'next/server';
import { getAppleAppSiteAssociation } from '@/libs/passkey/association';

/**
 * Associated domains for Pubky Ring on iOS. Browser passkey sign-in does not need it; it lets the
 * Ring app use this domain's credentials natively later. Configure with PASSKEY_IOS_APP_IDS
 * (comma-separated `<TEAM_ID>.<bundle id>`). Served as JSON without a file extension, as Apple requires.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getAppleAppSiteAssociation(process.env), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
