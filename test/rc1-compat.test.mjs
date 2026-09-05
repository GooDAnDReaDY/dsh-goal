import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { Config, apply as applyHost } from '../lib/index.js';

test('package.json keeps dsh.client.inject empty: stale rc.0 module names are gone', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.deepEqual(pkg.dsh.client.inject, []);
});

test('settings schema is a schemastery schema function with plugin defaults', () => {
  assert.equal(typeof Config, 'function');
  const resolved = Config({});
  assert.equal(resolved.maxIterations, 25);
  assert.equal(resolved.autoDrive, true);
  assert.equal(resolved.enableSound, true);

  const custom = Config({ maxIterations: 7, autoDrive: false, enableSound: false });
  assert.equal(custom.maxIterations, 7);
  assert.equal(custom.autoDrive, false);
  assert.equal(custom.enableSound, false);
});

test('host apply registers settings with a schema function, not null', () => {
  const registered = [];
  const fakeScope = { get: () => ({}) };
  const ctx = {
    inject: (services, cb) => {
      if (services[0] === 'settings') {
        cb({
          settings: {
            register: (ns, schema, opts) => {
              registered.push([ns, schema, opts]);
              return fakeScope;
            },
          },
        });
      }
      if (services[0] === 'tools') cb({ tools: {} });
    },
    effect: (cb) => {
      cb();
      return () => {};
    },
    on: () => {},
    off: () => {},
    webServer: { register: () => () => {} },
  };

  applyHost(ctx, {});

  assert.equal(registered.length, 1);
  const [ns, schema, opts] = registered[0];
  assert.equal(ns, 'dsh-goal');
  assert.equal(typeof schema, 'function', 'rc.1 settings.register expects a schemastery schema, not null');
  assert.ok(opts && typeof opts.base === 'object');
});

test('client bundle declares rc.1 service inject and registers the settings card', async () => {
  const loads = [];
  globalThis.window = { __ModuleLoader__: { load: (def) => loads.push(def) } };
  await import('../lib/client.js');

  assert.equal(loads.length, 1);
  const def = loads[0];
  assert.equal(def.id, '@goodandready/dsh-goal');

  const React = {
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: (v) => ({ current: v }),
    useCallback: (fn) => fn,
    createElement: () => ({}),
    Fragment: 'Fragment',
  };
  const plugin = def.factory((spec) => {
    if (spec === 'react') return React;
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
      throw new Error('absent from the rc.1 client table (guarded require must survive this)');
    }
    throw new Error(`unexpected require: ${spec}`);
  });

  assert.deepEqual(plugin.inject, ['slots', 'locale', 'settingsScope']);
  assert.equal(typeof plugin.apply, 'function');

  const registered = [];
  const bound = { namespace: null };
  const scopeStub = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: {}, user: {} }),
    subscribe: () => () => {},
    set: async () => {},
  };
  const ctx = {
    locale: { register: () => {} },
    settingsScope: {
      bind: (spec) => {
        bound.namespace = spec.namespace;
        return scopeStub;
      },
    },
    slots: { register: (opts, component) => registered.push([opts, component]) },
  };
  plugin.apply(ctx);

  assert.equal(bound.namespace, 'dsh-goal');
  const cardEntry = registered.find(([opts]) => opts.name === 'settings.plugin.item');
  assert.ok(cardEntry, 'settings.plugin.item slot must be registered');
  assert.equal(cardEntry[0].key, 'dsh-goal', 'slot key must equal the settings namespace');
  assert.equal(cardEntry[0].locale, 'dsh-goal');
  const injected = cardEntry[0].inject();
  assert.equal(injected.scope, scopeStub, 'card receives the bound settings scope');
  assert.ok(registered.some(([opts]) => opts.name === 'conversation.input.dock'), 'must register into conversation.input.dock');
});
