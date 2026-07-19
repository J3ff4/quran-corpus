// Applies the stored theme (or the OS preference) before first paint.
// External file rather than an inline script so it satisfies the strict CSP
// script-src 'self' everywhere — including the statically prerendered
// /offline page, where a per-request nonce can't exist.
function isDark(stored) {
  return stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}
try {
  document.documentElement.classList.toggle('dark', isDark(localStorage.getItem('theme')));
} catch (e) {
  /* storage unavailable — stay on the default (light) theme */
}

// Cross-tab sync independent of React: useTheme()'s own 'storage' listener
// only runs while ThemeToggle is mounted (inside the drawer), so a theme
// change in another tab wouldn't reach the page's <html> class while the
// drawer is closed. This listener lives for the page's whole lifetime.
window.addEventListener('storage', function (e) {
  if (e.key !== 'theme') return;
  document.documentElement.classList.toggle('dark', isDark(e.newValue));
});
