'use strict';
// StackBrowser local server: serves the UI, talks to the C++ history engine, proxies pages.
// Zero npm dependencies. Requires Node.js 18+.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Engine, ENGINE_PATH } = require('./engine');
const { fetchPage } = require('./proxy');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';                      // local only, never exposed to the network
const CAPACITY = Number(process.env.STACKBROWSER_CAPACITY) || 16;
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const HOME_URL = 'stackbrowser://home';

let engine;
try { engine = new Engine(CAPACITY); }
catch (e) { console.error('\n[StackBrowser] ' + e.message + '\n'); process.exit(1); }

let nextTab = 1;
const openTabs = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 16384) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function validUrl(u) {
  if (typeof u !== 'string' || u.length === 0 || u.length > 2048 || /[\r\n]/.test(u)) return false;
  if (u === HOME_URL) return true;
  try { return /^https?:$/.test(new URL(u).protocol); } catch (_) { return false; }
}

async function handleApi(req, res, url) {
  // Custom header forces a CORS preflight, so other websites cannot drive this API.
  if (req.headers['x-stackbrowser'] !== '1') return sendJson(res, 403, { ok: false, message: 'forbidden' });
  const parts = url.pathname.split('/').filter(Boolean); // ['api','tabs',id,action]
  if (parts[1] !== 'tabs') return sendJson(res, 404, { ok: false, message: 'not found' });

  if (parts.length === 2 && req.method === 'POST') {
    const id = 't' + nextTab++;
    openTabs.add(id);
    const r = await engine.send('NEW ' + id);
    // Every tab starts on the home page, which is its first history entry.
    const v = await engine.send('VISIT ' + id + ' ' + HOME_URL);
    return sendJson(res, 200, { tabId: id, entries: [r, v] });
  }

  const id = parts[2];
  if (!openTabs.has(id)) return sendJson(res, 404, { ok: false, message: 'unknown tab' });

  if (parts.length === 3 && req.method === 'DELETE') {
    openTabs.delete(id);
    return sendJson(res, 200, await engine.send('CLOSE ' + id));
  }
  if (req.method === 'GET' && parts[3] === 'state') return sendJson(res, 200, await engine.send('STATE ' + id));
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'method not allowed' });

  switch (parts[3]) {
    case 'navigate': {
      const body = await readJson(req);
      if (!validUrl(body.url)) return sendJson(res, 400, { ok: false, message: 'Only http(s) addresses can be opened.' });
      return sendJson(res, 200, await engine.send('VISIT ' + id + ' ' + body.url));
    }
    case 'back': return sendJson(res, 200, await engine.send('BACK ' + id));
    case 'forward': return sendJson(res, 200, await engine.send('FORWARD ' + id));
    case 'reset': return sendJson(res, 200, await engine.send('RESET ' + id));
    default: return sendJson(res, 404, { ok: false, message: 'not found' });
  }
}

async function handleProxy(req, res, url) {
  const target = url.searchParams.get('url') || '';
  const r = await fetchPage(target, req.headers['user-agent'], req.headers['accept-language']);
  res.writeHead(r.status, {
    'content-type': r.type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': 'sandbox allow-scripts allow-forms allow-popups',
  });
  res.end(r.body);
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  // Reject DNS-rebinding style requests: only talk to localhost names.
  const host = (req.headers.host || '').split(':')[0];
  if (host !== 'localhost' && host !== '127.0.0.1') { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/proxy') return await handleProxy(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error('[StackBrowser] request error:', e.message);
    if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'server error' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log('\n  StackBrowser is running');
  console.log('  Open  http://localhost:' + PORT);
  console.log('  C++ history engine: ' + ENGINE_PATH + ' (capacity ' + CAPACITY + ')');
  console.log('  Press Ctrl+C to stop.\n');
});

function shutdown() { engine.close(); server.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
