import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, validateDataset } from '../src/core.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
if (dirname(output) !== resolve(root) || !output.endsWith('dist')) throw new Error('Unsafe output directory.');
const config = validateConfig(JSON.parse(await readFile(resolve(root, 'site.config.json'), 'utf8')));
validateDataset(JSON.parse(await readFile(resolve(root, 'data/repositories.json'), 'utf8')), config);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'src', 'assets', 'data', 'site.config.json']) {
  await cp(resolve(root, name), resolve(output, name), { recursive: true });
}
await writeFile(resolve(output, '.nojekyll'), '');
console.log('Built static site in dist/ (all URLs are relative).');
