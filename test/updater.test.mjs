import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTrustedUpdateRequest, isNewerVersion, registerPluginUpdater } from '../lib/updater.js';

// The updater endpoint reports the version installed from package.json, so the test
// tracks that file instead of hard-coding a release number.
const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test('Plugin Updater: isNewerVersion handles semver and prereleases correctly', () => {
  assert.equal(isNewerVersion('0.2.2', '0.2.3'), true, '0.2.3 is newer than 0.2.2');
  assert.equal(isNewerVersion('0.2.3', '0.2.3'), false, '0.2.3 is not newer than 0.2.3');
  assert.equal(isNewerVersion('0.2.4', '0.2.3'), false, '0.2.3 is not newer than 0.2.4');
  assert.equal(isNewerVersion('0.2.3-rc.1', '0.2.3'), true, '0.2.3 release is newer than 0.2.3-rc.1');
  assert.equal(isNewerVersion('0.2.3', '0.2.4-rc.1'), true, '0.2.4-rc.1 is newer than 0.2.3');
});

test('Plugin Updater: isTrustedUpdateRequest enforces loopback, origin, and update header', () => {
  // Missing update header -> reject
  assert.equal(isTrustedUpdateRequest({
    headers: { host: 'localhost:3080', origin: 'http://localhost:3080' },
    socket: { remoteAddress: '127.0.0.1' },
  }), false, 'Missing update header rejected');

  // External remote address -> reject
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: 'localhost:3080', origin: 'http://localhost:3080' },
    socket: { remoteAddress: '192.168.1.50' },
  }), false, 'Non-loopback remote address rejected');

  // Origin mismatch -> reject
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: 'localhost:3080', origin: 'http://evil.com' },
    socket: { remoteAddress: '127.0.0.1' },
  }), false, 'Origin mismatch rejected');

  // Cross-site sec-fetch-site -> reject
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: 'localhost:3080', origin: 'http://localhost:3080', 'sec-fetch-site': 'cross-site' },
    socket: { remoteAddress: '127.0.0.1' },
  }), false, 'Cross-site request rejected');

  // Valid loopback same-origin request -> accept
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: 'localhost:3080', origin: 'http://localhost:3080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
  }), true, 'Valid loopback same-origin accepted');
});

test('Plugin Updater: GET endpoint returns version payload and registers with host webServer', async () => {
  let registeredRoute = null;
  const mockWebServer = {
    register: (route) => {
      registeredRoute = route;
      return () => { registeredRoute = null; };
    },
  };

  const mockCtx = {
    webServer: mockWebServer,
  };

  const unmount = registerPluginUpdater(mockCtx, {
    endpoint: '/api/dsh-goal/update',
    packageName: '@goodandready/dsh-goal',
    manifestUrl: new URL('../package.json', import.meta.url),
  });

  assert.ok(registeredRoute, 'Route should be registered');
  assert.equal(registeredRoute.path, '/api/dsh-goal/update');
  assert.equal(registeredRoute.kind, 'exact');

  // Test GET request
  let status = null;
  let headers = {};
  let body = null;

  const mockReq = {
    method: 'GET',
    headers: { host: 'localhost:3080' },
    socket: { remoteAddress: '127.0.0.1' },
  };

  const mockRes = {
    writeHead: (s, h) => { status = s; headers = h; },
    end: (b) => { body = b; },
  };

  await registeredRoute.handler(mockReq, mockRes);

  assert.equal(status, 200);
  assert.equal(headers['content-type'], 'application/json; charset=utf-8');
  assert.ok(body, 'Body must be returned');

  const parsed = JSON.parse(body);
  assert.equal(parsed.packageName, '@goodandready/dsh-goal');
  assert.equal(parsed.currentVersion, pkgVersion);
  assert.equal(typeof parsed.updateAvailable, 'boolean');

  // Test POST request without trusted headers -> 403
  let postStatus = null;
  let postBody = null;
  const untrustedReq = {
    method: 'POST',
    headers: { host: 'localhost:3080' }, // missing x-dsh-plugin-update
    socket: { remoteAddress: '127.0.0.1' },
  };
  const postRes = {
    writeHead: (s) => { postStatus = s; },
    end: (b) => { postBody = b; },
  };

  await registeredRoute.handler(untrustedReq, postRes);
  assert.equal(postStatus, 403);
  const parsedPost = JSON.parse(postBody);
  assert.equal(parsedPost.error, 'Rejected non-local or cross-origin update request.');

  unmount();
  assert.equal(registeredRoute, null, 'Route should be unregistered on unmount');
});
