import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { normalizeRepository, readmeOverview, validateDataset, validateConfig, filterRepositories, safeUrl } from '../src/core.js';
import { fetchRepositories, fetchOverview } from '../src/github.js';

const config = { username: 'developer', direction: 'ltr', locale: 'en', featured: [], organizationRepositories: [], readmeLimit: 12 };
const rawRepository = (id = 1, overrides = {}) => ({ id, name: `repository-${id}`, owner: { login: 'developer' }, private: false, language: 'Python', description: 'A retrieval system', topics: ['rag'], stargazers_count: id, forks_count: 0, updated_at: '2026-10-01T00:00:00Z', ...overrides });
const response = (value, status = 200) => ({ ok: status === 200, status, json: async () => value });

test('normalizes missing fields and rejects private, unrelated, and malformed repositories', () => {
  const repository = normalizeRepository(rawRepository(1, { description: null, language: null, topics: null, updated_at: 'invalid', stargazers_count: -1, homepage: 'javascript:alert(1)' }), config);
  assert.equal(repository.description, '');
  assert.equal(repository.language, null);
  assert.equal(repository.updatedAt, null);
  assert.equal(repository.stars, 0);
  assert.equal(repository.homepage, null);
  assert.deepEqual(repository.topics, []);
  assert.equal(normalizeRepository(rawRepository(1, { private: true }), config), null);
  assert.equal(normalizeRepository(rawRepository(1, { owner: { login: 'someone-else' } }), config), null);
  assert.equal(normalizeRepository(rawRepository(1, { owner: null }), config), null);
  assert.equal(normalizeRepository(rawRepository(1, { owner: { login: 123 } }), config), null);
  assert.equal(normalizeRepository(rawRepository(1, { name: 123 }), config), null);
  assert.equal(normalizeRepository(rawRepository(1, { name: '../../file' }), config), null);
  assert.equal(normalizeRepository(rawRepository(1, { id: '1' }), config), null);
});

test('pagination traverses all pages and deduplicates records', async () => {
  const calls = [];
  const data = await fetchRepositories(config, async url => {
    calls.push(url);
    return response(calls.length === 1 ? Array.from({ length: 100 }, (_, index) => rawRepository(index + 1)) : [rawRepository(101), rawRepository(1)]);
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /users\/developer\/repos\?type=owner/);
  assert.match(calls[1], /page=2$/);
  assert.equal(data.repositories.length, 101);
  validateDataset(data, config);
});

test('empty lists, exact page boundaries, errors, and unexpected responses', async () => {
  assert.deepEqual((await fetchRepositories(config, async () => response([]))).repositories, []);
  let calls = 0;
  const data = await fetchRepositories(config, async () => response(++calls === 1 ? Array.from({ length: 100 }, (_, index) => rawRepository(index + 1)) : []));
  assert.equal(data.repositories.length, 100);
  assert.equal(calls, 2);
  await assert.rejects(fetchRepositories(config, async () => response({}, 403)), /limit/);
  await assert.rejects(fetchRepositories(config, async () => response({}, 500)), /unavailable/);
  await assert.rejects(fetchRepositories(config, async () => { throw new Error('Offline'); }), /Offline/);
  await assert.rejects(fetchRepositories(config, async () => response({ message: 'Not a list' })), /unexpected/);
});

test('only explicitly selected public organization repositories are included', async () => {
  const selected = { ...config, organizationRepositories: ['organization/tool'] };
  const result = await fetchRepositories(selected, async url => response(url.includes('/users/') ? [rawRepository()] : rawRepository(2, { name: 'tool', owner: { login: 'organization' } })));
  assert.equal(result.repositories.length, 2);
  const privateResult = await fetchRepositories(selected, async url => response(url.includes('/users/') ? [] : rawRepository(2, { name: 'tool', private: true, owner: { login: 'organization' } })));
  assert.equal(privateResult.repositories.length, 0);
});

test('failed later page rejects instead of publishing a truncated gallery', async () => {
  let calls = 0;
  await assert.rejects(fetchRepositories(config, async () => ++calls === 1 ? response(Array.from({ length: 100 }, (_, index) => rawRepository(index + 1))) : response({}, 500)), /unavailable/);
});

test('search, language/topic filters, curated tags, and deterministic sorting', () => {
  const repositories = [normalizeRepository(rawRepository(1, { name: 'Zulu', updated_at: null }), config), normalizeRepository(rawRepository(2, { name: 'Alpha', language: 'JavaScript' }), config)];
  assert.equal(filterRepositories(repositories, { query: 'zulu retrieval' }).length, 1);
  assert.equal(filterRepositories(repositories, { language: 'Python' })[0].name, 'Zulu');
  assert.equal(filterRepositories(repositories, { topic: 'rag' }).length, 2);
  assert.equal(filterRepositories(repositories, { topic: 'FastAPI' }, { Zulu: { tags: ['FastAPI'] } }).length, 1);
  assert.deepEqual(filterRepositories(repositories, { sort: 'name' }).map(repository => repository.name), ['Alpha', 'Zulu']);
  assert.equal(filterRepositories(repositories, { sort: 'stars' })[0].stars, 2);
  assert.equal(filterRepositories(repositories, { sort: 'updated' })[0].name, 'Alpha');
  assert.equal(filterRepositories([], { query: 'nothing' }).length, 0);
});

test('safe URLs reject executable schemes, credentials, and local services', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'https://user:pass@example.com', 'http://localhost:8000', 'http://127.0.0.1', 'http://[::1]', '/relative', null]) assert.equal(safeUrl(url), null);
  assert.equal(safeUrl('https://example.com/demo'), 'https://example.com/demo');
});

test('README extraction handles Unicode, strips markup, and limits content', async () => {
  assert.equal(readmeOverview('# Heading\n\nA **local** [system](https://example.com).\n\n## Setup\n\nIgnore this.'), 'A local system.');
  assert.equal(readmeOverview('# Only a heading'), null);
  assert.equal(readmeOverview('# Header\n\n<script>alert(1)</script>\n\nSafe description.'), 'Safe description.');
  assert.ok(readmeOverview('a'.repeat(2000)).length <= 1200);
  const result = await fetchOverview({ fullName: 'developer/project' }, async () => response({ encoding: 'base64', content: Buffer.from('# Title\n\nسلام — local AI').toString('base64') }));
  assert.equal(result, 'سلام — local AI');
});

test('dataset validation rejects unsafe, duplicate, and mismatched snapshots', () => {
  const repository = normalizeRepository(rawRepository(), config);
  const data = { schemaVersion: 1, username: 'developer', generatedAt: new Date().toISOString(), repositories: [repository] };
  assert.equal(validateDataset(data, config), data);
  assert.throws(() => validateDataset({ ...data, username: 'other' }, config));
  assert.throws(() => validateDataset({ ...data, repositories: [repository, repository] }, config));
  assert.throws(() => validateDataset({ ...data, repositories: [{ ...repository, url: 'javascript:alert(1)' }] }, config));
  assert.throws(() => validateConfig({ ...config, username: '../../bad' }));
  assert.throws(() => validateConfig({ ...config, username: undefined }));
  assert.throws(() => validateConfig({ ...config, locale: 'not a locale' }));
  assert.throws(() => validateConfig({ ...config, projectNotes: { example: { tags: 'not an array' } } }));
  assert.throws(() => validateConfig({ ...config, organizationRepositories: ['../../bad'] }));
});

test('sync failure preserves the last successful snapshot byte-for-byte', async () => {
  const before = await readFile('data/repositories.json', 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "globalThis.fetch = async () => { throw new Error('Simulated API failure'); }; await import('./scripts/sync.mjs');"], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Keeping the last successful snapshot/);
  assert.equal(await readFile('data/repositories.json', 'utf8'), before);
});
