export const SCHEMA_VERSION = 1;
export const REFRESH_INTERVAL = 6 * 60 * 60 * 1000;
const accountPattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const repositoryPattern = /^[\w.-]{1,100}$/;

export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function validateConfig(config) {
  if (!config || typeof config.username !== 'string' || !accountPattern.test(config.username)) throw new Error('Set a valid GitHub username in site.config.json.');
  if (!['ltr', 'rtl'].includes(config.direction) || typeof config.locale !== 'string') throw new Error('Invalid locale configuration.');
  try { new Intl.DateTimeFormat(config.locale); } catch { throw new Error('Invalid formatting locale.'); }
  if (!Array.isArray(config.featured) || !config.featured.every(name => typeof name === 'string' && repositoryPattern.test(name))) throw new Error('Invalid featured repository names.');
  if (!Array.isArray(config.organizationRepositories) || !config.organizationRepositories.every(name => {
    if (typeof name !== 'string') return false;
    const parts = name.split('/');
    return parts.length === 2 && accountPattern.test(parts[0]) && repositoryPattern.test(parts[1]);
  })) throw new Error('Organization repositories must use owner/repository names.');
  if (!Number.isInteger(config.readmeLimit) || config.readmeLimit < 0 || config.readmeLimit > 30) throw new Error('readmeLimit must be between 0 and 30.');
  if (config.projectNotes !== undefined) {
    if (!config.projectNotes || typeof config.projectNotes !== 'object' || Array.isArray(config.projectNotes)) throw new Error('projectNotes must be an object.');
    for (const [name, note] of Object.entries(config.projectNotes)) {
      if (!repositoryPattern.test(name) || !note || typeof note !== 'object') throw new Error('Invalid project note.');
      for (const field of ['label', 'summary']) if (note[field] !== undefined && (typeof note[field] !== 'string' || note[field].length > 1200)) throw new Error('Invalid project note text.');
      if (note.tags !== undefined && (!Array.isArray(note.tags) || note.tags.length > 30 || !note.tags.every(tag => typeof tag === 'string' && tag.length > 0 && tag.length <= 60))) throw new Error('Invalid project note tags.');
      if (note.visual !== undefined && !['agent', 'retrieval', 'graph'].includes(note.visual)) throw new Error('Invalid project illustration.');
      if (note.evidence !== undefined && !safeUrl(note.evidence)) throw new Error('Invalid project evidence URL.');
    }
  }
  if (config.links !== undefined && (!Array.isArray(config.links) || !config.links.every(link => link && typeof link.label === 'string' && link.label.length > 0 && safeUrl(link.url)))) throw new Error('Invalid contact links.');
  return config;
}

export function text(value, limit = 1000) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit) : '';
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export function normalizeRepository(raw, config) {
  if (!raw || raw.private !== false || !Number.isSafeInteger(raw.id) || raw.id < 1) return null;
  const owner = raw.owner?.login;
  const name = raw.name;
  if (typeof owner !== 'string' || typeof name !== 'string' || !accountPattern.test(owner) || !repositoryPattern.test(name)) return null;
  const fullName = `${owner}/${name}`;
  const selected = config.organizationRepositories.some(value => value.toLowerCase() === fullName.toLowerCase());
  if (owner.toLowerCase() !== config.username.toLowerCase() && !selected) return null;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return {
    id: raw.id,
    name,
    fullName,
    owner,
    url: `https://github.com/${owner}/${name}`,
    description: text(raw.description),
    language: text(raw.language, 80) || null,
    topics: [...new Set((Array.isArray(raw.topics) ? raw.topics : []).map(value => text(value, 60)).filter(Boolean))].slice(0, 30),
    stars: count(raw.stargazers_count),
    forks: count(raw.forks_count),
    updatedAt: timestamp(raw.updated_at),
    pushedAt: timestamp(raw.pushed_at),
    archived: raw.archived === true,
    isFork: raw.fork === true,
    homepage: safeUrl(raw.homepage),
    overview: null,
    hasReadme: null,
    readmeUrl: `https://github.com/${owner}/${name}#readme`
  };
}

export function sortRepositories(repositories, sort = 'updated') {
  return [...repositories].sort((first, second) => {
    if (sort === 'stars' && first.stars !== second.stars) return second.stars - first.stars;
    if (sort === 'updated') {
      const difference = (Date.parse(second.updatedAt) || 0) - (Date.parse(first.updatedAt) || 0);
      if (difference) return difference;
    }
    return first.fullName.localeCompare(second.fullName, 'en', { sensitivity: 'base' });
  });
}

export function filterRepositories(repositories, { query = '', language = '', topic = '', sort = 'updated' } = {}, notes = {}) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return sortRepositories(repositories.filter(repository => {
    const tags = [...repository.topics, ...(notes[repository.name]?.tags ?? [])];
    const searchable = [repository.name, repository.description, notes[repository.name]?.summary, ...tags].join(' ').toLocaleLowerCase();
    return words.every(word => searchable.includes(word)) && (!language || repository.language === language) && (!topic || tags.includes(topic));
  }), sort);
}

export function validateDataset(data, config) {
  validateConfig(config);
  if (!data || data.schemaVersion !== SCHEMA_VERSION || data.username?.toLowerCase() !== config.username.toLowerCase() || !timestamp(data.generatedAt) || !Array.isArray(data.repositories)) throw new Error('Invalid repository snapshot.');
  const seen = new Set();
  for (const repository of data.repositories) {
    const normalized = normalizeRepository({
      ...repository,
      private: false,
      owner: { login: repository.owner },
      stargazers_count: repository.stars,
      forks_count: repository.forks,
      updated_at: repository.updatedAt,
      pushed_at: repository.pushedAt,
      fork: repository.isFork
    }, config);
    if (!normalized || Object.keys(normalized).some(key => !['overview', 'hasReadme'].includes(key) && JSON.stringify(normalized[key]) !== JSON.stringify(repository[key]))) throw new Error('Invalid repository record.');
    if (repository.overview !== null && (typeof repository.overview !== 'string' || repository.overview.length > 1200)) throw new Error('Invalid README overview.');
    if (![null, true, false].includes(repository.hasReadme)) throw new Error('Invalid README status.');
    if (seen.has(repository.fullName.toLowerCase())) throw new Error('Duplicate repository record.');
    seen.add(repository.fullName.toLowerCase());
  }
  return data;
}

export function readmeOverview(markdown) {
  const source = text(markdown, 100000).replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  const paragraphs = source.split(/\r?\n\s*\r?\n/);
  const paragraph = paragraphs.find(part => {
    const trimmed = part.trim();
    return trimmed && !/^(#|!|<|\||[-*]\s|\d+\.)/.test(trimmed);
  }) ?? '';
  return paragraph.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200) || null;
}
