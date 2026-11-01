// Bookmarks are stored in this browser's localStorage (real data, nothing pre-filled).
const KEY = 'stackbrowser.bookmarks';

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((b) => b && typeof b.url === 'string') : [];
  } catch (_) { return []; }
}
function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* storage unavailable */ } }

export const bookmarks = {
  all: read,
  has: (url) => read().some((b) => b.url === url),
  toggle(url, title) {
    const list = read();
    const i = list.findIndex((b) => b.url === url);
    if (i >= 0) { list.splice(i, 1); write(list); return false; }
    list.push({ url, title: title || url });
    write(list);
    return true;
  },
  clear: () => write([]),
};
