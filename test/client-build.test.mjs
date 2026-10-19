import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcClientDir = path.join(rootDir, 'src', 'client');
const clientPath = path.join(rootDir, 'lib', 'client.js');
const buildScript = path.join(rootDir, 'scripts', 'build-client.mjs');

test('Client Decomposition (Issue #150): src/client contains modular fragments', () => {
  assert.ok(fs.existsSync(srcClientDir), 'src/client must exist');
  const fragments = fs.readdirSync(srcClientDir).filter((f) => f.endsWith('.js'));
  assert.ok(fragments.length >= 10, 'Expected at least 10 client fragments');
  assert.ok(fragments.includes('00-header.js'), 'Must contain 00-header.js');
  assert.ok(fragments.includes('10-icons.js'), 'Must contain 10-icons.js');
  assert.ok(fragments.includes('20-styles.js'), 'Must contain 20-styles.js');
  assert.ok(fragments.includes('30-audio.js'), 'Must contain 30-audio.js');
  assert.ok(fragments.includes('40-reports.js'), 'Must contain 40-reports.js');
  assert.ok(fragments.includes('50-modal-details.js'), 'Must contain 50-modal-details.js');
  assert.ok(fragments.includes('60-modal-quicklaunch.js'), 'Must contain 60-modal-quicklaunch.js');
  assert.ok(fragments.includes('70-dock-banner.js'), 'Must contain 70-dock-banner.js');
  assert.ok(fragments.includes('80-settings-logic.js'), 'Must contain 80-settings-logic.js');
  assert.ok(fragments.includes('90-settings-card.js'), 'Must contain 90-settings-card.js');
  assert.ok(fragments.includes('100-locales.js'), 'Must contain 100-locales.js');
  assert.ok(fragments.includes('110-slots-registration.js'), 'Must contain 110-slots-registration.js');
});

test('Client Decomposition (Issue #150): build-client.mjs --check succeeds with no drift', () => {
  const out = execFileSync('node', [buildScript, '--check'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  assert.match(out, /up to date/);
});

test('Client Decomposition (Issue #150): build-client.mjs generates byte-exact lib/client.js', () => {
  const tmpOut = path.join(os.tmpdir(), `test-client-${Date.now()}.js`);
  try {
    execFileSync('node', [buildScript, '--out', tmpOut], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    const expected = fs.readFileSync(clientPath, 'utf8');
    const actual = fs.readFileSync(tmpOut, 'utf8');
    assert.equal(actual, expected, 'Generated client must match lib/client.js exactly');
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});

test('Client Decomposition (Issue #150): build-client.mjs --check detects drift when target differs', () => {
  const tmpOut = path.join(os.tmpdir(), `test-drift-${Date.now()}.js`);
  fs.writeFileSync(tmpOut, '// drifted content\n', 'utf8');
  try {
    assert.throws(
      () => {
        execFileSync('node', [buildScript, '--check', '--out', tmpOut], {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      },
      (err) => err.status === 1,
      'Must exit 1 when drift is detected'
    );
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});
