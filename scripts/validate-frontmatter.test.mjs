import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const skillsDir = join(repoRoot, '.github', 'skills');

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TRIGGER_MARKERS = ['when:', 'use when', 'use for:'];

/** Discover all `.github/skills/<folder>/SKILL.md` files. */
function discoverSkillFiles() {
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Unable to read skills directory at ${skillsDir}: ${err.message}`);
  }

  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillPath = join(skillsDir, entry.name, 'SKILL.md');
    try {
      if (statSync(skillPath).isFile()) {
        found.push({ folder: entry.name, path: skillPath });
      }
    } catch {
      // No SKILL.md in this folder; skip it.
    }
  }
  return found;
}

/** Extract the YAML frontmatter delimited by the first pair of `---` fences. */
function extractFrontmatter(content) {
  if (!content.startsWith('---')) {
    return null;
  }
  // Match leading fence, capture body up to the next `---` on its own line.
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }
  return match[1];
}

const skills = discoverSkillFiles();

test('SKILL.md files are discovered', () => {
  assert.ok(
    skills.length > 0,
    `No SKILL.md files found under ${skillsDir}. Expected at least one skill folder containing a SKILL.md.`
  );
});

for (const { folder, path } of skills) {
  test(folder, () => {
    const content = readFileSync(path, 'utf8');

    const rawFrontmatter = extractFrontmatter(content);
    assert.ok(
      rawFrontmatter !== null,
      `${path}: missing or malformed YAML frontmatter (file must start with a \`---\` fenced block).`
    );

    let data;
    try {
      data = parse(rawFrontmatter);
    } catch (err) {
      assert.fail(`${path}: frontmatter is not valid YAML: ${err.message}`);
    }

    assert.ok(
      data && typeof data === 'object',
      `${path}: frontmatter did not parse to a mapping/object.`
    );

    // name assertions
    assert.equal(
      typeof data.name,
      'string',
      `${path}: \`name\` is missing or not a string.`
    );
    assert.match(
      data.name,
      NAME_PATTERN,
      `${path}: \`name\` "${data.name}" must be lowercase and contain only letters, digits, and hyphens.`
    );
    assert.equal(
      data.name,
      folder,
      `${path}: \`name\` "${data.name}" must exactly match its containing folder name "${folder}".`
    );

    // description assertions
    assert.equal(
      typeof data.description,
      'string',
      `${path}: \`description\` is missing or not a string.`
    );
    assert.ok(
      data.description.trim().length > 0,
      `${path}: \`description\` must be a non-empty string.`
    );

    const descLower = data.description.toLowerCase();
    const hasTrigger = TRIGGER_MARKERS.some((marker) => descLower.includes(marker));
    assert.ok(
      hasTrigger,
      `${path}: \`description\` must contain trigger phrasing (one of "WHEN:", "Use when", or "USE FOR:").`
    );
  });
}
