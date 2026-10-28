const paths = {
  search: ['M21 21l-5-5', 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z'],
  github: ['M9 19c-4.3 1.3-4.3-2-6-2.5M15 22v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.9A5.4 5.4 0 0 0 19 4.9a5 5 0 0 0-.1-3.7S17.7.8 15 2.6a13 13 0 0 0-6 0C6.3.8 5.1 1.2 5.1 1.2A5 5 0 0 0 5 4.9a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.2 6.6 6.3 6.9a3.4 3.4 0 0 0-.9 2.6V22'],
  'arrow-down': ['M12 4v16m-6-6 6 6 6-6'],
  'arrow-up-right': ['M6 18 18 6M6 6h12v12'],
  layers: ['m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5'],
  database: ['M21 5c0 2.2-4 4-9 4S3 7.2 3 5s4-4 9-4 9 1.8 9 4Zm0 0v14c0 2.2-4 4-9 4s-9-1.8-9-4V5m0 7c0 2.2 4 4 9 4s9-1.8 9-4'],
  spark: ['m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z'],
  terminal: ['M3 4h18v16H3V4Zm4 5 3 3-3 3m6 0h4'],
  code: ['m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18'],
  sliders: ['M4 3v7m0 4v7m8-18v12m0 4v2m8-18v2m0 4v12M1 10h6m2 9h6m2-14h6'],
  refresh: ['M20 7a9 9 0 1 0 1 9M20 2v6h-6'],
  'git-branch': ['M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15c7 0 12-2 12-6'],
  chart: ['M3 3v18h18M7 16l4-5 4 2 5-7'],
  geometry: ['m12 2 10 18H2L12 2Zm0 0v18M2 20l15-9M22 20 7 11'],
  home: ['m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z'],
  grid: ['M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z'],
  user: ['M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 6 0 0 1 16 0v2'],
  message: ['M21 12a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L2 22l1.9-6A10 10 0 0 1 3 12a9 9 0 0 1 18 0Z'],
  close: ['m6 6 12 12M6 18 18 6'],
  star: ['m12 2 3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.5-6.3 3.5 1.5-7L2 9.3l7-.8L12 2Z'],
  file: ['M4 2h10l6 6v14H4V2Zm10 0v6h6M8 13h8m-8 4h6']
};

export function icon(name) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  for (const [attribute, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'icon', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(attribute, value);
  for (const definition of paths[name] ?? paths.code) {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', definition);
    svg.append(path);
  }
  return svg;
}

export function hydrateIcons(root = document) {
  for (const placeholder of root.querySelectorAll('[data-icon]')) placeholder.append(icon(placeholder.dataset.icon));
}
