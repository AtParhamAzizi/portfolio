# Parham Azizi — a local-first developer’s workspace

A custom black liquid-glass portfolio built with semantic HTML, CSS, and native JavaScript modules. No framework, runtime dependencies, external fonts, trackers, or permanent server. The floating system diagram is an illustration, not a claim about a running model or service.

## Quick start

Prerequisite: Node.js 22 or newer (CI uses Node 24).

```sh
npm ci
npm run build
npm run dev
```

Open `http://127.0.0.1:4173/portfolio/`. The preview deliberately uses a repository subpath, just like a GitHub Pages project site. The root URL works too. Rebuild after edits; this is a small static preview server, not a hot-reloading application server. Do not open `index.html` using `file://` because module and JSON requests need HTTP.

## Configuration

Edit `site.config.json`:

| Field | Purpose |
| --- | --- |
| `username` | Public GitHub account to discover. Currently `AtParhamAzizi`, matched to the local Git identity, public profile, and the projects described in the brief. No authenticated GitHub CLI session was available. |
| `featured` | Selected repository **names**. Only matching repositories actually returned by GitHub are featured. An empty list is valid. New repositories still appear in the complete explorer. Update this list after renaming a featured repository. |
| `organizationRepositories` | Explicit public `organization/repository` selections; empty by default. Not an organization-wide scan. |
| `readmeLimit` | Maximum README requests per sync, 0–30; featured repositories first. Defaults to 12. |
| `projectNotes` | Optional hand-written labels, summaries, technology tags, and evidence URLs. These are editorial notes, separate from untouched GitHub descriptions. Remove or update them when a repository changes or is renamed. |
| `email`, `links` | Optional public contact information, e.g. `links: [{"label":"LinkedIn","url":"https://…"}]`. Empty by default. The local Git email is intentionally not published. |
| `locale`, `direction` | Formatting locale and document direction (`ltr` or `rtl`). Copy is English. CSS uses logical spacing properties and components use text nodes, making a future Persian translation straightforward; a full translation is not included. |

The `name` field records the portfolio identity. Personal biography, identity copy, and evidence-linked skills live in `index.html`; update these deliberately when repurposing the site for a different person. Changing the GitHub account does not invent a new biography or skills.

```sh
npm run sync
npm run check
```

Commit `data/repositories.json` with the source. It is a real, dated snapshot generated from the public API, not a hand-written sample. All four initial repositories were inspected; the three annotated projects have README evidence. The ML repository had a description but no README, so no libraries or achievements were inferred from it. Featured is a personal selection, not a certification of production readiness. None of the initial repositories provided a homepage, so no demo links are invented.

## How repository discovery works

1. `.github/workflows/pages.yml` runs on pushes, pull requests, manual dispatch, and every six hours at minute 23 UTC. Only the default branch synchronizes and deploys. Pull requests run checks without deploying.
2. `scripts/sync.mjs` requests `GET https://api.github.com/users/USERNAME/repos?type=owner&sort=updated&per_page=100&page=N` until pagination ends. All owned public repositories are included, including forks and archived repositories with labels. Explicit organization selections are fetched separately.
3. API data is normalized, validated, deduplicated, and sorted. Only public records belonging to the configured account or explicit selections can be published. Names, counts, dates, topics, links, and optional README excerpts have bounded, validated types.
4. Short introductory README paragraphs are extracted as plain text, never rendered as HTML or executable Markdown. The build fetches at most `readmeLimit` READMEs; other excerpts load on demand in the detail dialog. Metadata is never fetched per card.
5. JSON is written atomically **only after a complete successful repository listing**. A failed page never replaces the dataset with partial results. README failures are nonfatal. Actions caches the latest snapshot between runs; the checked-in snapshot is an additional fallback. A sync failure retains the prior validated snapshot and adds a workflow summary warning. Without any valid snapshot, sync/build fails rather than publishing invented or partial data.
6. The build copies only the intended static assets into `dist/`. The browser prefers the published snapshot or a newer validated browser cache. If the published file is unavailable, it can use cached data and/or the public API. “Refresh from GitHub” requests current public metadata for that visitor, with a one-minute cooldown. It does not trigger Actions or change the published file.

There are **no browser tokens**, OAuth scopes, private repository requests, or visitor authentication. Synchronization uses unauthenticated public API access. Large accounts and shared visitor IPs may hit GitHub’s public rate limit; requests time out after 15 seconds, and failures retain existing data. The 1,000-page safety ceiling fails explicitly rather than silently truncating results. README excerpts may still be unavailable until a later sync.

### Freshness

New, updated, deleted, or renamed public repositories appear after the next **successful synchronization and deployment**, normally within approximately six hours, not instantly. GitHub can delay scheduled runs or disable scheduled workflows in inactive public repositories; check Actions periodically. The interface exposes the snapshot date, precise timestamp on hover, and a stale-data notice. Browser refresh is available between deployments. The snapshot can remain older if GitHub is unavailable or the workflow fails.

## Deploy to GitHub Pages

This workspace was initially empty and had no `.git` repository, remote, or authenticated `gh` executable. The site and workflow are ready, but a GitHub repository must still be created/connected and the files pushed. No remote repository or deployment has been created on your behalf.

1. Create a public repository in your GitHub account. Initialize Git in this folder if necessary, add the remote, and push the source including `package-lock.json` and `data/repositories.json` to its default branch. No specific branch name is hardcoded in the workflow.
2. In the repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. Ensure Actions is enabled.
3. Open **Actions → Refresh repositories and deploy Pages → Run workflow** on the default branch, or push a change. If your account requires environment approval, approve the `github-pages` environment deployment.
4. The successful deploy job reports the real Pages URL. Visit it to verify the deployment. No deployment success is claimed until this has happened.

The build job has only `contents: read`. Only the deploy job has `pages: write` and `id-token: write`; there is no repository write permission or personal token. The workflow does not commit generated JSON back to the source branch.

### Base paths and custom domains

All HTML assets are relative, and JSON URLs resolve relative to the JavaScript module. The same `dist/` works at `https://USERNAME.github.io/REPOSITORY/`, a user site, or a custom-domain root without changing a build-time base variable. In-page navigation uses fragments, not client-side routes, so there is no Pages rewrite requirement. For a custom domain, configure DNS and the domain in **Settings → Pages**, then enforce HTTPS after the certificate is issued. Do not put a hostname in the application code.

## Architecture

```text
index.html                  Semantic content and accessible dialog shells
styles.css                  Layered design system, glass fallback, responsive + reduced motion
site.config.json            Account, selected projects, notes, optional contacts
src/app.js                  Explorer, caching, dialogs, command palette, navigation
src/core.js                 Pure normalization, validation, filtering, URL safety
src/github.js               Paginated public API client and bounded README retrieval
src/icons.js                Local, code-native SVG icon set
data/repositories.json      Last successful public snapshot
schema/repositories.schema.json  Snapshot JSON Schema
scripts/                    Static build, preview server, sync, validation
tests/                      Unit, integration, browser, and accessibility checks
.github/workflows/pages.yml Scheduled synchronization, checks, and Pages deployment
```

All npm dependencies are pinned, test-only dependencies. The deployed site has zero npm/runtime dependencies and needs only a static host. Native `<dialog>` supplies modal semantics, inert background, Escape handling, and keyboard focus containment; the app restores focus to its opener. Current evergreen browsers are the target. Blur has an opaque fallback. No perpetual motion is used.

### Keyboard controls

- Tab / Shift+Tab: all navigation, filters, project actions, and dialog controls.
- Ctrl+K / Cmd+K: workspace search. Type a page or repository, then Tab to a result or press Enter for the first match.
- `/`: focus repository search unless already editing text.
- Escape: close the active dialog and restore focus.

## Verification

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

If browser downloads are unavailable but Chrome is already installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser` (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'; npm run test:browser`). CI uses Playwright's downloaded Chromium by default.

`check` validates JSON against its schema and ownership rules, checks workflow YAML and permission boundaries, checks JS syntax, relative URLs, whitespace, and common credential patterns, runs Node tests, and builds the static output. Unit/integration tests cover pagination, errors and partial-page failure, empty/missing metadata, safe URLs, README extraction, explicit organization inclusion, filtering/sorting, and last-good-snapshot preservation.

Playwright tests the actual rendered site on desktop and mobile Chromium, including repository-subpath asset loading, search/filter/sort, modal Tab containment and Escape focus restoration, command navigation, 0/1/3/10/50 repositories, inert untrusted content, API fallback, cache retention, storage denial, reduced motion, horizontal overflow, and automated WCAG A/AA scans with axe. Test fixtures are never copied to `dist/`. Automated checks are not a substitute for assistive-technology and real-device review. Safari/Firefox, an actual iPhone, and deployed Lighthouse scores require separate verification; no scores are asserted here.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Blank/missing project explorer locally | Use `npm run build && npm run dev`, not `file://`. Check the configuration error/status text. |
| Old projects | Check the displayed snapshot date and Actions run; use “Refresh from GitHub” for a visitor-local update or manually run the default-branch workflow. |
| A renamed featured project disappears | Discovery follows the new name automatically; update the `featured` and `projectNotes` keys separately. |
| API rate limit | Wait before retrying. The last successful dataset remains available; never add a token to frontend configuration. |
| Wrong account after configuration changes | Run `npm run sync` and rebuild. Snapshots for a different account or disallowed owner are rejected. |
| Pages returns 404 | Enable GitHub Actions as the Pages source, verify the default-branch deploy job and environment, and use the reported project-site URL including its repository path. |
| README unavailable | Missing, large, or rate-limited READMEs fall back to the description and source link. The full document is never injected. |
| Schedule stops | Verify Actions is enabled, recent workflow activity, GitHub service availability, and repository/environment permissions. Run manually to resume. |
| No email/social links | Deliberately empty. Publish only contact details you authorize in `site.config.json`. |

## Security boundaries

Repository and README content is untrusted and enters the DOM only as text. External URLs reject executable protocols, credentials, localhost, and literal IP addresses; new tabs use `noopener noreferrer`. This is link hygiene, not a guarantee about external website content. No secrets or private account information are needed or intentionally published. The credential-pattern check is a useful guard, not a comprehensive secret scanner. Review contact configuration and editorial notes before publishing.
