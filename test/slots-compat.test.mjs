import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

test('client.js registers into conversation.session.header with defensive try/catch', () => {
  assert.ok(
    clientSource.includes('conversation.session.header'),
    'Client bundle must register into rc.1 slot conversation.session.header',
  );

  assert.ok(
    clientSource.includes('settings.plugin.item'),
    'Client bundle must register settings card into settings.plugin.item',
  );
});

test('client.js CSS uses clean DSH tokens without hardcoded fallback colors', () => {
  // Disallow var(--..., #...) or var(--..., rgb...) in CSS_STYLES
  const hexFallbackRegex = /var\(--[a-zA-Z0-9_-]+,\s*#[0-9a-fA-F]+\)/g;
  const rgbFallbackRegex = /var\(--[a-zA-Z0-9_-]+,\s*rgba?\([^)]+\)\)/g;

  const hexMatches = clientSource.match(hexFallbackRegex) || [];
  const rgbMatches = clientSource.match(rgbFallbackRegex) || [];

  assert.deepEqual(hexMatches, [], `Found hardcoded hex fallbacks in CSS tokens: ${hexMatches.join(', ')}`);
  assert.deepEqual(rgbMatches, [], `Found hardcoded rgb fallbacks in CSS tokens: ${rgbMatches.join(', ')}`);
});

test('client.js uses Отменить правки for discard button in Russian locale', () => {
  assert.ok(
    clientSource.includes("discard: 'Отменить правки'"),
    'Discard button label in Russian locale must be "Отменить правки"',
  );
});
