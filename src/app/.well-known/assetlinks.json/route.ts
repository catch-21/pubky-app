import { NextResponse } from 'next/server';
import { getPasskeyAssetLinks } from '@/libs/passkey/association';

/**
 * Digital Asset Links for the Pubky Ring Android app. Browser passkey sign-in does not need it;
 * it lets Ring use this domain's credentials natively later. Configure with
 * PASSKEY_ANDROID_PACKAGE and PASSKEY_ANDROID_CERT_SHA256 (comma-separated fingerprints).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getPasskeyAssetLinks(process.env), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
