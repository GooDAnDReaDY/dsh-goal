import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatTemplateVariables, instantiateTemplate, GOAL_TEMPLATES } from '../lib/engine-templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Issue #165: formatTemplateVariables interpolates placeholders with provided map', () => {
  const tpl = 'Investigate bug {{issueNumber}} in {{targetModule}}: {{description}}';
  const vars = {
    issueNumber: '#165',
    targetModule: 'src/client/60-modal-quicklaunch.js',
    description: 'Dynamic variables for templates',
  };

  const formatted = formatTemplateVariables(tpl, vars);
  assert.equal(formatted, 'Investigate bug #165 in src/client/60-modal-quicklaunch.js: Dynamic variables for templates');

  // Handles empty or missing keys cleanly
  const partial = formatTemplateVariables(tpl, { issueNumber: '#42' });
  assert.equal(partial, 'Investigate bug #42 in :');

  // Handles edge cases
  assert.equal(formatTemplateVariables('', vars), '');
  assert.equal(formatTemplateVariables(null, vars), '');
  assert.equal(formatTemplateVariables('No placeholders here', vars), 'No placeholders here');
});

test('Issue #165: instantiateTemplate applies custom inputs to title and description', () => {
  const customInputs = {
    targetFile: 'lib/routes.js',
    lineThreshold: '400',
  };

  const res = instantiateTemplate('refactor-module', customInputs);
  assert.ok(res);
  assert.equal(res.templateId, 'refactor-module');
  assert.equal(res.title, 'Refactor lib/routes.js');
  assert.equal(res.description, 'Decompose lib/routes.js to < 400 lines');
  assert.equal(res.milestones.length, 4);
});

test('Issue #165: Client fragment 00-header defines QUICK_LAUNCH_TEMPLATES with variables', () => {
  const clientHeader = fs.readFileSync(path.join(rootDir, 'src', 'client', '00-header.js'), 'utf8');

  // Verify formatQuickLaunchPrompt helper exists
  assert.ok(clientHeader.includes('function formatQuickLaunchPrompt('));

  // Verify all 10 templates have variables defined
  const expectedTemplates = ['fix', 'refactor', 'tests', 'review', 'feature', 'security', 'docs', 'upgrade', 'cleanup', 'perf'];
  for (const tid of expectedTemplates) {
    assert.ok(clientHeader.includes(`id: '${tid}'`), `Template '${tid}' must be present in QUICK_LAUNCH_TEMPLATES`);
  }

  assert.ok(clientHeader.includes('issueNumber'));
  assert.ok(clientHeader.includes('targetModule'));
  assert.ok(clientHeader.includes('targetFile'));
  assert.ok(clientHeader.includes('featureName'));
});

test('Issue #165: Client 60-modal-quicklaunch renders variables box and live prompt preview', () => {
  const modalCode = fs.readFileSync(path.join(rootDir, 'src', 'client', '60-modal-quicklaunch.js'), 'utf8');
  assert.ok(modalCode.includes('activeQuickTpl'));
  assert.ok(modalCode.includes('quickTplVars'));
  assert.ok(modalCode.includes('dsh-goal-tpl-vars-box'));
  assert.ok(modalCode.includes('formatQuickLaunchPrompt'));
});
