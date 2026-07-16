// Applies the stored theme (or the OS preference) before first paint.
// External file rather than an inline script so it satisfies the strict CSP
// script-src 'self' everywhere — including the statically prerendered
// /offline page, where a per-request nonce can't exist.
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {
  /* storage unavailable — stay on the default (light) theme */
}
