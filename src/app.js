import { filterRepositories, REFRESH_INTERVAL, safeUrl, validateConfig, validateDataset } from './core.js';
import { fetchOverview, fetchRepositories } from './github.js';
import { hydrateIcons, icon } from './icons.js';

const select = selector => document.querySelector(selector);
const elements = {
  grid: select('#project-grid'), featured: select('#featured-grid'), featuredArea: select('#featured-area'),
  search: select('#project-search'), language: select('#language-filter'), topic: select('#topic-filter'), sort: select('#sort-select'),
  status: select('#data-status'), results: select('#results-status'), count: select('#repository-count'), refresh: select('#refresh-projects'),
  dialog: select('#project-dialog'), dialogContent: select('#dialog-content'), command: select('#command-dialog'), commandInput: select('#command-input'), commandResults: select('#command-results')
};
const state = { config: null, data: null, nextRefresh: 0, activeRepository: null, dialogRequest: 0 };
const openers = new WeakMap();
const closeAnimations = new WeakMap();
const overviewCache = new Map();

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function externalLink(url, label, className = 'text-link') {
  const link = node('a', className, label);
  link.href = safeUrl(url) ?? '#projects';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat(state.config?.locale || 'en', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : 'Date unavailable';
}

function noteFor(repository) {
  return state.config?.projectNotes?.[repository.name] ?? {};
}

function tagsFor(repository) {
  return [...new Set([...repository.topics, ...(noteFor(repository).tags ?? [])])];
}

function tagList(tags, limit = 5) {
  const list = node('div', 'tag-list');
  for (const tag of tags.slice(0, limit)) list.append(node('span', 'tag', tag));
  return list;
}

function projectVisual(kind = 'retrieval') {
  const visual = node('div', `project-visual visual-${kind}`);
  visual.setAttribute('aria-hidden', 'true');
  const symbols = kind === 'agent' ? ['file', 'terminal', 'code'] : kind === 'graph' ? ['code', 'layers', 'grid'] : ['file', 'database', 'spark'];
  for (const [index, symbol] of symbols.entries()) {
    if (index) visual.append(node('span', 'visual-connector', '···'));
    const tile = node('span', 'visual-node');
    tile.append(icon(symbol));
    visual.append(tile);
  }
  return visual;
}

function featuredCard(repository) {
  const note = noteFor(repository);
  const card = node('article', 'featured-card');
  const top = node('div', 'featured-topline');
  const kind = node('span', 'featured-kind');
  kind.append(icon(note.visual === 'agent' ? 'terminal' : 'database'), document.createTextNode(repository.name));
  top.append(kind, node('span', 'featured-badge', 'FEATURED'));
  const heading = node('h3', '', note.label || repository.name);
  const description = node('p', '', note.summary || repository.description || 'Explore the source and documentation on GitHub.');
  const bottom = node('div', 'featured-card-bottom');
  const inspect = node('button', 'inspect-button', 'Inspect project');
  inspect.type = 'button';
  inspect.setAttribute('aria-label', `Inspect ${repository.name}`);
  inspect.append(icon('arrow-up-right'));
  inspect.addEventListener('click', () => openProject(repository, inspect));
  bottom.append(node('span', 'repo-name-small', `${repository.language || 'Source'} / PUBLIC REPOSITORY`), inspect);
  card.append(top, projectVisual(note.visual), heading, description, tagList(tagsFor(repository)), bottom);
  return card;
}

function metadataItem(symbol, content) {
  const item = node('span');
  item.append(icon(symbol), document.createTextNode(content));
  return item;
}

function repositoryCard(repository) {
  const card = node('article', 'project-card');
  const header = node('div', 'project-card-heading');
  const glyph = node('span', 'project-icon');
  glyph.append(icon(noteFor(repository).visual === 'agent' ? 'terminal' : 'code'));
  const heading = node('h3');
  const inspect = node('button', '', repository.name);
  inspect.type = 'button';
  inspect.setAttribute('aria-label', `Details for ${repository.name}`);
  inspect.addEventListener('click', () => openProject(repository, inspect));
  heading.append(inspect);
  const source = externalLink(repository.url, '↗', 'source-shortcut');
  source.setAttribute('aria-label', `Source code for ${repository.name} on GitHub`);
  header.append(glyph, heading, source);
  const description = node('p', 'project-card-description', repository.description || 'No repository description yet. Open the source to explore this project.');
  const footer = node('div', 'project-card-footer');
  const meta = node('div', 'repository-meta');
  const language = node('span');
  language.append(node('i', 'language-dot'), document.createTextNode(repository.language || 'Language not specified'));
  meta.append(language, metadataItem('star', `${repository.stars}`), metadataItem('git-branch', `${repository.forks}`));
  meta.children[1].setAttribute('aria-label', `${repository.stars} stars`);
  meta.children[2].setAttribute('aria-label', `${repository.forks} forks`);
  if (repository.homepage) meta.append(externalLink(repository.homepage, 'Website ↗'));
  if (repository.archived || repository.isFork) meta.append(node('span', 'repo-state', repository.archived ? 'Archived' : 'Fork'));
  const updated = node('span', '', repository.updatedAt ? `Updated ${dateLabel(repository.updatedAt)}` : 'Update date unavailable');
  footer.append(meta, updated);
  card.append(header, description, tagList(tagsFor(repository), 4), footer);
  return card;
}

function showEmpty(title, message, reset = false) {
  const panel = node('div', 'empty-panel');
  panel.append(icon('search'), node('h3', '', title), node('p', '', message));
  if (reset) {
    const button = node('button', 'button button-quiet', 'Clear filters');
    button.type = 'button';
    button.addEventListener('click', () => {
      elements.search.value = '';
      elements.language.value = '';
      elements.topic.value = '';
      renderRepositories();
      elements.search.focus();
    });
    panel.append(button);
  } else if (state.config) panel.append(externalLink(`https://github.com/${state.config.username}?tab=repositories`, 'Browse GitHub ↗', 'button button-quiet'));
  elements.grid.replaceChildren(panel);
}

function renderRepositories() {
  if (!state.data) return;
  const repositories = filterRepositories(state.data.repositories, { query: elements.search.value, language: elements.language.value, topic: elements.topic.value, sort: elements.sort.value }, state.config.projectNotes);
  elements.grid.replaceChildren(...repositories.map(repositoryCard));
  elements.grid.setAttribute('aria-busy', 'false');
  elements.results.textContent = `${repositories.length} of ${state.data.repositories.length} repositories shown.`;
  if (!repositories.length) showEmpty(state.data.repositories.length ? 'No matching projects.' : 'A clean workbench.', state.data.repositories.length ? 'Try a different search, language, or topic.' : 'No public repositories were found for this account. Private work is never included.', state.data.repositories.length > 0);
}

function populateFilters() {
  const selectedLanguage = elements.language.value;
  const selectedTopic = elements.topic.value;
  for (const [element, options, label, selected] of [
    [elements.language, state.data.repositories.map(repository => repository.language).filter(Boolean), 'All languages', selectedLanguage],
    [elements.topic, state.data.repositories.flatMap(tagsFor), 'All topics', selectedTopic]
  ]) {
    const all = node('option', '', label);
    all.value = '';
    element.replaceChildren(all);
    for (const value of [...new Set(options)].sort((first, second) => first.localeCompare(second))) {
      const option = node('option', '', value);
      option.value = value;
      element.append(option);
    }
    element.value = [...element.options].some(option => option.value === selected) ? selected : '';
  }
}

function setDataset(data, source) {
  state.data = validateDataset(data, state.config);
  elements.count.textContent = String(data.repositories.length).padStart(2, '0');
  populateFilters();
  const featured = state.config.featured.map(name => data.repositories.find(repository => repository.name.toLowerCase() === name.toLowerCase())).filter(Boolean);
  elements.featured.replaceChildren(...featured.map(featuredCard));
  elements.featuredArea.hidden = !featured.length;
  const stale = Date.now() - Date.parse(data.generatedAt) > REFRESH_INTERVAL;
  elements.status.textContent = `${source} · ${dateLabel(data.generatedAt)}${stale ? ' · Refresh recommended' : ''}`;
  elements.status.title = `Snapshot generated ${data.generatedAt}. Scheduled updates approximately every six hours.`;
  renderRepositories();
}

function cacheKey() {
  return `portfolio:v1:${state.config.username.toLowerCase()}:${state.config.organizationRepositories.join(',').toLowerCase()}`;
}

function readCache() {
  try { return validateDataset(JSON.parse(localStorage.getItem(cacheKey())), state.config); } catch { return null; }
}

function saveCache(data) {
  try { localStorage.setItem(cacheKey(), JSON.stringify(data)); } catch { return; }
}

async function refreshProjects() {
  if (!state.config) return;
  if (Date.now() < state.nextRefresh) {
    elements.status.textContent = 'Please wait a minute between GitHub refreshes. Your current projects are still available.';
    return;
  }
  state.nextRefresh = Date.now() + 60000;
  elements.refresh.disabled = true;
  elements.status.textContent = 'Checking GitHub for public repositories…';
  try {
    const data = await fetchRepositories(state.config);
    for (const repository of data.repositories) {
      const previous = state.data?.repositories.find(item => item.fullName === repository.fullName && item.pushedAt === repository.pushedAt);
      if (previous) { repository.overview = previous.overview; repository.hasReadme = previous.hasReadme; }
    }
    setDataset(data, 'Refreshed from GitHub');
    saveCache(data);
  } catch (error) {
    elements.status.textContent = `${error.message} ${state.data ? 'Keeping the last successful snapshot.' : 'Use the GitHub link to browse projects.'}`;
    elements.grid.setAttribute('aria-busy', 'false');
    if (!state.data) showEmpty('The connection needs a moment.', 'Repository data is currently unavailable. Try refreshing later, or explore directly on GitHub.');
  } finally {
    elements.refresh.disabled = false;
  }
}

function openDialog(dialog, opener) {
  openers.set(dialog, opener ?? document.activeElement);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (!dialog.open || closeAnimations.has(dialog)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
  const animation = dialog.animate([{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(7px) scale(.985)' }], { duration: 130, easing: 'ease-in', fill: 'forwards' });
  closeAnimations.set(dialog, animation);
  animation.finished.then(() => dialog.close()).catch(() => {});
}

async function openProject(repository, opener) {
  state.activeRepository = repository.fullName;
  const requestId = ++state.dialogRequest;
  const owner = node('p', 'dialog-owner', repository.fullName);
  const heading = node('h2', '', repository.name);
  heading.id = 'dialog-title';
  heading.tabIndex = -1;
  const description = node('p', 'dialog-description', repository.description || 'No description has been added to this repository.');
  const meta = node('div', 'dialog-meta');
  meta.append(metadataItem('code', repository.language || 'Language not specified'), metadataItem('star', `${repository.stars} stars`), metadataItem('git-branch', `${repository.forks} forks`));
  meta.append(node('span', '', `Updated ${dateLabel(repository.updatedAt)}`));
  if (repository.archived || repository.isFork) meta.append(node('span', 'repo-state', repository.archived ? 'Archived repository' : 'Forked repository'));
  const readme = node('section', 'readme-section');
  const overview = node('p', '', repository.overview || overviewCache.get(repository.fullName) || (repository.hasReadme === false ? 'No README is available for this repository. Inspect the source to see what’s inside.' : 'Fetching a short README excerpt…'));
  overview.setAttribute('role', 'status');
  readme.append(node('h3', '', 'From the README'), overview);
  if (repository.hasReadme !== false) readme.append(externalLink(repository.readmeUrl, 'Read the full README on GitHub ↗'));
  const actions = node('div', 'dialog-actions');
  const source = externalLink(repository.url, 'Inspect the source', 'button button-primary');
  source.append(icon('arrow-up-right'));
  actions.append(source);
  if (repository.homepage) actions.append(externalLink(repository.homepage, 'Project website ↗', 'button button-quiet'));
  const note = noteFor(repository);
  elements.dialogContent.replaceChildren(owner, heading, description, tagList(tagsFor(repository), 30), meta);
  if (note.summary) {
    const annotation = node('section', 'readme-section');
    annotation.append(node('h3', '', 'Portfolio notes'), node('p', '', note.summary));
    if (safeUrl(note.evidence)) annotation.append(externalLink(note.evidence, 'Based on the repository README ↗'));
    elements.dialogContent.append(annotation);
  }
  elements.dialogContent.append(readme, actions);
  openDialog(elements.dialog, opener);
  elements.dialog.scrollTop = 0;
  heading.focus({ preventScroll: true });
  if (!repository.overview && !overviewCache.has(repository.fullName) && repository.hasReadme !== false) {
    try {
      const result = await fetchOverview(repository);
      overviewCache.set(repository.fullName, result || 'The README does not contain a short text overview. Use the full README for details.');
      if (requestId === state.dialogRequest) overview.textContent = overviewCache.get(repository.fullName);
    } catch (error) {
      if (requestId === state.dialogRequest) overview.textContent = error.status === 404 ? 'No README is available for this repository.' : 'The README is temporarily unavailable. You can still inspect the source on GitHub.';
    }
  }
}

function renderCommands() {
  const query = elements.commandInput.value.toLowerCase().trim();
  const sections = [ ['Home', '#home'], ['Projects', '#projects'], ['About', '#about'], ['Stack', '#stack'], ['Contact', '#contact'] ];
  const results = [];
  for (const [name, href] of sections.filter(([name]) => name.toLowerCase().includes(query))) {
    const link = node('a', 'command-result');
    link.href = href;
    link.append(node('span', '', name), node('small', '', 'PAGE ↗'));
    link.addEventListener('click', () => {
      elements.command.close();
      requestAnimationFrame(() => {
        const destination = select(href);
        destination.tabIndex = -1;
        destination.focus({ preventScroll: true });
      });
    });
    results.push(link);
  }
  for (const repository of filterRepositories(state.data?.repositories ?? [], { query }, state.config?.projectNotes).slice(0, 10)) {
    const button = node('button', 'command-result');
    button.type = 'button';
    button.append(node('span', '', repository.name), node('small', '', 'PROJECT ↗'));
    button.addEventListener('click', () => { elements.command.close(); openProject(repository, select('#open-command')); });
    results.push(button);
  }
  elements.commandResults.replaceChildren(...results);
  if (!results.length) elements.commandResults.append(node('p', '', 'No matches. Try a page name or repository.'));
}

function openCommands() {
  if (elements.dialog.open) return;
  elements.commandInput.value = '';
  renderCommands();
  openDialog(elements.command, select('#open-command'));
  elements.commandInput.focus();
}

function configureIdentity() {
  const config = state.config;
  document.documentElement.lang = config.locale;
  document.documentElement.dir = config.direction;
  for (const link of document.querySelectorAll('[data-github]')) link.href = `https://github.com/${config.username}`;
  select('#all-repositories').href = `https://github.com/${config.username}?tab=repositories`;
  const contact = select('#additional-contact');
  if (typeof config.email === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(config.email)) {
    const link = node('a', 'text-link', 'Email ↗');
    link.href = `mailto:${encodeURIComponent(config.email)}`;
    contact.append(link);
  }
  for (const link of config.links ?? []) if (safeUrl(link.url) && typeof link.label === 'string') contact.append(externalLink(link.url, `${link.label} ↗`));
}

async function initialize() {
  try {
    const response = await fetch(new URL('../site.config.json', import.meta.url), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Could not load site.config.json.');
    state.config = validateConfig(await response.json());
    configureIdentity();
    const cached = readCache();
    let snapshot;
    try {
      const result = await fetch(new URL('../data/repositories.json', import.meta.url), { cache: 'no-cache', signal: AbortSignal.timeout(10000) });
      if (!result.ok) throw new Error('Snapshot unavailable');
      snapshot = validateDataset(await result.json(), state.config);
    } catch { snapshot = null; }
    if (cached && (!snapshot || Date.parse(cached.generatedAt) > Date.parse(snapshot.generatedAt))) setDataset(cached, 'Browser-cached snapshot');
    else if (snapshot) { setDataset(snapshot, 'Published snapshot'); saveCache(snapshot); }
    if (!snapshot && (!cached || Date.now() - Date.parse(cached.generatedAt) > REFRESH_INTERVAL)) await refreshProjects();
  } catch (error) {
    elements.status.textContent = `Configuration error: ${error.message}`;
    elements.grid.setAttribute('aria-busy', 'false');
    elements.refresh.disabled = true;
    showEmpty('The workspace needs configuration.', 'Check site.config.json and serve this folder with a local HTTP server rather than opening the HTML file directly.');
  }
}

hydrateIcons();
select('#year').textContent = String(new Date().getFullYear());
select('#explorer-form').addEventListener('submit', event => event.preventDefault());
elements.search.addEventListener('input', renderRepositories);
for (const control of [elements.language, elements.topic, elements.sort]) control.addEventListener('change', renderRepositories);
elements.refresh.addEventListener('click', refreshProjects);
select('#filter-toggle').addEventListener('click', event => {
  const expanded = event.currentTarget.getAttribute('aria-expanded') !== 'true';
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
  select('#filter-controls').classList.toggle('is-open', expanded);
});
select('#open-command').addEventListener('click', openCommands);
elements.commandInput.addEventListener('input', renderCommands);
elements.commandInput.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); elements.commandResults.firstElementChild?.focus(); }
  if (event.key === 'Enter') { event.preventDefault(); elements.commandResults.querySelector('a,button')?.click(); }
});
for (const dialog of [elements.dialog, elements.command]) {
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]')].filter(control => control.tabIndex >= 0 && control.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    const active = document.activeElement;
    if (!controls.includes(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDialog(dialog);
  });
  dialog.addEventListener('close', () => {
    closeAnimations.get(dialog)?.cancel();
    closeAnimations.delete(dialog);
    if (dialog === elements.dialog) { state.activeRepository = null; state.dialogRequest += 1; }
    requestAnimationFrame(() => {
      const opener = openers.get(dialog);
      if (!document.querySelector('dialog[open]') && opener?.isConnected) opener.focus({ preventScroll: true });
    });
  });
}
document.addEventListener('keydown', event => {
  const editing = event.target.matches('input,textarea,select,[contenteditable="true"]');
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (elements.command.open) elements.command.close(); else openCommands();
  }
  if (event.key === '/' && !editing && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    elements.search.focus();
    elements.search.scrollIntoView({ block: 'center' });
  }
});
const navigationLinks = [...document.querySelectorAll('.dock a')];
const sections = navigationLinks.map(link => select(link.getAttribute('href')));
let navigationQueued = false;
function updateNavigation() {
  const current = [...sections].reverse().find(section => section.getBoundingClientRect().top < window.innerHeight * .4) ?? sections[0];
  for (const link of navigationLinks) {
    const active = link.getAttribute('href') === `#${current.id}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  }
  navigationQueued = false;
}
window.addEventListener('scroll', () => { if (!navigationQueued) { navigationQueued = true; requestAnimationFrame(updateNavigation); } }, { passive: true });
initialize();
