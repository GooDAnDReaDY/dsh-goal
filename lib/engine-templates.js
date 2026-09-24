import { MilestoneStatus } from './goal-engine-constants.js';

/**
 * Standard engineering goal templates
 */
export const GOAL_TEMPLATES = [
  {
    id: 'refactor-module',
    title: 'Refactor Module < 600 Lines',
    description: 'Decompose oversized source files into cohesive sub-modules while preserving test suites',
    inputs: [
      { key: 'targetFile', label: 'Target File Path', placeholder: 'lib/goal-engine.js', required: true },
      { key: 'lineThreshold', label: 'Max Lines Target', placeholder: '500', defaultValue: '500' },
    ],
    defaultMilestones: [
      { id: 'm-1', title: 'Analyze target module responsibilities and candidate sub-helpers' },
      { id: 'm-2', title: 'Extract cohesive helper functions into independent modules', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Update main module imports and re-exports', dependsOn: ['m-2'] },
      { id: 'm-4', title: 'Verify test suite and assert line counts < threshold', dependsOn: ['m-3'] },
    ],
  },
  {
    id: 'bugfix-regression',
    title: 'Bugfix & Regression Suite',
    description: 'Diagnose issue root cause, write failing regression test, implement fix, and verify',
    inputs: [
      { key: 'issueId', label: 'Issue # or Title', placeholder: '#83 or Bug description', required: true },
      { key: 'testFile', label: 'Test File Path', placeholder: 'test/bugfix.test.mjs', required: true },
    ],
    defaultMilestones: [
      { id: 'm-1', title: 'Reproduce bug and create failing regression test' },
      { id: 'm-2', title: 'Implement targeted fix in codebase', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Verify regression test passes without side effects', dependsOn: ['m-2'] },
      { id: 'm-4', title: 'Run full repository test suite and check cleanliness', dependsOn: ['m-3'] },
    ],
  },
  {
    id: 'dsh-plugin-standard',
    title: 'DSH Plugin Conformance Standard',
    description: 'Audit and align DeepSeek Harness plugin to Cordis, bilingual i18n, and UI standards',
    inputs: [
      { key: 'pluginName', label: 'Plugin Package Name', placeholder: '@goodandready/dsh-example', required: true },
    ],
    defaultMilestones: [
      { id: 'm-1', title: 'Verify Cordis lifecycle, service injection, and package.json exports' },
      { id: 'm-2', title: 'Enforce bilingual en/zh dictionary and purge hardcoded locales', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Check semantic design tokens (--dsw-alias-*) and UI slots', dependsOn: ['m-2'] },
      { id: 'm-4', title: 'Run preflight checks and dry-run npm packaging', dependsOn: ['m-3'] },
    ],
  },
  {
    id: 'security-preflight',
    title: 'Security Audit & Preflight',
    description: 'Check CSRF protection, origin validation, path traversal, and payload limits',
    inputs: [
      { key: 'routesFile', label: 'Routes Module Path', placeholder: 'lib/routes.js', defaultValue: 'lib/routes.js' },
    ],
    defaultMilestones: [
      { id: 'm-1', title: 'Audit HTTP endpoints for origin/referer and Sec-Fetch-Site guards' },
      { id: 'm-2', title: 'Verify filesystem boundaries and path traversal confinement', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Run automated security unit test suite', dependsOn: ['m-2'] },
    ],
  },
  {
    id: 'i18n-hygiene',
    title: 'i18n Localization & Zero-Cyrillic Hygiene',
    description: 'Purge hardcoded strings and comments from source code and verify test gates',
    inputs: [
      { key: 'targetDir', label: 'Target Directory', placeholder: 'lib/', defaultValue: 'lib/' },
    ],
    defaultMilestones: [
      { id: 'm-1', title: 'Scan target directory for non-ASCII/Cyrillic characters' },
      { id: 'm-2', title: 'Migrate messages to external locale dictionaries', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Assert repository-hygiene automated test passes cleanly', dependsOn: ['m-2'] },
    ],
  },
];

/**
 * Return list of all available templates
 */
export function getTemplatesCatalogue() {
  return GOAL_TEMPLATES;
}

/**
 * Instantiate a template with custom input values
 * @param {string} templateId 
 * @param {object} inputValues 
 * @returns {object|null}
 */
export function instantiateTemplate(templateId, inputValues = {}) {
  const tpl = GOAL_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return null;

  let title = tpl.title;
  let description = tpl.description;
  if (inputValues.targetFile) {
    title = `Refactor ${inputValues.targetFile}`;
    description = `Decompose ${inputValues.targetFile} to < ${inputValues.lineThreshold || 500} lines`;
  } else if (inputValues.issueId) {
    title = `Fix ${inputValues.issueId}`;
    description = `Regression fix for ${inputValues.issueId} in ${inputValues.testFile || 'test suite'}`;
  } else if (inputValues.pluginName) {
    title = `Audit ${inputValues.pluginName} standards`;
  }

  const milestones = tpl.defaultMilestones.map((m, idx) => ({
    id: `m-${idx + 1}`,
    title: m.title,
    status: MilestoneStatus.PENDING,
    dependsOn: m.dependsOn ? [...m.dependsOn] : [],
    checklist: [],
    notes: '',
  }));

  return {
    templateId: tpl.id,
    title,
    description,
    milestones,
  };
}

/**
 * Generate a smart preliminary plan draft from a user goal prompt
 * @param {string} goalTitle 
 * @returns {Array<object>} draft milestones
 */
export function generatePreplanDraft(goalTitle) {
  const clean = String(goalTitle || '').trim();
  const lower = clean.toLowerCase();

  // Tailored breakdown based on keywords
  if (lower.includes('fix') || lower.includes('bug') || lower.includes('issue')) {
    return [
      { id: 'm-1', title: 'Analyze issue description, reproduce symptoms and locate root cause' },
      { id: 'm-2', title: 'Write automated regression test reproducing failure', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Apply code fix addressing root cause cleanly', dependsOn: ['m-2'] },
      { id: 'm-4', title: 'Verify test suite and confirm zero regressions', dependsOn: ['m-3'] },
    ];
  }

  if (lower.includes('refactor') || lower.includes('clean') || lower.includes('split')) {
    return [
      { id: 'm-1', title: 'Map module architecture, call sites, and identify cohesive sub-domains' },
      { id: 'm-2', title: 'Extract sub-modules into isolated files maintaining line threshold', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Update exports, bindings, and run test verification', dependsOn: ['m-2'] },
    ];
  }

  if (lower.includes('test') || lower.includes('coverage') || lower.includes('suite')) {
    return [
      { id: 'm-1', title: 'Audit existing test coverage and identify untested edge cases' },
      { id: 'm-2', title: 'Implement targeted unit and integration test assertions', dependsOn: ['m-1'] },
      { id: 'm-3', title: 'Execute full test runner and verify passing report', dependsOn: ['m-2'] },
    ];
  }

  // Default balanced 4-step engineering plan
  return [
    { id: 'm-1', title: `Research and inspect prerequisites for "${clean.slice(0, 40)}"` },
    { id: 'm-2', title: 'Implement core functionality and requisite code updates', dependsOn: ['m-1'] },
    { id: 'm-3', title: 'Add automated tests verifying implementation correctness', dependsOn: ['m-2'] },
    { id: 'm-4', title: 'Run full verification, linting, and documentation updates', dependsOn: ['m-3'] },
  ];
}
