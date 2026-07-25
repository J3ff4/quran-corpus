/**
 * Client-side cookie access for the small bits of per-user state the server
 * needs to render (reading history, bookmarks) — localStorage can't be read
 * during SSR, which is what forces the cookie.
 */

// One year: long enough to feel permanent for preference-shaped state.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readCookie(name: string): string | undefined {
  try {
    return document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  } catch {
    return undefined;
  }
}

/**
 * Writes a cookie and reports whether it stuck: browsers drop an oversized or
 * blocked cookie silently, so the value is read back rather than assumed.
 * `Secure` is set only over https, since it would make the cookie unusable on
 * a plain-http dev server.
 */
export function writeCookie(name: string, value: string): boolean {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    return readCookie(name) === value;
  } catch {
    return false;
  }
}
