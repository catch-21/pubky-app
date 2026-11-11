type Env = Record<string, string | undefined>;

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** Pubky Ring's Android application ID. */
export const DEFAULT_ANDROID_PACKAGE = 'to.pubky.ring';

export function getPasskeyAssetLinks(env: Env) {
  const fingerprints = list(env.PASSKEY_ANDROID_CERT_SHA256).map((fingerprint) => fingerprint.toUpperCase());
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ['delegate_permission/common.get_login_creds'],
      target: {
        namespace: 'android_app',
        package_name: env.PASSKEY_ANDROID_PACKAGE?.trim() || DEFAULT_ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export function getAppleAppSiteAssociation(env: Env) {
  return { webcredentials: { apps: list(env.PASSKEY_IOS_APP_IDS) } };
}
