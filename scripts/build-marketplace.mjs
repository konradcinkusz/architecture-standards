#!/usr/bin/env node
// Generates the agent-marketplace packaging layer from docs/ + catalog/.
//
//   node scripts/build-marketplace.mjs          write the generated tree
//   node scripts/build-marketplace.mjs --check   fail if the tree is stale (CI)
//
// Everything under plugins/, .github/plugin/, .claude-plugin/ and .github/agents/ is
// generated output. Nothing under docs/ is ever read-modify-written: the documents are
// the source of truth for prose, catalog/marketplace.catalog.json for metadata.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');

const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MANAGED_DIRS = ['plugins', '.github/plugin', '.claude-plugin', '.github/agents'];
const LOCK_PATH = 'catalog/versions.lock.json';

const out = new Map(); // repo-relative posix path -> file contents
const emit = (path, contents) => out.set(path, contents);

// ---------------------------------------------------------------- markdown parsing

// Split a markdown document into top-level (##) sections, ignoring anything inside a
// fenced code block — several guides contain `# comment` lines inside toml/yaml/bash
// fences that would otherwise read as headings.
function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let fence = null;
  let current = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0].repeat(3);
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
    }

    const heading = fence === null ? line.match(/^##\s+(.+?)\s*$/) : null;
    if (heading && !line.startsWith('###')) {
      current = { heading: heading[1], body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  return sections.map((s) => ({ heading: s.heading, body: stripFooter(s.body.join('\n')) }));
}

// Fourteen guides close with an unheaded `Worked examples: …` citation, which therefore
// parses as part of the final section. It cites private estate repos, so it is noise in
// an installed skill — drop it, along with any horizontal rule introducing it.
function stripFooter(body) {
  const match = body.match(/^Worked examples?:/m);
  if (!match) return body.trim();
  return body.slice(0, match.index).replace(/\n---\s*$/, '').trim();
}

function documentTitle(text, fallback) {
  const match = text.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1] : fallback;
}

function findSection(sections, pattern) {
  return sections.find((s) => pattern.test(stripNumber(s.heading)));
}

const stripNumber = (heading) => heading.replace(/^\d+[a-z]?\.\s*/, '').trim();

// Keep whole paragraphs, up to a budget — a skill body should orient, not duplicate.
function excerpt(body, budget = 1400) {
  if (body.length <= budget) return body;
  const paragraphs = body.split('\n\n');
  const kept = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (length + paragraph.length > budget && kept.length) break;
    kept.push(paragraph);
    length += paragraph.length + 2;
  }
  return `${kept.join('\n\n')}\n\n*(Continues in the reference.)*`;
}

// A copied reference lives in its own folder, so relative links to sibling documents no
// longer resolve. Point them at the canonical file in the repository instead.
function rewriteLinks(text, sourcePath, baseUrl) {
  const sourceDir = posix.dirname(sourcePath);
  const lines = text.split('\n');
  let fence = null;

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0].repeat(3);
        if (fence === null) fence = marker;
        else if (marker === fence) fence = null;
        return line;
      }
      if (fence !== null) return line;

      return line.replace(/\]\(([^)\s]+)\)/g, (whole, target) => {
        if (/^(https?:|mailto:|#)/.test(target)) return whole;
        const [path, anchor] = target.split('#');
        if (!path) return whole;
        const resolved = posix.normalize(posix.join(sourceDir, path));
        return `](${baseUrl}${resolved}${anchor ? `#${anchor}` : ''})`;
      });
    })
    .join('\n');
}

// ------------------------------------------------------------------------- emitters

function yamlFolded(key, value) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + word.length + 1 > 76) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return `${key}: >-\n${lines.map((l) => `  ${l}`).join('\n')}`;
}

function buildSkill(skill, plugin, catalog) {
  const baseUrl = catalog.marketplace.docsBaseUrl;
  const sourcePath = skill.source;
  const raw = readFileSync(join(ROOT, sourcePath), 'utf8');
  const basename = posix.basename(sourcePath);
  const title = documentTitle(raw, skill.name);
  const sections = parseSections(raw);

  const skillDir = `plugins/${plugin.name}/skills/${skill.name}`;

  // The reference is the standard, copied verbatim except for link resolution.
  emit(
    `${skillDir}/references/${basename}`,
    `<!-- Generated copy of ${sourcePath} — do not edit. Relative links have been rewritten to absolute repository URLs. -->\n\n` +
      rewriteLinks(raw, sourcePath, baseUrl).trimEnd() +
      '\n'
  );

  for (const asset of skill.assets ?? []) {
    const assetName = posix.basename(asset);
    const assetRaw = readFileSync(join(ROOT, asset), 'utf8');
    emit(
      `${skillDir}/assets/${assetName}`,
      assetName.endsWith('.md') ? rewriteLinks(assetRaw, asset, baseUrl) : assetRaw
    );
  }

  const outline = sections
    .map((s) => stripNumber(s.heading))
    .filter((h) => !/^(contents|provenance|failure modes|(compliance )?checklist)$/i.test(h));

  const checklist = findSection(sections, /^(compliance )?checklist$/i);
  const failures = findSection(sections, /^failure modes$/i);

  const body = [];
  body.push('---');
  body.push(`name: ${skill.name}`);
  body.push(yamlFolded('description', skill.description));
  body.push('---');
  body.push('');
  body.push(`# ${title}`);
  body.push('');
  body.push(
    `**Read [\`references/${basename}\`](references/${basename}) before applying any of this.**`
  );
  body.push(
    'That file is the standard; everything below it is a summary to help you decide'
  );
  body.push('whether this skill applies and to check your work afterwards.');
  body.push('');
  if (skill.principles?.length) {
    body.push(`Reference-architecture principles: ${skill.principles.join(', ')}.`);
    body.push('');
  }
  if (skill.assets?.length) {
    body.push(
      `Bundled templates: ${skill.assets
        .map((a) => {
          const n = posix.basename(a);
          return `[\`assets/${n}\`](assets/${n})`;
        })
        .join(', ')}.`
    );
    body.push('');
  }

  body.push('## What this standard covers');
  body.push('');
  for (const heading of outline) body.push(`- ${heading}`);
  body.push('');

  // Three documents (the playbook, the badge standard, the research standard) carry no
  // checklist to lift. Open them with their first section instead, so the skill says
  // something concrete rather than only pointing at the reference.
  if (!checklist && sections.length) {
    const opener = sections.find((s) => !/^contents$/i.test(stripNumber(s.heading)));
    if (opener) {
      body.push(`## ${stripNumber(opener.heading)}`);
      body.push('');
      body.push(rewriteLinks(excerpt(opener.body), sourcePath, baseUrl));
      body.push('');
    }
  }

  if (failures) {
    body.push('## Failure modes');
    body.push('');
    body.push(rewriteLinks(failures.body, sourcePath, baseUrl));
    body.push('');
  }

  if (checklist) {
    body.push('## Checklist');
    body.push('');
    body.push(rewriteLinks(checklist.body, sourcePath, baseUrl));
    body.push('');
  }

  body.push('---');
  body.push('');
  body.push(
    `Generated from [\`${sourcePath}\`](${baseUrl}${sourcePath}) by \`scripts/build-marketplace.mjs\`. ` +
      'Do not edit this file: change the source document, or its entry in ' +
      '`catalog/marketplace.catalog.json`, and re-run the generator.'
  );

  emit(`${skillDir}/SKILL.md`, `${body.join('\n').replace(/\n{3,}/g, '\n\n')}\n`);
}

function buildPlugin(plugin, catalog) {
  const manifest = {
    $schema: PLUGIN_SCHEMA,
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    author: catalog.marketplace.owner,
    homepage: catalog.marketplace.repository,
    repository: catalog.marketplace.repository,
    keywords: plugin.keywords,
  };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  // Agent Plugins 1.0.0 (Copilot CLI, VS Code) reads plugin.json at the plugin root;
  // Claude Code reads .claude-plugin/plugin.json. Same manifest, two locations.
  emit(`plugins/${plugin.name}/plugin.json`, json);
  emit(`plugins/${plugin.name}/.claude-plugin/plugin.json`, json);

  for (const skill of plugin.skills) buildSkill(skill, plugin, catalog);

  for (const agent of plugin.agents ?? []) {
    const contents = readFileSync(join(ROOT, `catalog/agents/${agent}.agent.md`), 'utf8');
    // Inside a plugin, Claude Code derives the agent's name from the filename, so a
    // `.agent.md` suffix would surface it as "architecture-review.agent".
    emit(`plugins/${plugin.name}/agents/${agent}.md`, contents);
    // In-repo, Copilot requires the .agent.md extension for custom agents.
    emit(`.github/agents/${agent}.agent.md`, contents);
  }
}

function buildMarketplaceManifests(catalog) {
  const { marketplace, plugins } = catalog;
  const entries = plugins.map((plugin) => ({
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    author: marketplace.owner,
    homepage: marketplace.repository,
    repository: marketplace.repository,
    keywords: plugin.keywords,
    // Claude Code requires the leading "./"; Copilot resolves it identically to a bare
    // relative path, so this one spelling satisfies both.
    source: `./plugins/${plugin.name}`,
  }));

  const manifest = {
    name: marketplace.name,
    metadata: {
      description: marketplace.description,
      version: marketplace.version,
    },
    owner: marketplace.owner,
    plugins: entries,
  };

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  // Copilot CLI and VS Code read .github/plugin/; Claude Code reads .claude-plugin/.
  // Copilot CLI also accepts .claude-plugin/, so the two paths keep one plugin tree.
  emit('.github/plugin/marketplace.json', json);
  emit('.claude-plugin/marketplace.json', json);
}

// ----------------------------------------------------------------------- filesystem

function walk(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const found = [];
  for (const entry of readdirSync(abs)) {
    const rel = posix.join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) found.push(...walk(rel));
    else found.push(rel);
  }
  return found;
}

// ------------------------------------------------------------------- versioning gate
//
// A standard's version cannot be derived from its diff: only a person can say whether an
// edit reverses a rule, adds one, or merely clarifies it, and that distinction is the
// whole of the policy in MARKETPLACE.md. So the tool does not decide the number — it
// enforces that somebody decided at all, by refusing a content change that leaves the
// version where it was.

// The plugin's own version is normalised out of its manifest before hashing: otherwise a
// bump would itself count as a content change, and the gate could never be satisfied.
function pluginContentDigest(name) {
  const hash = createHash('sha256');
  for (const path of [...out.keys()].filter((p) => p.startsWith(`plugins/${name}/`)).sort()) {
    const contents = path.endsWith('plugin.json')
      ? out.get(path).replace(/"version": "[^"]*"/, '"version": "<normalised>"')
      : out.get(path);
    hash.update(path).update('\0').update(contents).update('\0');
  }
  return `sha256:${hash.digest('hex').slice(0, 16)}`;
}

function reconcileVersions(catalog) {
  const abs = join(ROOT, LOCK_PATH);
  const locked = existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')).plugins ?? {} : {};

  const problems = [];
  const next = {};
  for (const plugin of catalog.plugins) {
    const contentHash = pluginContentDigest(plugin.name);
    const previous = locked[plugin.name];
    if (previous && previous.contentHash !== contentHash && previous.version === plugin.version) {
      problems.push(
        `${plugin.name}: content changed but version is still ${plugin.version}. ` +
          `Bump it in catalog/marketplace.catalog.json per MARKETPLACE.md "Versioning".`
      );
    }
    next[plugin.name] = { version: plugin.version, contentHash };
  }

  const contents = `${JSON.stringify(
    {
      $comment:
        'Generated by scripts/build-marketplace.mjs. Records the content each plugin ' +
        'version shipped, so a later content change without a version bump is a build ' +
        'failure rather than a silent re-release. See MARKETPLACE.md "Versioning".',
      plugins: next,
    },
    null,
    2
  )}\n`;

  return { problems, contents };
}

function main() {
  const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog/marketplace.catalog.json'), 'utf8'));

  for (const plugin of catalog.plugins) buildPlugin(plugin, catalog);
  buildMarketplaceManifests(catalog);

  const existing = MANAGED_DIRS.flatMap(walk);
  const stale = existing.filter((path) => !out.has(path));

  const versions = reconcileVersions(catalog);
  // Checked in both modes, and before anything is written: a plain run must not be able
  // to launder an unbumped content change by silently rewriting the lock.
  if (versions.problems.length) {
    console.error('Plugin content changed without a version bump:\n');
    for (const problem of versions.problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  if (CHECK) {
    const problems = [];
    const lockAbs = join(ROOT, LOCK_PATH);
    if (!existsSync(lockAbs)) problems.push(`missing:  ${LOCK_PATH}`);
    else if (readFileSync(lockAbs, 'utf8') !== versions.contents) problems.push(`stale:    ${LOCK_PATH}`);
    for (const [path, contents] of out) {
      const abs = join(ROOT, path);
      if (!existsSync(abs)) problems.push(`missing:  ${path}`);
      else if (readFileSync(abs, 'utf8') !== contents) problems.push(`stale:    ${path}`);
    }
    for (const path of stale) problems.push(`orphaned: ${path}`);

    if (problems.length) {
      console.error('Generated marketplace tree is out of date:\n');
      for (const problem of problems) console.error(`  ${problem}`);
      console.error('\nRun: node scripts/build-marketplace.mjs');
      process.exit(1);
    }
    console.log(`Marketplace tree is up to date (${out.size} generated files).`);
    return;
  }

  for (const path of stale) rmSync(join(ROOT, path));
  for (const [path, contents] of out) {
    const abs = join(ROOT, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
  writeFileSync(join(ROOT, LOCK_PATH), versions.contents);

  const skills = [...out.keys()].filter((p) => p.endsWith('/SKILL.md')).length;
  console.log(
    `Wrote ${out.size} files: ${catalog.plugins.length} plugins, ${skills} skills` +
      (stale.length ? `, removed ${stale.length} orphaned` : '') +
      '.'
  );
}

main();
