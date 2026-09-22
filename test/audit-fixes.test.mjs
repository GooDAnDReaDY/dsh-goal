import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';

describe('Audit fixes verification (#20, #21, #22, #24)', () => {
  it('Issue #21: getConfig ignores snapshot value when status is loading or error', () => {
    let capturedScope = null;
    const mockCtx = {
      inject: (deps, cb) => {
        if (deps.includes('settings')) {
          cb({
            settings: {
              register: (ns, schema, opts) => {
                const scope = {
                  status: 'loading',
                  getSnapshot: () => ({ status: scope.status, value: { maxIterations: 999 } }),
                  get: () => ({ maxIterations: 999 }),
                  subscribe: () => () => {},
                };
                capturedScope = scope;
                return scope;
              },
            },
            effect: () => {},
          });
        }
      },
      on: () => {},
      off: () => {},
      effect: () => {},
    };

    apply(mockCtx, { maxIterations: 25 });

    // When status is loading, getConfig should fallback to plugin settings, ignoring snap.value (999)
    assert.ok(capturedScope);
    const snap = capturedScope.getSnapshot();
    assert.equal(snap.status, 'loading');
    assert.equal(snap.value.maxIterations, 999);
  });

  it('Issue #22: WebServer routes guard against CSRF and cross-site requests', () => {
    let routeHandler = null;
    const mockCtx = {
      inject: () => {},
      webServer: {
        register: ({ handler }) => {
          routeHandler = handler;
          return () => {};
        },
      },
      on: () => {},
      off: () => {},
      effect: (fn) => fn(),
    };

    apply(mockCtx, {});
    assert.ok(routeHandler, 'Route handler must be registered');

    // Test 1: Cross-site Sec-Fetch-Site should be rejected with 403
    let statusCode = null;
    let resBody = '';
    const mockRes1 = {
      setHeader: () => {},
      set statusCode(val) { statusCode = val; },
      get statusCode() { return statusCode; },
      end: (data) => { resBody = data; },
    };
    const mockReq1 = {
      url: '/dsh-goal/action',
      method: 'POST',
      headers: {
        host: '127.0.0.1:3000',
        'sec-fetch-site': 'cross-site',
      },
      on: () => {},
    };

    routeHandler(mockReq1, mockRes1);
    assert.equal(mockRes1.statusCode, 403);
    assert.ok(resBody.includes('cross-site'));

    // Test 2: Origin mismatch should be rejected with 403
    statusCode = null;
    resBody = '';
    const mockRes2 = {
      setHeader: () => {},
      set statusCode(val) { statusCode = val; },
      get statusCode() { return statusCode; },
      end: (data) => { resBody = data; },
    };
    const mockReq2 = {
      url: '/dsh-goal/action',
      method: 'POST',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://malicious-site.com',
      },
      on: () => {},
    };

    routeHandler(mockReq2, mockRes2);
    assert.equal(mockRes2.statusCode, 403);
    assert.ok(resBody.includes('origin mismatch'));
  });
});
