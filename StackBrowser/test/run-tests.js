'use strict';
// End-to-end checks: C++ engine <-> Node API <-> proxy. Run with: node test/run-tests.js
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}

function startFixture() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      if (req.url === '/redirect') { res.writeHead(302, { location: '/a' }); return res.end(); }
      if (req.url === '/img') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from([137, 80, 78, 71])); }
      res.writeHead(200, { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" });
      res.end('<!doctype html><html><head><title>Fixture ' + req.url + '</title></head><body><a href="/b">link</a></body></html>');
    }).listen(0, '127.0.0.1', () => resolve(s));
  });
}

function startServer(port, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: String(port), STACKBROWSER_CAPACITY: '6' }, env), stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('running')) resolve(p); });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (c) => reject(new Error('server exited ' + c + '\n' + out)));
  });
}

const H = { 'content-type': 'application/json', 'x-stackbrowser': '1' };
const mk = (base) => async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};

(async () => {
  const fixture = await startFixture();
  const fx = 'http://127.0.0.1:' + fixture.address().port;
  const PORT = 4311, PORT2 = 4312;
  const srv = await startServer(PORT, { STACKBROWSER_ALLOW_PRIVATE: '1' });
  const srvStrict = await startServer(PORT2, {});
  const base = 'http://localhost:' + PORT;
  const call = mk(base);
  const HOME = 'stackbrowser://home';

  console.log('\nEngine through the API');
  let tab;
  await test('new tab starts on the home page with an empty history', async () => {
    const r = await call('POST', '/api/tabs');
    tab = r.tabId;
    const s = r.entries[1].state;
    assert.strictEqual(s.current, HOME);
    assert.strictEqual(s.canGoBack, false);
    assert.strictEqual(s.canGoForward, false);
    assert.strictEqual(s.capacity, 6);
  });
  await test('visits grow the Back stack from the left of the single array', async () => {
    await call('POST', `/api/tabs/${tab}/navigate`, { url: fx + '/a' });
    const r = await call('POST', `/api/tabs/${tab}/navigate`, { url: fx + '/b' });
    const s = r.state;
    assert.deepStrictEqual(s.cells, [HOME, fx + '/a', null, null, null, null]);
    assert.strictEqual(s.backTop, 1); assert.strictEqual(s.forwardTop, 6);
    assert.strictEqual(s.current, fx + '/b');
  });
  await test('Back pushes onto the Forward stack at the right end', async () => {
    const r = await call('POST', `/api/tabs/${tab}/back`);
    const s = r.state;
    assert.strictEqual(s.current, fx + '/a');
    assert.deepStrictEqual(s.cells, [HOME, null, null, null, null, fx + '/b']);
    assert.strictEqual(s.backTop, 0); assert.strictEqual(s.forwardTop, 5);
    assert.ok(s.canGoBack && s.canGoForward);
  });
  await test('Forward restores the page and empties the Forward cell', async () => {
    const s = (await call('POST', `/api/tabs/${tab}/forward`)).state;
    assert.strictEqual(s.current, fx + '/b');
    assert.strictEqual(s.forwardCount, 0);
    assert.strictEqual(s.cells[5], null);
  });
  await test('visiting after Back clears the Forward stack', async () => {
    await call('POST', `/api/tabs/${tab}/back`);
    const r = await call('POST', `/api/tabs/${tab}/navigate`, { url: fx + '/c' });
    assert.strictEqual(r.state.canGoForward, false);
    assert.ok(r.message.includes('Forward stack cleared'));
  });
  await test('Back at the start is refused and Forward stays disabled', async () => {
    await call('POST', `/api/tabs/${tab}/back`); await call('POST', `/api/tabs/${tab}/back`);
    const r = await call('POST', `/api/tabs/${tab}/back`);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.state.canGoBack, false);
  });
  await test('a full array evicts the oldest Back entry instead of overflowing', async () => {
    const t = (await call('POST', '/api/tabs')).tabId;
    let r;
    for (let i = 1; i <= 9; i++) r = await call('POST', `/api/tabs/${t}/navigate`, { url: fx + '/p' + i });
    const s = r.state;
    assert.strictEqual(s.current, fx + '/p9');
    assert.strictEqual(s.backCount, 6);
    assert.strictEqual(s.cells[0], fx + '/p3');
    assert.strictEqual(s.cells[5], fx + '/p8');
  });
  await test('tabs keep separate histories', async () => {
    const a = (await call('POST', '/api/tabs')).tabId, b = (await call('POST', '/api/tabs')).tabId;
    await call('POST', `/api/tabs/${a}/navigate`, { url: fx + '/only-a' });
    const sb = (await call('GET', `/api/tabs/${b}/state`)).state;
    assert.strictEqual(sb.current, HOME); assert.strictEqual(sb.backCount, 0);
  });
  await test('reset empties both stacks but keeps the current page', async () => {
    await call('POST', `/api/tabs/${tab}/navigate`, { url: fx + '/r1' });
    await call('POST', `/api/tabs/${tab}/navigate`, { url: fx + '/r2' });
    await call('POST', `/api/tabs/${tab}/back`);
    const r = await call('POST', `/api/tabs/${tab}/reset`);
    assert.strictEqual(r.state.backCount + r.state.forwardCount, 0);
    assert.strictEqual(r.state.current, fx + '/r1');
    assert.ok(r.state.cells.every((c) => c === null));
  });
  await test('closing a tab removes it', async () => {
    const t = (await call('POST', '/api/tabs')).tabId;
    await call('DELETE', `/api/tabs/${t}`);
    const r = await call('GET', `/api/tabs/${t}/state`);
    assert.strictEqual(r.ok, false);
  });

  console.log('\nAPI safety');
  await test('rejects non-http(s) URLs', async () => {
    for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x.org', 'a b\nc'])
      assert.strictEqual((await call('POST', `/api/tabs/${tab}/navigate`, { url: u })).ok, false, u);
  });
  await test('requires the X-StackBrowser header', async () => {
    const r = await fetch(base + '/api/tabs', { method: 'POST' });
    assert.strictEqual(r.status, 403);
  });
  await test('rejects foreign Host headers (DNS rebinding)', async () => {
    const status = await new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: PORT, path: '/', headers: { host: 'evil.example.com' } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.end();
    });
    assert.strictEqual(status, 403);
  });
  await test('static server blocks path traversal', async () => {
    const status = await new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: PORT, path: '/..%2fserver%2fserver.js', headers: { host: 'localhost' } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.end();
    });
    assert.ok(status === 403 || status === 404, 'status ' + status);
  });
  await test('index.html and assets are served', async () => {
    for (const p of ['/', '/css/styles.css', '/js/app.js']) assert.strictEqual((await fetch(base + p)).status, 200, p);
  });

  console.log('\nPage proxy');
  await test('strips frame-blocking headers and injects the history bridge', async () => {
    const r = await fetch(`${base}/proxy?url=${encodeURIComponent(fx + '/a')}`);
    const html = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(!r.headers.get('x-frame-options'));
    assert.ok(!/frame-ancestors/.test(r.headers.get('content-security-policy') || ''));
    assert.ok(html.includes('<base href="' + fx + '/a">'));
    assert.ok(html.includes('sb:"navigate"'));
  });
  await test('follows redirects and passes non-HTML through', async () => {
    assert.ok((await (await fetch(`${base}/proxy?url=${encodeURIComponent(fx + '/redirect')}`)).text()).includes('Fixture /a'));
    const img = await fetch(`${base}/proxy?url=${encodeURIComponent(fx + '/img')}`);
    assert.strictEqual(img.headers.get('content-type'), 'image/png');
  });
  await test('refuses private/local targets by default', async () => {
    const r = await fetch(`http://localhost:${PORT2}/proxy?url=${encodeURIComponent(fx + '/a')}`);
    assert.strictEqual(r.status, 403);
    assert.ok((await r.text()).includes('Blocked'));
  });
  await test('refuses non-http protocols', async () => {
    const r = await fetch(`${base}/proxy?url=${encodeURIComponent('file:///etc/passwd')}`);
    assert.strictEqual(r.status, 400);
  });

  srv.kill(); srvStrict.kill(); fixture.close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
