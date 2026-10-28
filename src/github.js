import { normalizeRepository, readmeOverview, SCHEMA_VERSION, sortRepositories, validateConfig } from './core.js';

export async function requestJson(url, fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: controller.signal,
      credentials: 'omit'
    });
    if (!response.ok) {
      const error = new Error(response.status === 403 || response.status === 429 ? 'GitHub’s public API limit was reached. Please try again later.' : response.status === 404 ? 'GitHub could not find this public resource.' : `GitHub is unavailable (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRepositories(config, fetcher = fetch) {
  validateConfig(config);
  const collected = [];
  let page = 1;
  while (true) {
    if (page > 1000) throw new Error('Repository pagination exceeded the safety limit. No partial snapshot was published.');
    const batch = await requestJson(`https://api.github.com/users/${encodeURIComponent(config.username)}/repos?type=owner&sort=updated&per_page=100&page=${page}`, fetcher);
    if (!Array.isArray(batch)) throw new Error('GitHub returned an unexpected repository response.');
    collected.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  for (const fullName of config.organizationRepositories) {
    collected.push(await requestJson(`https://api.github.com/repos/${fullName}`, fetcher));
  }
  const unique = new Map();
  for (const raw of collected) {
    const repository = normalizeRepository(raw, config);
    if (repository) unique.set(repository.fullName.toLowerCase(), repository);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    username: config.username,
    generatedAt: new Date().toISOString(),
    repositories: sortRepositories([...unique.values()])
  };
}

export async function fetchOverview(repository, fetcher = fetch) {
  const response = await requestJson(`https://api.github.com/repos/${repository.fullName}/readme`, fetcher);
  if (response.encoding !== 'base64' || typeof response.content !== 'string' || response.content.length > 140000) return null;
  const bytes = Uint8Array.from(atob(response.content.replace(/\s/g, '')), character => character.charCodeAt(0));
  return readmeOverview(new TextDecoder().decode(bytes));
}
