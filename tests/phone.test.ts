import assert from 'node:assert/strict';
import test from 'node:test';
import { extractQuickTunnelOrigin, parsePhonePort, resolveNpmCli } from '../scripts/phone.js';

test('extrait l’origine HTTPS de la bannière Cloudflare sans lancer de tunnel', () => {
  assert.equal(
    extractQuickTunnelOrigin(
      [
        'INF Your quick Tunnel has been created!',
        '| https://silent-cloud-example.trycloudflare.com |',
      ].join('\n'),
    ),
    'https://silent-cloud-example.trycloudflare.com',
  );
  assert.equal(
    extractQuickTunnelOrigin('url=https://ABC-123.trycloudflare.com/'),
    'https://abc-123.trycloudflare.com',
  );
});

test('ignore les URL de documentation et les origines étrangères ou déguisées', () => {
  for (const output of [
    'https://developers.cloudflare.com/tunnel/',
    'http://example.trycloudflare.com',
    'https://example.trycloudflare.com.evil.test',
    'https://example.trycloudflare.com@evil.test',
    'https://example.trycloudflare.com:8443',
    'https://-example.trycloudflare.com',
    'https://example-.trycloudflare.com',
    `https://${'a'.repeat(64)}.trycloudflare.com`,
    'No tunnel created yet',
  ])
    assert.equal(extractQuickTunnelOrigin(output), undefined, output);
});

test('le mode téléphone utilise 5174 par défaut et valide le port explicite', () => {
  assert.equal(parsePhonePort(undefined), 5174);
  assert.equal(parsePhonePort('5175'), 5175);
  assert.equal(parsePhonePort(' 5176 '), 5176);
});

test('refuse les ports mal formés et hors limites sans toucher à un serveur existant', () => {
  for (const value of ['', '0', '-1', '65536', '5174.5', '51e2', 'invalid']) {
    assert.throws(() => parsePhonePort(value), /PHONE_PORT/);
  }
});

test('trouve npm pour une invocation Node directe sans npm_execpath', async () => {
  const npmCli = await resolveNpmCli('');
  assert.match(npmCli, /npm-cli\.js$/);
});
