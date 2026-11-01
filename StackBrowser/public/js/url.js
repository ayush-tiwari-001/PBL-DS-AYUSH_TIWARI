// Address handling helpers.
export const HOME = 'stackbrowser://home';
const SEARCH = 'https://html.duckduckgo.com/html/?q=';

export const isHome = (url) => url === HOME;

// Turn whatever the user typed into a URL, or report why it cannot be opened.
export function resolveInput(raw) {
  const text = (raw || '').trim();
  if (!text) return { error: 'Type a web address or something to search for.' };
  if (/^stackbrowser:\/\/home\/?$/i.test(text)) return { url: HOME };
  if (/^https?:\/\//i.test(text)) {
    try { return { url: new URL(text).href }; } catch (_) { return { error: 'That address is not valid.' }; }
  }
  // Other schemes (javascript:, file:, ftp:, ...) are not supported. Allow "host:port" and "localhost:3000".
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^\s/]+:\d+(\/|$)/.test(text)) {
    return { error: 'Only http and https addresses can be opened.' };
  }
  const looksLikeHost = !/\s/.test(text) && (/^localhost(:\d+)?(\/|$)/i.test(text) || /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(text));
  if (looksLikeHost) {
    try { return { url: new URL('https://' + text).href }; } catch (_) { /* fall through to search */ }
  }
  return { url: SEARCH + encodeURIComponent(text), searched: text };
}

export function hostOf(url) {
  if (isHome(url)) return 'Home';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; }
}

export function pathOf(url) {
  if (isHome(url)) return '';
  try { const u = new URL(url); const p = u.pathname + u.search; return p === '/' ? '' : p; } catch (_) { return ''; }
}

export function isSecure(url) {
  try { return new URL(url).protocol === 'https:'; } catch (_) { return false; }
}

// What the address bar shows: no scheme for https, keeps http visible.
export function displayUrl(url) {
  if (isHome(url)) return '';
  return url.replace(/^https:\/\//i, '');
}

export function proxyUrl(url, bust) {
  return '/proxy?url=' + encodeURIComponent(url) + (bust ? '&_=' + bust : '');
}
