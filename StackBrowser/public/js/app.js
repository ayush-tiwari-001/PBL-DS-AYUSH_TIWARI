// StackBrowser UI controller.
// Every Back / Forward / navigation goes through the C++ history engine (via /api);
// the browser's own history is never used. The inspector renders the engine's real state.
import { api } from './api.js';
import { hydrateIcons, icons } from './icons.js';
import { HOME, isHome, resolveInput, hostOf, isSecure, displayUrl, proxyUrl } from './url.js';
import { bookmarks } from './bookmarks.js';
import { createHome } from './home.js';
import { DsaPanel } from './dsa-panel.js';

const $ = (id) => document.getElementById(id);
const el = {
  tabs: $('tabs'), newTab: $('newTab'), back: $('backBtn'), forward: $('forwardBtn'),
  reload: $('reloadBtn'), home: $('homeBtn'), omnibox: $('omnibox'), address: $('address'),
  secIcon: $('secIcon'), bookmark: $('bookmarkBtn'), devToggle: $('devToggle'), menuBtn: $('menuBtn'),
  menu: $('menu'), miDev: $('miDev'), miBookmarks: $('miBookmarks'), miReset: $('miReset'),
  miClearBookmarks: $('miClearBookmarks'), progress: $('progress'), bar: $('bookmarksBar'),
  viewport: $('viewport'), dsa: $('dsa'), dsaRoot: $('dsaRoot'), statusMsg: $('statusMsg'),
  statusCounts: $('statusCounts'), statusDev: $('statusDev'),backStackItems: $('backStackItems'),
forwardStackItems: $('forwardStackItems'),
backStackCount: $('backStackCount'),
forwardStackCount: $('forwardStackCount'),
stackVisibilityBtn: $('stackVisibilityBtn'),
};

const tabs = [];
let active = null;
let dsaPanel;

// ---------- settings ----------
const settings = (() => {
  try { return Object.assign({ dev: false, bar: true }, JSON.parse(localStorage.getItem('stackbrowser.settings') || '{}')); }
  catch (_) { return { dev: false, bar: true }; }
})();
const saveSettings = () => { try { localStorage.setItem('stackbrowser.settings', JSON.stringify(settings)); } catch (_) { /* ignore */ } };

// ---------- status area ----------
let statusTimer;
function setStatus(text, kind = '') {
  clearTimeout(statusTimer);
  const icon = kind === 'ok' ? icons.check : kind === 'error' ? icons.alert : kind === 'busy' ? '<span class="spinner"></span>' : '';
  el.statusMsg.className = 'status-msg ' + kind;
  el.statusMsg.innerHTML = icon + '<span></span>';
  el.statusMsg.lastChild.textContent = text;
  if (kind === 'ok') statusTimer = setTimeout(() => { if (el.statusMsg.classList.contains('ok')) el.statusMsg.className = 'status-msg'; }, 5000);
}

// ---------- loading progress ----------
function paintProgress(tab) {
  if (tab !== active) return;
  el.progress.classList.toggle('on', tab.loading);
  el.progress.firstElementChild.style.width = (tab.loading ? tab.progress : 0) + '%';
  el.reload.classList.toggle('loading', tab.loading);
}
function startLoading(tab) {
  clearInterval(tab.progTimer); clearTimeout(tab.progTimeout);
  tab.loading = true; tab.progress = 8;
  tab.progTimer = setInterval(() => { tab.progress += (90 - tab.progress) * 0.07; paintProgress(tab); }, 120);
  tab.progTimeout = setTimeout(() => finishLoading(tab, true), 25000);
  paintProgress(tab);
  if (tab === active) setStatus('Loading ' + hostOf(tab.state.current) + '…', 'busy');
}
function finishLoading(tab, timedOut = false) {
  if (!tab.loading) return;
  clearInterval(tab.progTimer); clearTimeout(tab.progTimeout);
  tab.progress = 100;
  if (tab === active) {
    el.progress.firstElementChild.style.width = '100%';
    setTimeout(() => { tab.loading = false; paintProgress(tab); }, 260);
    setStatus(timedOut ? 'Still waiting on ' + hostOf(tab.state.current) : 'Loaded ' + hostOf(tab.state.current), timedOut ? '' : 'ok');
  }
  tab.loading = false;
}

// ---------- engine results ----------
function record(tab, r) {
  if (r.state) tab.state = r.state;
  if (typeof r.message === 'string' && r.state && r.message !== 'STATE') {
    const op = r.message.split(' ')[0];
    tab.log.push({ time: new Date(), op, text: r.message.slice(op.length + 1).replace(/^->\s*/, ''), ok: !!r.ok, fresh: true });
    if (tab.log.length > 200) tab.log.shift();
  }
  tab.version++;
  if (tab.state) tab.home.update(tab.state);
}

const enqueue = (tab, fn) => (tab.queue = tab.queue.then(fn).catch((e) => console.error(e)));

// ---------- page view ----------
function showPage(tab, force = false) {
  const url = tab.state.current;
  if (isHome(url)) {
    tab.home.el.hidden = false;
    if (tab.iframe) tab.iframe.hidden = true;
    tab.loadedUrl = null; tab.pageTitle = '';
    finishLoading(tab);
    if (tab === active && !force) tab.home.focusSearch();
    return;
  }
  tab.home.el.hidden = true;
  if (!tab.iframe) {
    const f = document.createElement('iframe');
    f.className = 'frame';
    f.title = 'Web page';
    // No allow-same-origin: proxied sites cannot touch StackBrowser's own origin.
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
    f.addEventListener('load', () => finishLoading(tab));
    tab.iframe = f;
    tab.page.appendChild(f);
  }
  tab.iframe.hidden = false;
  if (tab.loadedUrl !== url || force) {
    tab.loadedUrl = url; tab.pageTitle = '';
    startLoading(tab);
    tab.iframe.src = proxyUrl(url, force ? Date.now() : 0);
  }
}

// ---------- navigation (all history changes are engine operations) ----------
function applyResult(tab, r, okText) {
  if (r.offline) { setStatus(r.message, 'error'); return false; }
  record(tab, r);
  if (!r.ok) {
    setStatus(r.message || 'That did not work.', r.state ? '' : 'error');
    if (tab === active) renderChrome();
    return false;
  }
  if (tab === active) renderChrome();
  if (okText) setStatus(okText, 'ok');
  return true;
}

function go(tab, url, searched) {
  return enqueue(tab, async () => {
    if (tab.state && tab.state.current === url) {
      if (isHome(url)) { setStatus('You are already on the start page.', 'ok'); return; }
      showPage(tab, true); return;
    }
    const r = await api.navigate(tab.id, url);
    if (applyResult(tab, r)) {
      showPage(tab);
      if (searched && tab === active) setStatus('Searching for “' + searched + '”…', 'busy');
    }
  });
}

function goBack(tab) {
  return enqueue(tab, async () => {
    if (!tab.state || !tab.state.canGoBack) return;
    const r = await api.back(tab.id);
    if (applyResult(tab, r)) showPage(tab);
  });
}
function goForward(tab) {
  return enqueue(tab, async () => {
    if (!tab.state || !tab.state.canGoForward) return;
    const r = await api.forward(tab.id);
    if (applyResult(tab, r)) showPage(tab);
  });
}
function reload(tab) {
  if (isHome(tab.state.current)) { setStatus('Start page is up to date.', 'ok'); return; }
  showPage(tab, true);
}
function submit(tab, raw) {
  const r = resolveInput(raw);
  if (r.error) { setStatus(r.error, 'error'); return; }
  go(tab, r.url, r.searched);
}

// ---------- tabs ----------
const tabTitle = (t) => (isHome(t.state.current) ? 'New tab' : t.pageTitle || hostOf(t.state.current));

function buildTabEl(tab) {
  const d = document.createElement('div');
  d.className = 'tab';
  d.setAttribute('role', 'tab');
  d.tabIndex = 0;
  d.innerHTML = `<span class="tab-ico">${icons.globe}</span><span class="tab-title"></span>` +
    `<button type="button" class="tab-close" aria-label="Close tab" title="Close tab">${icons.x}</button>`;
  d.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) activate(tab); });
  d.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab); });
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(tab); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = tabs[(i + tabs.length) % tabs.length];
      activate(next); next.tabEl.focus();
    }
  });
  d.querySelector('.tab-close').addEventListener('click', () => closeTab(tab));
  return d;
}

async function createTab() {
  const r = await api.newTab();
  if (!r.tabId) { setStatus(r.message || 'Could not open a new tab.', 'error'); return null; }
  const tab = {
    id: r.tabId, state: null, log: [], version: 0, pageTitle: '', loadedUrl: null, iframe: null,
    loading: false, progress: 0, queue: Promise.resolve(),
  };
  tab.page = document.createElement('div');
  tab.page.className = 'page';
  tab.home = createHome({ onSubmit: (v) => submit(tab, v), onOpen: (u) => go(tab, u) });
  tab.page.appendChild(tab.home.el);
  tab.tabEl = buildTabEl(tab);
  el.viewport.appendChild(tab.page);
  el.tabs.appendChild(tab.tabEl);
  tabs.push(tab);
  r.entries.forEach((e) => record(tab, e));
  activate(tab);
  return tab;
}

async function closeTab(tab) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  clearInterval(tab.progTimer); clearTimeout(tab.progTimeout);
  await api.closeTab(tab.id);
  tabs.splice(i, 1);
  tab.tabEl.remove(); tab.page.remove();
  dsaPanel.forget(tab.id);
  if (!tabs.length) { await createTab(); return; }
  if (tab === active) activate(tabs[Math.min(i, tabs.length - 1)]);
}

function activate(tab) {
  active = tab;
  tabs.forEach((t) => {
    const on = t === tab;
    t.page.classList.toggle('active', on);
    t.tabEl.classList.toggle('active', on);
    t.tabEl.setAttribute('aria-selected', String(on));
    t.tabEl.tabIndex = on ? 0 : -1;
  });
  el.address.blur();
  showPage(tab);
  renderChrome();
  paintProgress(tab);
  tab.tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderSideStacks(tab) {
  if (!tab?.state) return;

  const st = tab.state;

  // Back stack occupies cells 0 through backTop.
  const backItems = st.cells
    .slice(0, st.backTop + 1)
    .filter(Boolean);

  // Forward stack occupies cells forwardTop through the end.
  const forwardItems = st.cells
    .slice(st.forwardTop)
    .filter(Boolean);

  function draw(container, urls, countElement) {
    if (!container || !countElement) return;

    countElement.textContent = urls.length;
    container.replaceChildren();

    if (!urls.length) {
      const empty = document.createElement('div');
      empty.className = 'stack-empty';
      empty.textContent = 'Stack empty';
      container.appendChild(empty);
      return;
    }

    urls.forEach((url, index) => {
      const item = document.createElement('div');
      item.className = 'stack-site';
      item.textContent = hostOf(url);
      item.title = url;
      item.setAttribute('aria-label', hostOf(url));

      // Animate newly rendered stack entries.
      item.style.animationDelay = `${index * 25}ms`;

      container.appendChild(item);
    });
  }

  draw(el.backStackItems, backItems, el.backStackCount);
  draw(el.forwardStackItems, forwardItems, el.forwardStackCount);
}

// ---------- chrome rendering ----------
function renderChrome() {
  const tab = active;
  if (!tab || !tab.state) return;
  const st = tab.state;
  const url = st.current;
  const home = isHome(url);

  el.back.disabled = !st.canGoBack;
  el.forward.disabled = !st.canGoForward;
  if (document.activeElement !== el.address) el.address.value = displayUrl(url);

  if (home) { el.secIcon.className = 'omni-icon brand'; el.secIcon.innerHTML = '<svg aria-hidden="true"><use href="#logo"/></svg>'; el.secIcon.title = 'StackBrowser start page'; }
  else if (isSecure(url)) { el.secIcon.className = 'omni-icon secure'; el.secIcon.innerHTML = icons.lock; el.secIcon.title = 'Connection is encrypted (https)'; }
  else { el.secIcon.className = 'omni-icon insecure'; el.secIcon.innerHTML = icons.warn; el.secIcon.title = 'Connection is not encrypted (http)'; }

  const marked = !home && bookmarks.has(url);
  el.bookmark.disabled = home;
  el.bookmark.innerHTML = marked ? icons.starFill : icons.star;
  el.bookmark.classList.toggle('on', marked);
  el.bookmark.setAttribute('aria-pressed', String(marked));
  el.bookmark.title = home ? 'Open a page to bookmark it' : marked ? 'Remove bookmark' : 'Bookmark this page';

  tabs.forEach((t) => {
    const title = tabTitle(t);
    t.tabEl.querySelector('.tab-title').textContent = title;
    t.tabEl.title = title;
  });
  document.title = (home ? 'New tab' : tabTitle(tab)) + ' – StackBrowser';

  el.statusCounts.innerHTML = `<span>Back <b>${st.backCount}</b></span><span>Forward <b>${st.forwardCount}</b></span>`;
  renderSideStacks(tab);
  dsaPanel.render(tab);
  renderBookmarksBar();
}

function renderBookmarksBar() {
  const list = bookmarks.all();
  el.bar.hidden = !(settings.bar && list.length);
  el.bar.innerHTML = '';
  list.forEach((b) => {
    const wrap = document.createElement('div');
    wrap.className = 'bm';
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'bm-open'; open.title = b.url;
    open.innerHTML = `<span class="bm-tile"></span><span class="bm-title"></span>`;
    open.querySelector('.bm-tile').textContent = (hostOf(b.url)[0] || '?').toUpperCase();
    open.querySelector('.bm-title').textContent = b.title || hostOf(b.url);
    open.addEventListener('click', () => go(active, b.url));
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'bm-del'; del.innerHTML = icons.x;
    del.title = 'Remove bookmark'; del.setAttribute('aria-label', 'Remove bookmark ' + (b.title || b.url));
    del.addEventListener('click', () => { bookmarks.toggle(b.url); renderChrome(); });
    wrap.append(open, del);
    el.bar.appendChild(wrap);
  });
}

// ---------- developer panel & menu ----------
function setDev(open) {
  settings.dev = open; saveSettings();
  el.dsa.classList.toggle('open', open);
  el.dsa.setAttribute('aria-hidden', String(!open));
  el.dsa.inert = !open;
  [el.devToggle, el.statusDev].forEach((b) => b.setAttribute('aria-expanded', String(open)));
  el.devToggle.classList.toggle('on', open);
  el.statusDev.classList.toggle('on', open);
  el.miDev.setAttribute('aria-checked', String(open));
}
function setBar(on) {
  settings.bar = on; saveSettings();
  el.miBookmarks.setAttribute('aria-checked', String(on));
  renderBookmarksBar();
}
function setMenu(open) {
  el.menu.hidden = !open;
  el.menuBtn.setAttribute('aria-expanded', String(open));
  el.menuBtn.classList.toggle('on', open);
  if (open) el.menu.querySelector('.menu-item').focus();
}

// ---------- wiring ----------
function wire() {
  el.back.addEventListener('click', () => goBack(active));
  el.forward.addEventListener('click', () => goForward(active));
  el.reload.addEventListener('click', () => reload(active));
  el.home.addEventListener('click', () => go(active, HOME));
  el.newTab.addEventListener('click', () => createTab());

  el.omnibox.addEventListener('submit', (e) => { e.preventDefault(); const v = el.address.value; el.address.blur(); submit(active, v); });
  el.address.addEventListener('focus', () => el.address.select());
  el.address.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { el.address.value = displayUrl(active.state.current); el.address.blur();
      
     }
  });

  el.bookmark.addEventListener('click', () => {
    const url = active.state.current;
    if (isHome(url)) return;
    const added = bookmarks.toggle(url, tabTitle(active));
    renderChrome();
    setStatus(added ? 'Bookmarked ' + hostOf(url) : 'Bookmark removed', 'ok');
  });

  el.devToggle.addEventListener('click', () => setDev(!settings.dev));
  el.statusDev.addEventListener('click', () => setDev(!settings.dev));

  // Hide/show the side stack containers
  const stackBtn = el.stackVisibilityBtn;

  if (stackBtn) {
    const key = 'stackbrowser.stacksVisible';

    function syncStacks() {
      const visible = localStorage.getItem(key) !== 'false';

      el.viewport.classList.toggle('stacks-hidden', !visible);
      stackBtn.textContent = visible ? 'Hide stacks' : 'Show stacks';
      stackBtn.setAttribute('aria-pressed', String(visible));
      stackBtn.title = visible
        ? 'Hide side stack containers'
        : 'Show side stack containers';
    }

    syncStacks();

    stackBtn.addEventListener('click', () => {
      const visible = el.viewport.classList.contains('stacks-hidden');
      localStorage.setItem(key, String(visible));
      syncStacks();
    });
  }

  el.menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenu(el.menu.hidden); });
  document.addEventListener('click', (e) => { if (!el.menu.hidden && !e.target.closest('.menu-wrap')) setMenu(false); });
  el.menu.addEventListener('keydown', (e) => {
    const items = [...el.menu.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  el.miDev.addEventListener('click', () => setDev(!settings.dev));
  el.miBookmarks.addEventListener('click', () => setBar(!settings.bar));
  el.miReset.addEventListener('click', () => {
    setMenu(false);
    const tab = active;
    enqueue(tab, async () => { const r = await api.reset(tab.id); applyResult(tab, r, 'Cleared this tab’s Back and Forward history'); });
  });
  el.miClearBookmarks.addEventListener('click', () => {
    setMenu(false);
    bookmarks.clear(); renderChrome(); setStatus('All bookmarks removed', 'ok');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.menu.hidden) { setMenu(false); el.menuBtn.focus(); return; }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(active); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(active); }
    else if (e.altKey && e.key === 'Home') { e.preventDefault(); go(active, HOME); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); el.address.focus(); }
    else if (e.key === '/' && isHome(active.state.current) && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); active.home.focusSearch();
    }
  });

  // Messages from proxied pages: link clicks and GET forms are routed into the C++ history.
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || !d.sb) return;
    const tab = tabs.find((t) => t.iframe && t.iframe.contentWindow === e.source);
    if (!tab) return;
    if (d.sb === 'navigate' && typeof d.url === 'string' && /^https?:\/\//i.test(d.url)) go(tab, d.url);
    else if (d.sb === 'title' && typeof d.title === 'string') { tab.pageTitle = d.title.slice(0, 120).trim(); if (tab === active) renderChrome(); }
    else if (d.sb === 'loaded') finishLoading(tab);
  });
}

async function init() {
  hydrateIcons();
  dsaPanel = new DsaPanel(el.dsaRoot, { onClose: () => setDev(false) });
  setDev(settings.dev);
  el.miBookmarks.setAttribute('aria-checked', String(settings.bar));
  wire();
  setStatus('Starting…', 'busy');
  const tab = await createTab();
  if (tab) setStatus('Ready', 'ok');
}
init();
