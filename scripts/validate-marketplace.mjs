#!/usr/bin/env node
// Validates the generated marketplace tree against the Agent Plugins 1.0.0 constraints
// and the skill front-matter rules, independently of the generator that produced it.
//
//   node scripts/validate-marketplace.mjs
//
// `build-marketplace.mjs --check` proves the tree matches its sources; this proves the
// tree is something a client will actually accept.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const SEMVER = /^\d+\.\d+\.\d+$/;
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Everything a SKILL.md front-matter may declare here. A procedure skill adds the keys
// that decide who may invoke it and what it may touch while active; a misspelt one would
// otherwise be ignored by the client, silently turning a gate off.
const SKILL_KEYS = new Set([
  'name',
  'description',
  'argument-hint',
  'arguments',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'disallowed-tools',
  'model',
]);

// Front-matter is a fixed shape here (the generator writes it), so a full YAML parser
// would be more dependency than the job needs.
function frontMatter(text, where) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(where, 'no YAML front-matter');
    return null;
  }
  const fields = {};
  let key = null;
  for (const line of match[1].split('\n')) {
    const start = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (start) {
      key = start[1];
      fields[key] = start[2].replace(/^>-?\s*$/, '').trim();
    } else if (key && line.startsWith('  ')) {
      fields[key] = `${fields[key]} ${line.trim()}`.trim();
    }
  }
  return fields;
}

function checkRelativeLinks(text, fileDir, where) {
  const links = text.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g);
  for (const [, target] of links) {
    const path = target.split('#')[0];
    if (!path) continue;
    if (!existsSync(join(ROOT, posix.normalize(posix.join(fileDir, path))))) {
      fail(where, `relative link does not resolve: ${target}`);
    }
  }
}

// ---------------------------------------------------------------------- marketplaces

const manifestPaths = ['.github/plugin/marketplace.json', '.claude-plugin/marketplace.json'];
for (const path of manifestPaths) {
  if (!existsSync(join(ROOT, path))) fail(path, 'missing');
}
if (problems.length === 0) {
  const [copilot, claude] = manifestPaths.map(read);
  if (copilot !== claude) fail('marketplace manifests', 'the two manifests differ');
}

const marketplace = readJson(manifestPaths[0]);
const where = manifestPaths[0];
if (!marketplace.name) fail(where, 'missing name');
if (!marketplace.metadata?.description) fail(where, 'missing metadata.description');
if (!SEMVER.test(marketplace.metadata?.version ?? '')) fail(where, 'metadata.version is not semver');
if (!marketplace.owner?.name) fail(where, 'missing owner.name');
if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
  fail(where, 'plugins must be a non-empty array');
}

// -------------------------------------------------------------------------- plugins

const declared = new Set();
for (const entry of marketplace.plugins ?? []) {
  const at = `${where} → ${entry.name ?? '(unnamed)'}`;
  if (!entry.name) fail(at, 'missing name');
  if (!entry.description) fail(at, 'missing description');
  if (!SEMVER.test(entry.version ?? '')) fail(at, 'version is not semver');
  if (!entry.source) {
    fail(at, 'missing source');
    continue;
  }
  declared.add(entry.name);

  const dir = typeof entry.source === 'string' ? entry.source : null;
  if (!dir) continue; // a {source:"github"} object points elsewhere; nothing local to check
  // Claude Code rejects a bare relative path; Copilot resolves both spellings the same.
  if (!dir.startsWith('./')) fail(at, `source must start with "./" to satisfy Claude Code: ${dir}`);
  if (!existsSync(join(ROOT, dir))) {
    fail(at, `source directory does not exist: ${dir}`);
    continue;
  }

  const manifestPath = `${dir}/plugin.json`;
  if (!existsSync(join(ROOT, manifestPath))) {
    fail(at, `no plugin.json in ${dir}`);
    continue;
  }
  const plugin = readJson(manifestPath);
  if (plugin.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') {
    fail(manifestPath, 'missing or unexpected $schema');
  }
  if (plugin.name !== entry.name) {
    fail(manifestPath, `name "${plugin.name}" does not match marketplace entry "${entry.name}"`);
  }
  if (plugin.version !== entry.version) {
    fail(manifestPath, `version ${plugin.version} does not match marketplace entry ${entry.version}`);
  }
  if (!plugin.description) fail(manifestPath, 'missing description');

  // Copilot reads plugin.json at the plugin root, Claude Code reads it from
  // .claude-plugin/. Both must be present and identical.
  const claudeManifest = `${dir}/.claude-plugin/plugin.json`;
  if (!existsSync(join(ROOT, claudeManifest))) {
    fail(at, `no .claude-plugin/plugin.json — Claude Code will not load ${dir}`);
  } else if (read(claudeManifest) !== read(manifestPath)) {
    fail(claudeManifest, 'differs from the root plugin.json');
  }

  // ------------------------------------------------------------------------ skills
  const skillsDir = `${dir}/skills`;
  if (!existsSync(join(ROOT, skillsDir))) {
    fail(at, 'plugin declares no skills');
    continue;
  }
  const skills = readdirSync(join(ROOT, skillsDir)).filter((name) =>
    statSync(join(ROOT, skillsDir, name)).isDirectory()
  );
  if (skills.length === 0) fail(skillsDir, 'no skills');

  for (const skill of skills) {
    const skillDir = `${skillsDir}/${skill}`;
    const skillPath = `${skillDir}/SKILL.md`;
    if (!existsSync(join(ROOT, skillPath))) {
      fail(skillDir, 'no SKILL.md');
      continue;
    }
    const text = read(skillPath);
    const fields = frontMatter(text, skillPath);
    if (!fields) continue;

    if (fields.name !== skill) {
      fail(skillPath, `front-matter name "${fields.name}" does not match folder "${skill}"`);
    }
    if (!SKILL_NAME.test(fields.name ?? '')) {
      fail(skillPath, `name must be lowercase words separated by hyphens: "${fields.name}"`);
    }
    if ((fields.name ?? '').length > 64) fail(skillPath, 'name exceeds 64 characters');

    const description = fields.description ?? '';
    if (description.length < 10 || description.length > 1024) {
      fail(skillPath, `description must be 10-1024 characters (is ${description.length})`);
    }
    if (!/\buse when\b/i.test(description)) {
      fail(skillPath, 'description should say when to use the skill — that is what routes it');
    }

    for (const key of Object.keys(fields)) {
      if (!SKILL_KEYS.has(key)) {
        fail(skillPath, `unknown front-matter key "${key}"`);
      }
    }

    checkRelativeLinks(text, skillDir, skillPath);
  }
}

// -------------------------------------------------------------------------- catalog

const catalog = readJson('catalog/marketplace.catalog.json');
for (const plugin of catalog.plugins) {
  if (!declared.has(plugin.name)) {
    fail('catalog/marketplace.catalog.json', `plugin "${plugin.name}" is not in the marketplace manifest`);
  }
  for (const skill of plugin.skills) {
    if (!existsSync(join(ROOT, skill.source))) {
      fail('catalog/marketplace.catalog.json', `${skill.name}: source document missing: ${skill.source}`);
    }
    for (const asset of skill.assets ?? []) {
      if (!existsSync(join(ROOT, asset))) {
        fail('catalog/marketplace.catalog.json', `${skill.name}: asset missing: ${asset}`);
      }
    }
  }
  for (const agent of plugin.agents ?? []) {
    if (!existsSync(join(ROOT, `catalog/agents/${agent}.agent.md`))) {
      fail('catalog/marketplace.catalog.json', `agent definition missing: catalog/agents/${agent}.agent.md`);
    }
  }
}

// --------------------------------------------------------------------------- agents

if (existsSync(join(ROOT, '.github/agents'))) {
  for (const file of readdirSync(join(ROOT, '.github/agents'))) {
    const path = `.github/agents/${file}`;
    const fields = frontMatter(read(path), path);
    if (!fields) continue;
    if (!fields.name) fail(path, 'missing name');
    if (!fields.description) fail(path, 'missing description');
    if (!file.endsWith('.agent.md')) fail(path, 'custom agents must use the .agent.md extension');
  }
}

// -------------------------------------------------------------- hand-written entries

// The entry points are the one part of this layer a human writes, so they are the one
// part that can rot silently.
for (const path of [
  'AGENTS.md',
  'MARKETPLACE.md',
  '.github/copilot-instructions.md',
  'docs/proposals/MARKETPLACE-PACKAGING.md',
]) {
  if (!existsSync(join(ROOT, path))) {
    fail(path, 'missing');
    continue;
  }
  checkRelativeLinks(read(path), posix.dirname(path), path);
}

// --------------------------------------------------------------------------- report

if (problems.length) {
  console.error(`Marketplace validation failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const skillCount = catalog.plugins.reduce((total, plugin) => total + plugin.skills.length, 0);
console.log(
  `Marketplace is valid: ${catalog.plugins.length} plugins, ${skillCount} skills, ` +
    `${manifestPaths.length} manifests.`
);
