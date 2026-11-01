// Collapsible inspector that renders the REAL state returned by the C++ engine:
// one shared array, the Back stack growing from the left, the Forward stack from the right.
import { icons } from './icons.js';
import { hostOf, pathOf, isHome } from './url.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export class DsaPanel {
  constructor(root, { onClose }) {
    this.root = root;
    this.prev = new Map();       // tabId -> previous cells, used to animate pushes and pops
    root.innerHTML = `
      <div class="dsa-head">
        <div class="dsa-title"><strong>History inspector</strong><span class="dsa-sub">C++ engine &middot; two stacks in one array</span></div>
        <div class="dsa-meta" data-meta></div>
        <button class="icon-btn small" type="button" data-close title="Collapse inspector" aria-label="Collapse inspector">${icons.chevronDown}</button>
      </div>
      <div class="dsa-body">
        <div class="dsa-main">
          <div class="dsa-current"><span class="dot"></span><span class="lbl">Current page</span><code data-current></code></div>
          <div class="dsa-scroll"><div class="dsa-grid" data-grid>
            <div class="row segs" data-segs></div>
            <div class="row indices" data-indices></div>
            <div class="row cells" data-cells></div>
            <div class="row ptr ptr-back" data-ptr-back></div>
            <div class="row ptr ptr-fwd" data-ptr-fwd></div>
          </div></div>
        </div>
        <div class="dsa-log">
          <div class="dsa-log-head">Operation log</div>
          <ol data-log aria-live="off"></ol>
        </div>
      </div>`;
    root.querySelector('[data-close]').addEventListener('click', onClose);
    this.q = (s) => root.querySelector(s);
  }

  render(tab) {
    const st = tab && tab.state;
    if (!st) return;
    // Re-rendering identical state would restart the push/pop animations, so skip it.
    if (this.lastTab === tab.id && this.lastVersion === tab.version) return;
    this.lastTab = tab.id;
    this.lastVersion = tab.version;
    const n = st.capacity;
    const grid = this.q('[data-grid]');
    grid.style.setProperty('--n', n);

    this.q('[data-meta]').innerHTML =
      `<span><b>${st.backCount}</b> back</span><span><b>${st.forwardCount}</b> forward</span>` +
      `<span><b>${n - st.backCount - st.forwardCount}</b> of ${n} cells free</span>`;
    this.q('[data-current]').textContent = st.current;

    // Segment bars above the cells show each stack's extent and growth direction.
    const segs = this.q('[data-segs]');
    segs.innerHTML = '';
    if (st.backCount > 0) {
      segs.insertAdjacentHTML('beforeend',
        `<div class="seg back${st.backCount < 2 ? ' tiny' : ''}" style="grid-column:1 / span ${st.backCount}"><span>Back stack</span><i>&rarr;</i></div>`);
    }
    if (st.forwardCount > 0) {
      segs.insertAdjacentHTML('beforeend',
        `<div class="seg fwd${st.forwardCount < 2 ? ' tiny' : ''}" style="grid-column:${st.forwardTop + 1} / span ${st.forwardCount}"><i>&larr;</i><span>Forward stack</span></div>`);
    }

    const prev = this.prev.get(tab.id);
    const idx = [];
    const cells = [];
    for (let i = 0; i < n; i++) {
      const url = st.cells[i];
      idx.push(`<div>${i}</div>`);
      if (url === null || url === undefined) {
        const was = prev && prev[i];
        const ghost = was ? ` data-ghost="${esc(hostOf(was))}"` : '';
        cells.push(`<div class="cell empty${was ? ' popped' : ''}"${ghost}><span>empty</span></div>`);
      } else {
        const side = i <= st.backTop ? 'back' : 'fwd';
        const fresh = prev && prev[i] !== url ? ` pushed-${side}` : '';
        const path = pathOf(url);
        cells.push(
          `<div class="cell ${side}${fresh}" title="${esc(url)}">` +
          `<span class="host">${esc(hostOf(url))}</span>` +
          `<span class="path">${isHome(url) ? 'start page' : esc(path || '/')}</span></div>`);
      }
    }
    this.q('[data-indices]').innerHTML = idx.join('');
    this.q('[data-cells]').innerHTML = cells.join('');
    this.prev.set(tab.id, st.cells.slice());

    // Pointers: backTop is -1 and forwardTop is N when a stack is empty, so those sit on the edge.
    const pb = this.q('[data-ptr-back]');
    const pf = this.q('[data-ptr-fwd]');
    pb.innerHTML = st.backTop >= 0
      ? `<div class="pointer back${st.backTop < 1 ? ' at-start' : ''}" style="grid-column:${st.backTop + 1}"><i></i><span>backTop = ${st.backTop}</span></div>`
      : `<div class="pointer back edge" style="grid-column:1"><span>backTop = -1 (empty)</span></div>`;
    pf.innerHTML = st.forwardTop < n
      ? `<div class="pointer fwd${st.forwardTop > n - 3 ? ' at-end' : ''}" style="grid-column:${st.forwardTop + 1}"><i></i><span>forwardTop = ${st.forwardTop}</span></div>`
      : `<div class="pointer fwd edge" style="grid-column:${n}"><span>forwardTop = ${n} (empty)</span></div>`;

    // Live operation log (newest first).
    const log = this.q('[data-log]');
    log.innerHTML = tab.log.slice().reverse().map((e, i) =>
      `<li class="${e.ok ? 'ok' : 'skip'}${i === 0 && e.fresh ? ' fresh' : ''}">` +
      `<time>${clock(e.time)}</time><span class="op op-${esc(e.op.toLowerCase())}">${esc(e.op)}</span>` +
      `<span class="msg">${esc(e.text)}</span></li>`).join('');
    tab.log.forEach((e) => { e.fresh = false; });
  }

  forget(tabId) { this.prev.delete(tabId); }
}
