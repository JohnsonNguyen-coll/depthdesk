import { importSPKI, jwtVerify } from 'jose';

export async function createPrivyIdentity(appId, verificationKey) {
  if (!appId || !verificationKey) return null;
  const key = await importSPKI(verificationKey.replaceAll('\\n', '\n').trim(), 'ES256');
  return async request => {
    const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token || token.length > 8192) return null;
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['ES256'], issuer: 'privy.io', audience: appId, requiredClaims: ['sub', 'iat', 'exp']
      });
      if (typeof payload.sub !== 'string' || !/^did:privy:[a-z0-9]+$/i.test(payload.sub)) return null;
      return { id: payload.sub, name: 'Member ' + payload.sub.slice(-6) };
    } catch {
      return null;
    }
  };
}
