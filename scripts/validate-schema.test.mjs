import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const schemaPath = join(
  repoRoot,
  '.github',
  'skills',
  'moodboard-to-template',
  'references',
  'token-schema.json'
);
const skillsRoot = join(repoRoot, '.github', 'skills');

const tokenFilePattern = /^tokens.*\.json$/;
const schemaFileName = 'token-schema.json';

/**
 * Recursively collect token fixture files under a directory.
 * Matches basenames against /^tokens.*\.json$/ and excludes the schema itself.
 */
function findTokenFixtures(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findTokenFixtures(fullPath));
    } else if (
      entry.isFile() &&
      tokenFilePattern.test(entry.name) &&
      entry.name !== schemaFileName
    ) {
      found.push(fullPath);
    }
  }
  return found;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

const fixtures = findTokenFixtures(skillsRoot);

test('token schema compiles and at least one fixture is discovered', () => {
  assert.equal(
    typeof validate,
    'function',
    'token-schema.json failed to compile into a validator'
  );
  assert.ok(
    fixtures.length > 0,
    `No token fixtures (tokens*.json) found under ${skillsRoot}. ` +
      'The golden fixture tokens.example.json must be discoverable.'
  );
});

for (const fixturePath of fixtures) {
  test(`fixture validates: ${basename(fixturePath)}`, () => {
    const data = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const valid = validate(data);
    assert.ok(
      valid,
      `${fixturePath} failed schema validation:\n` +
        JSON.stringify(validate.errors, null, 2)
    );
  });
}
