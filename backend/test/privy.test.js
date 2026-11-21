import assert from 'node:assert/strict';
import test from 'node:test';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { api } from '../server/handler.js';
import { createPrivyIdentity } from '../server/privy.js';

test('uses only a correctly signed Privy account for wallet requests', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const verificationKey = await exportSPKI(publicKey);
  const appId = 'wallet-test-app';
  const userId = 'did:privy:walletuser1234';
  const origin = 'https://depthdesk.example';
  const url = 'https://api.depthdesk.example/api/session';
  const authenticateWallet = await createPrivyIdentity(appId, verificationKey.replaceAll('\n', '\\n'));
  const env = { authenticateWallet, DEPTHDESK_ALLOWED_ORIGINS: origin };
  const issue = (audience, expiration, key = privateKey) => new SignJWT({})
    .setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(audience)
    .setSubject(userId).setIssuedAt().setExpirationTime(expiration).sign(key);
  const request = token => api(new Request(url, { headers: {
    origin, 'oai-authenticated-user-id': 'spoofed-account', authorization: 'Bearer ' + token
  } }), env);

  const valid = await request(await issue(appId, '10m'));
  assert.deepEqual(await valid.json(), { user: { name: 'Member er1234' } });
  assert.equal(valid.headers.get('access-control-allow-origin'), origin);
  const outsider = await generateKeyPair('ES256');
  const rejected = await Promise.all([
    issue('wrong-app', '10m'), issue(appId, '-10m'), issue(appId, '10m', outsider.privateKey)
  ]);
  for (const token of rejected) assert.deepEqual(await (await request(token)).json(), { user: null });

  const preflight = await api(new Request(url, { method: 'OPTIONS', headers: {
    origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization'
  } }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
});
