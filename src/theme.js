(() => {
  const storageKey = 'portfolio:theme';
  const root = document.documentElement;
  let toggle;
  let label;

  function applyTheme(theme) {
    root.dataset.theme = theme === 'light' ? 'light' : 'dark';
    const isLight = root.dataset.theme === 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight ? '#ffffff' : '#08090c');
    if (toggle) {
      const nextMode = isLight ? 'dark' : 'light';
      toggle.setAttribute('aria-label', `Switch to ${nextMode} mode`);
      label.textContent = `${isLight ? 'Dark' : 'Light'} mode`;
    }
  }

  let savedTheme;
  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch {}
  applyTheme(savedTheme);

  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.querySelector('#theme-toggle');
    label = document.querySelector('#theme-toggle-label');
    if (!toggle || !label) return;
    applyTheme(root.dataset.theme);
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
      try {
        localStorage.setItem(storageKey, root.dataset.theme);
      } catch {}
    });
  });

  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) applyTheme(event.newValue);
  });
})();
