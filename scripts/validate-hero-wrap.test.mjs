import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Directories that ship display-heading rules: skill assets, charter snippets,
// the example pages, and any generated template.html / style-guide.html.
// Per-page overrides live in inline <style> blocks, so HTML is scanned too.
const SCAN_ROOTS = [
  join(repoRoot, '.github', 'skills'),
  join(repoRoot, 'example-generated-html'),
];

const SCAN_EXTENSIONS = ['.css', '.html', '.md'];
const IGNORED_DIRS = new Set(['node_modules', '.git']);

// Declarations that auto-break whole words in a headline. `hyphens: auto`
// inserts a hyphen mid-word ("har-ness"); `overflow-wrap: anywhere` breaks at
// any character with no hyphen. Both violate the whole-word wrap contract.
const FORBIDDEN = [
  { label: 'hyphens: auto', pattern: /hyphens\s*:\s*auto/i },
  { label: 'overflow-wrap: anywhere', pattern: /overflow-wrap\s*:\s*anywhere/i },
  { label: 'word-break: break-all', pattern: /word-break\s*:\s*break-all/i },
];

// Selectors that target a display/hero headline across the zine and generic
// skills. The generic moodboard-to-html skill emits `.display`/`.headline`
// classes; the zine skills use `.hero h1` / `.hero-title`.
const DISPLAY_SELECTORS = [
  /\.hero\b[^,{]*\bh1\b/i,                         // .hero h1, .hero > h1
  /\bh1\.hero\b/i,                                 // h1.hero
  /\.hero-title\b/i,                               // .hero-title
  /\.display\b/i,                                  // .display headline class
  /\.headline\b/i,                                 // .headline
  /\[class\s*[*^|]?=\s*["']?[^"'\]]*hero[^"'\]]*["']?\][^,{]*\bh1\b/i, // [class*="hero"] h1
];

// A leaf CSS rule: `selector { declarations }` with no nested braces. Inside an
// @media wrapper this still matches each inner rule individually.
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;

/** True when a comma-separated selector list targets a display headline. */
function targetsDisplayHeading(selectorList) {
  return selectorList
    .split(',')
    .map((s) => s.trim())
    .some((sel) => {
      // The italic-accent sub-rule (e.g. `.hero h1 em`) is not the headline
      // itself and is allowed to differ; skip any `em` leaf selector.
      if (/\bem\b\s*$/i.test(sel)) {
        return false;
      }
      return DISPLAY_SELECTORS.some((pattern) => pattern.test(sel));
    });
}

/** Recursively collect files with a scannable extension under a directory. */
function discoverFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      found.push(...discoverFiles(join(dir, entry.name)));
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      try {
        if (statSync(fullPath).isFile()) {
          found.push(fullPath);
        }
      } catch {
        // Unreadable entry; skip it.
      }
    }
  }
  return found;
}

/** Extract display-heading rule bodies from a file's text. */
function displayHeadingRules(content) {
  const rules = [];
  CSS_RULE.lastIndex = 0;
  let match;
  while ((match = CSS_RULE.exec(content)) !== null) {
    const selector = match[1];
    const body = match[2];
    if (targetsDisplayHeading(selector)) {
      rules.push({ selector: selector.trim().replace(/\s+/g, ' '), body });
    }
  }
  return rules;
}

const files = SCAN_ROOTS.flatMap(discoverFiles);

test('files containing display-heading rules are discovered', () => {
  const withRules = files.filter(
    (path) => displayHeadingRules(readFileSync(path, 'utf8')).length > 0
  );
  assert.ok(
    withRules.length > 0,
    'No display-heading rule blocks (e.g. `.hero h1`) found to validate. ' +
      'Expected at least the bundled default-global.css to define one.'
  );
});

for (const path of files) {
  const content = readFileSync(path, 'utf8');
  const rules = displayHeadingRules(content);
  if (rules.length === 0) {
    continue;
  }
  const rel = relative(repoRoot, path);
  test(`display headline wraps on whole words: ${rel}`, () => {
    for (const { selector, body } of rules) {
      for (const { label, pattern } of FORBIDDEN) {
        assert.ok(
          !pattern.test(body),
          `${rel}: \`${selector}\` declares \`${label}\`, which splits whole ` +
            'words mid-character (e.g. "har-ness"). Display headlines must wrap ' +
            'on whole-word boundaries — use `hyphens: manual; ' +
            'overflow-wrap: break-word; word-break: normal;` instead.'
        );
      }
    }
  });
}
