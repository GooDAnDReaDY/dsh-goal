import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { Config, plainConfig, apply as applyHost } from '../lib/index.js';

test('package.json keeps dsh.client.inject empty: stale rc.0 module names are gone', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.deepEqual(pkg.dsh.client.inject, ["@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings"]);
});

test('settings schema is a schemastery schema function with plugin defaults', () => {
  assert.equal(typeof Config, 'function');
  const resolved = plainConfig(Config({}));
  assert.equal(resolved.maxIterations, 25);
  assert.equal(resolved.autoDrive, true);
  assert.equal(resolved.enableSound, true);

  const custom = plainConfig(Config({ maxIterations: 7, autoDrive: false, enableSound: false }));
  assert.equal(custom.maxIterations, 7);
  assert.equal(custom.autoDrive, false);
  assert.equal(custom.enableSound, false);
});

test('host apply unwraps the volatile boxes the entry config hands it', () => {
  let registerCalls = 0;
  const ctx = {
    inject: (services, cb) => {
      if (services[0] === 'settings') {
        // settings.register is gone from both supported hosts; if it is ever called
        // again, the plugin would mount a seat that no longer exists.
        registerCalls++;
        cb({ settings: { register: () => ({}) } });
      }
      if (services[0] === 'tools') cb({ tools: {} });
    },
    effect: (cb) => { cb(); return () => {}; },
    on: () => {},
    off: () => {},
    webServer: { register: () => () => {} },
  };

  // A real entry config: volatile fields come back as Volatile boxes.
  const entryConfig = Config({ maxIterations: 7, autoDrive: false });
  assert.equal(typeof entryConfig.maxIterations.get, 'function',
    'the host must be handing us a Volatile box, otherwise this test proves nothing');

  applyHost(ctx, entryConfig);

  assert.equal(registerCalls, 0, 'apply must not call the retired settings.register');
  // Reading through the plugin yields plain values, not boxes.
  assert.equal(plainConfig(entryConfig).maxIterations, 7);
  assert.equal(plainConfig(entryConfig).autoDrive, false);
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

  assert.deepEqual(plugin.inject, ['slots', 'locale', 'configForms']);
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
    configForms: { get: (spec) => {
        bound.namespace = typeof spec === 'string' ? spec : spec.namespace;
        return scopeStub;
      },
    },
    slots: { register: (opts, component) => registered.push([opts, component]) },
  };
  plugin.apply(ctx);

  assert.equal(bound.namespace, 'dsh-goal');
  // settings.plugin.item was retired before 0.1.7-rc.2 and the client no longer
  // registers it; the live seat is the Plugins page row.
  assert.ok(!registered.some(([opts]) => opts.name === 'settings.plugin.item'),
    'the retired settings.plugin.item seat must stay removed');
  const cardEntry = registered.find(([opts]) => opts.name === 'plugins.row.config');
  assert.ok(cardEntry, 'plugins.row.config seat must be registered');
  assert.equal(cardEntry[0].key, '@goodandready/dsh-goal#dsh-goal',
    "row seat key follows the '<package>#<row id>' convention");
  assert.equal(cardEntry[0].locale, 'dsh-goal');
  const injected = cardEntry[0].inject();
  assert.equal(injected.scope, scopeStub, 'card receives the bound settings scope');
  assert.ok(registered.some(([opts]) => opts.name === 'conversation.input.dock'), 'must register into conversation.input.dock');
});
