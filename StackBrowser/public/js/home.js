// The start page shown for stackbrowser://home.
import { icons } from './icons.js';

const SHORTCUTS = [
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/', letter: 'W', hue: 215 },
  { name: 'Hacker News', url: 'https://news.ycombinator.com/', letter: 'Y', hue: 25 },
  { name: 'MDN Web Docs', url: 'https://developer.mozilla.org/', letter: 'M', hue: 235 },
  { name: 'Google', url: 'https://www.google.com/?zx=1792239521828', letter: 'D', hue: 15 },
  { name: 'GitHub', url: 'https://github.com/', letter: 'G', hue: 265 },
  { name: 'Example Domain', url: 'https://example.com/', letter: 'E', hue: 160 },
  { name: 'Youtube', url: 'https://www.youtube.com/', letter: 'Y', hue: 160 },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up?';
  if (h < 12) return 'Good morning.';
  if (h < 14) return 'Good afternoon.';
  return 'Good evening.';
}

export function createHome({ onSubmit, onOpen }) {
  const el = document.createElement('div');
  el.className = 'home';
  el.innerHTML = `
    <div class="home-cells" aria-hidden="true"></div>
    <div class="home-body">
      <div class="home-brand"><svg class="home-mark" aria-hidden="true"><use href="#logo"/></svg><h1>StackBrowser</h1></div>
      <p class="home-welcome">${greeting()} Where to?</p>
      <form class="home-search" role="search">
        <span class="home-search-icon">${icons.search}</span>
        <input type="text" spellcheck="false" autocomplete="off" placeholder="Search the web or enter an address" aria-label="Search the web or enter an address">
      </form>
      <div class="shortcuts" role="list"></div>
      <div class="home-history" role="status"></div>
    </div>`;

  const input = el.querySelector('input');
  el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    onSubmit(v);
  });

  const list = el.querySelector('.shortcuts');
  SHORTCUTS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shortcut';
    b.setAttribute('role', 'listitem');
    b.innerHTML = `<span class="shortcut-tile" style="--hue:${s.hue}">${s.letter}</span><span class="shortcut-name">${s.name}</span>`;
    b.addEventListener('click', () => onOpen(s.url));
    list.appendChild(b);
  });

  const cellsEl = el.querySelector('.home-cells');
  const historyEl = el.querySelector('.home-history');

  // Reflects the real engine state: how many Back / Forward operations are available.
  function update(state) {
    const back = state ? state.backCount : 0;
    const fwd = state ? state.forwardCount : 0;
    historyEl.innerHTML =
      `<span class="hh ${back ? 'on' : ''}">${icons.back}<b>${back}</b> back</span>` +
      `<span class="hh-sep"></span>` +
      `<span class="hh ${fwd ? 'on' : ''}"><b>${fwd}</b> forward${icons.forward}</span>`;

    // Faint row of array cells along the bottom edge, drawn from the same state.
    const cap = state ? state.capacity : 16;
    if (cellsEl.childElementCount !== cap) {
      cellsEl.style.setProperty('--n', cap);
      cellsEl.innerHTML = '<i></i>'.repeat(cap);
    }
    [...cellsEl.children].forEach((c, i) => {
      const filled = state && state.cells[i] !== null && state.cells[i] !== undefined;
      c.className = filled ? (i <= state.backTop ? 'b' : 'f') : '';
    });
  }

  function focusSearch() { input.focus(); }
  update(null);
  return { el, update, focusSearch };
}
