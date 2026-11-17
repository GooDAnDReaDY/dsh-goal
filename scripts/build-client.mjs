#!/usr/bin/env node
/**
 * Build DSH client entry (lib/client.js) from ordered src/client fragments.
 * DSH ModuleLoader loads a single file; this concatenates source modules
 * into that one factory. Run: npm run build:client
 *
 * Options:
 *   --check      Verify lib/client.js matches concatenated fragments (exit 1 on drift)
 *   --out <path> Custom output destination (used by tests to avoid in-place race conditions)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src", "client");

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const outIdx = args.indexOf("--out");
const customOut = outIdx !== -1 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : null;
const outFile = customOut || join(root, "lib", "client.js");

const CANONICAL_DSH_TOKENS = new Set([
  "--dsw-alias-bg-base", "--dsw-alias-bg-layer-1", "--dsw-alias-bg-layer-2", "--dsw-alias-bg-layer-3",
  "--dsw-alias-bg-mask-1", "--dsw-alias-bg-mask-2", "--dsw-alias-bg-mask-3", "--dsw-alias-bg-overlay",
  "--dsw-alias-border-l1", "--dsw-alias-border-l2", "--dsw-alias-border-l3", "--dsw-alias-border-l4",
  "--dsw-alias-brand-primary", "--dsw-alias-brand-text",
  "--dsw-alias-interactive-bg-active", "--dsw-alias-interactive-bg-hover",
  "--dsw-alias-interactive-bg-hover-accent", "--dsw-alias-interactive-bg-hover-danger",
  "--dsw-alias-interactive-bg-hover-solid",
  "--dsw-alias-label-caption", "--dsw-alias-label-dimmed", "--dsw-alias-label-primary",
  "--dsw-alias-label-primary-inverted", "--dsw-alias-label-secondary", "--dsw-alias-label-tertiary",
  "--dsw-alias-state-error-primary", "--dsw-alias-state-error-secondary",
  "--dsw-alias-state-success-primary", "--dsw-alias-state-success-secondary", "--dsw-alias-state-success-tertiary",
  "--dsw-alias-state-warn-label", "--dsw-alias-state-warn-primary", "--dsw-alias-state-warn-secondary", "--dsw-alias-state-warn-tertiary",
  "--dsw-alias-status-warning", "--dsw-alias-shadow-md", "--dsw-alias-shadow-s", "--dsw-alias-shadow-m", "--dsw-alias-shadow-l",
  "--dsw-alias-toast-bg", "--dsw-alias-tooltip-bg"
]);

const files = readdirSync(srcDir)
  .filter((name) => name.endsWith(".js"))
  .sort((a, b) => {
    const na = Number.parseInt(a, 10);
    const nb = Number.parseInt(b, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });

if (files.length === 0) {
  console.error("build-client: no fragments in src/client");
  process.exit(1);
}

// 1. Line budget check for all fragments (Issue 203: all fragments < 600 lines)
for (const name of files) {
  const content = readFileSync(join(srcDir, name), "utf8");
  const lineCount = content.split("\n").length;
  if (lineCount > 600) {
    console.error(`build-client: fragment ${name} exceeds 600 lines (${lineCount} lines)`);
    process.exit(1);
  }
}

let body = "";
for (const name of files) {
  body += readFileSync(join(srcDir, name), "utf8");
}

// 2. Canonical DSH token validation (Issue 202)
const tokensUsed = body.match(/--dsw-alias-[a-zA-Z0-9_-]+/g) || [];
const invalidTokens = [];
for (const token of tokensUsed) {
  if (!CANONICAL_DSH_TOKENS.has(token)) {
    invalidTokens.push(token);
  }
}
if (invalidTokens.length > 0) {
  console.error("build-client: found non-canonical DSH tokens:", [...new Set(invalidTokens)].join(", "));
  process.exit(1);
}

// 3. Byte budget check (Issue 203: fail > 200 KB, warn > 180 KB)
const byteLength = Buffer.byteLength(body, "utf8");
if (byteLength > 200 * 1024) {
  console.error(`build-client: bundle exceeds 200 KB ceiling (${byteLength} bytes)`);
  process.exit(1);
}
if (byteLength > 180 * 1024) {
  console.warn(`build-client: warning: bundle exceeds 180 KB budget (${byteLength} bytes)`);
}

if (isCheck) {
  if (!existsSync(outFile)) {
    console.error(`build-client --check: target ${outFile} does not exist`);
    process.exit(1);
  }
  const current = readFileSync(outFile, "utf8");
  if (current !== body) {
    console.error(`build-client --check: ${outFile} has drifted from src/client fragments. Run npm run build:client to synchronize.`);
    process.exit(1);
  }
  console.log(`build-client --check: ${outFile} is up to date (${files.length} fragments, ${body.length} bytes)`);
  process.exit(0);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, body, "utf8");
console.log(`build-client: wrote ${outFile} from ${files.length} fragments (${body.length} bytes)`);
