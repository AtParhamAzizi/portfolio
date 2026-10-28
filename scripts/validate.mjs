import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { parseDocument } from 'yaml';
import { validateConfig, validateDataset } from '../src/core.js';

const config = validateConfig(JSON.parse(await readFile('site.config.json', 'utf8')));
const data = validateDataset(JSON.parse(await readFile('data/repositories.json', 'utf8')), config);
const schema = JSON.parse(await readFile('schema/repositories.schema.json', 'utf8'));
const validator = new Ajv({ allErrors: true });
validator.addFormat('date-time', value => Number.isFinite(Date.parse(value)));
const validate = validator.compile(schema);
assert.ok(validate(data), JSON.stringify(validate.errors));
const document = parseDocument(await readFile('.github/workflows/pages.yml', 'utf8'), { uniqueKeys: true });
assert.deepEqual(document.errors, []);
const workflow = document.toJS();
assert.equal(workflow.on.schedule[0].cron, '23 */6 * * *');
assert.ok('workflow_dispatch' in workflow.on && 'push' in workflow.on);
assert.deepEqual(workflow.permissions, { contents: 'read' });
assert.deepEqual(workflow.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
assert.equal(workflow.jobs.deploy.needs, 'build');
assert.ok(workflow.jobs.deploy.steps.some(step => step.uses === 'actions/configure-pages@v5'));
assert.ok(!workflow.jobs.build.steps.some(step => step.uses?.startsWith('actions/configure-pages')));
assert.equal(workflow.jobs.build.steps.find(step => step.uses?.startsWith('actions/upload-pages-artifact')).with.path, 'dist');
assert.ok(workflow.jobs.deploy.if.includes('github.event.repository.default_branch'));

const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files.push(path);
  }
}
await collect('.');
for (const path of files) {
  const source = await readFile(path, 'utf8');
  assert.ok(!/^\.env(?:\.|$)/.test(path.split(/[\\/]/).at(-1)), `Environment file found: ${path}`);
  assert.ok(!/(?:gh[pousr]_[A-Za-z\d]{30,}|github_pat_[A-Za-z\d_]{40,}|AKIA[A-Z\d]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(source), `Potential credential in ${path}`);
  assert.ok(!/[ \t]+$/m.test(source), `Trailing whitespace in ${path}`);
  if (/\.(?:js|mjs)$/.test(path)) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}
const html = await readFile('index.html', 'utf8');
assert.ok(!/(?:src|href)=["']\/(?!\/)/.test(html), 'Root-relative asset URL');
for (const name of ['src/app.js', 'src/github.js']) {
  const source = await readFile(name, 'utf8');
  assert.ok(!/\.innerHTML\s*=|\beval\(|new Function\(/.test(source), `Unsafe rendering in ${name}`);
}
console.log(`Validated ${data.repositories.length} repository records against JSON Schema and ownership rules; workflow, syntax, relative URLs, whitespace, and credential checks passed.`);
