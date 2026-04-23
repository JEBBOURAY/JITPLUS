#!/usr/bin/env node
/**
 * i18n consistency checker for jitplus.
 *
 * Detects (and exits with non-zero) the following classes of bugs that have
 * historically broken translation at runtime:
 *   1. A locale key used in source code (`t('foo.bar')`) is missing from one
 *      or more locales.
 *   2. A locale key exists in one locale but not in another (divergence).
 *   3. A translation value contains a single-brace placeholder `{var}`
 *      (i18n-js only interpolates `%{var}` or `{{var}}`, so `{var}` is
 *      rendered literally — a silent bug).
 *   4. The set of `%{var}` placeholders differs between locales for the same
 *      key (translators may have dropped one or renamed it).
 *   5. A duplicate top-level section key in a locale file (JS objects silently
 *      drop the earlier value — the bug that caused the lucky wheel regression).
 *
 * Usage:
 *   node scripts/check-i18n.js            # from apps/jitplus
 *   pnpm --filter jitplus check:i18n      # via workspace script (see package.json)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'i18n', 'locales');
const LOCALES = ['fr', 'en', 'ar'];
const SOURCE_EXTS = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  '.expo',
  '.expo-shared',
  'android',
  'ios',
  'dist',
  'build',
  'i18n', // locale files themselves — don't treat as call sites
  'scripts',
]);

// ── 1. Load & flatten locales via ts-node-like transpile ─────────────────────
function loadLocale(locale) {
  const tsLib = require('typescript');
  const src = fs.readFileSync(path.join(LOCALES_DIR, `${locale}.ts`), 'utf8');
  const js = tsLib.transpileModule(src, {
    compilerOptions: {
      module: tsLib.ModuleKind.CommonJS,
      target: tsLib.ScriptTarget.ES2020,
    },
  }).outputText;
  const m = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', js)(m, m.exports, require);
  return m.exports.default || m.exports;
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
}

// ── 2. Walk source files and capture static t('key') calls ───────────────────
function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        walk(path.join(dir, entry.name), files);
      }
    } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
}

const T_CALL_RE = /(?<![a-zA-Z0-9_$.])t\(\s*(['"])([a-zA-Z0-9_.-]+)\1/g;
const SINGLE_BRACE_RE = /(?<!%)\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const DOUBLE_BRACE_RE = /%\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function placeholdersOf(value) {
  if (typeof value !== 'string') return new Set();
  return new Set(Array.from(value.matchAll(DOUBLE_BRACE_RE), (m) => m[1]));
}

function singleBracePlaceholders(value) {
  if (typeof value !== 'string') return [];
  return Array.from(value.matchAll(SINGLE_BRACE_RE), (m) => m[1]);
}

// ── 3. Duplicate top-level sections (silent overwrite in JS object literal) ──
function findDuplicateTopLevelKeys(locale) {
  const src = fs.readFileSync(path.join(LOCALES_DIR, `${locale}.ts`), 'utf8');
  // Match `^  keyName:` (2-space indent — the top-level object indent in our files)
  const matches = Array.from(src.matchAll(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*[{"']/gm));
  const counts = new Map();
  for (const m of matches) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  return Array.from(counts.entries()).filter(([, c]) => c > 1).map(([k]) => k);
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const flats = {};
  for (const loc of LOCALES) {
    const pack = loadLocale(loc);
    const flat = {};
    flatten(pack, '', flat);
    flats[loc] = flat;
  }

  const files = [];
  walk(ROOT, files);

  const called = new Map(); // key -> { file, line }
  for (const fp of files) {
    let src;
    try {
      src = fs.readFileSync(fp, 'utf8');
    } catch {
      continue;
    }
    for (const m of src.matchAll(T_CALL_RE)) {
      if (called.has(m[2])) continue;
      const line = src.slice(0, m.index).split('\n').length;
      called.set(m[2], { file: path.relative(ROOT, fp), line });
    }
  }

  const errors = [];

  // 1. Missing keys per locale
  for (const loc of LOCALES) {
    for (const [key, loc0] of called) {
      if (!(key in flats[loc])) {
        errors.push(`[missing:${loc}] key "${key}" used at ${loc0.file}:${loc0.line}`);
      }
    }
  }

  // 2. Divergence between locales
  const setFr = new Set(Object.keys(flats.fr));
  for (const loc of LOCALES.filter((l) => l !== 'fr')) {
    const setL = new Set(Object.keys(flats[loc]));
    for (const k of setFr) if (!setL.has(k)) errors.push(`[divergence] key "${k}" in fr but not in ${loc}`);
    for (const k of setL) if (!setFr.has(k)) errors.push(`[divergence] key "${k}" in ${loc} but not in fr`);
  }

  // 3. Single-brace placeholders
  for (const loc of LOCALES) {
    for (const [key, value] of Object.entries(flats[loc])) {
      const bad = singleBracePlaceholders(value);
      if (bad.length) {
        errors.push(
          `[single-brace:${loc}] "${key}" contains {${bad.join('},{')}} — use %{var} so i18n-js interpolates it`,
        );
      }
    }
  }

  // 4. Placeholder set mismatch between locales (for shared keys)
  const allKeys = new Set([...Object.keys(flats.fr), ...Object.keys(flats.en), ...Object.keys(flats.ar)]);
  for (const key of allKeys) {
    const sets = Object.fromEntries(LOCALES.map((l) => [l, placeholdersOf(flats[l][key])]));
    const sig = new Set(LOCALES.map((l) => [...sets[l]].sort().join(',')));
    if (sig.size > 1) {
      errors.push(
        `[placeholder-mismatch] "${key}" fr={${[...sets.fr].join(',')}} en={${[...sets.en].join(',')}} ar={${[...sets.ar].join(',')}}`,
      );
    }
  }

  // 5. Duplicate top-level section keys
  for (const loc of LOCALES) {
    const dups = findDuplicateTopLevelKeys(loc);
    for (const d of dups) errors.push(`[duplicate-top-level:${loc}] section "${d}" defined more than once`);
  }

  if (errors.length) {
    console.error(`i18n check FAILED — ${errors.length} issue(s):`);
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }

  console.log(
    `i18n check OK — ${Object.keys(flats.fr).length} keys × ${LOCALES.length} locales, ${called.size} call sites.`,
  );
}

main();
