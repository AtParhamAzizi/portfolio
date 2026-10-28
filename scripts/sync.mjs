import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateConfig, validateDataset } from '../src/core.js';
import { fetchRepositories, fetchOverview } from '../src/github.js';

const root = new URL('../', import.meta.url);
const config = validateConfig(JSON.parse(await readFile(new URL('site.config.json', root), 'utf8')));
const target = new URL('data/repositories.json', root);
let previous;
try {
  previous = validateDataset(JSON.parse(await readFile(target, 'utf8')), config);
} catch {
  previous = null;
}

try {
  const data = await fetchRepositories(config);
  const ordered = [...data.repositories].sort((first, second) => Number(config.featured.includes(second.name)) - Number(config.featured.includes(first.name)));
  for (const [index, repository] of ordered.entries()) {
    repository.overview = previous?.repositories.find(item => item.fullName === repository.fullName)?.overview ?? null;
    repository.hasReadme = previous?.repositories.find(item => item.fullName === repository.fullName)?.hasReadme ?? null;
    if (index >= config.readmeLimit) continue;
    try {
      repository.overview = await fetchOverview(repository);
      repository.hasReadme = true;
    } catch (error) {
      if (error.status === 404) { repository.overview = null; repository.hasReadme = false; }
      else console.warn(`README unavailable for ${repository.fullName}: ${error.message}`);
    }
  }
  validateDataset(data, config);
  await mkdir(new URL('data/', root), { recursive: true });
  await writeFile(`${fileURLToPath(target)}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await rename(`${fileURLToPath(target)}.tmp`, target);
  console.log(`Synchronized ${data.repositories.length} public repositories for ${config.username}.`);
} catch (error) {
  if (!previous) throw error;
  console.warn(`Synchronization failed: ${error.message}\nKeeping the last successful snapshot from ${previous.generatedAt}.`);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `Repository refresh failed; retaining snapshot from ${previous.generatedAt}.\n`, { flag: 'a' });
}
