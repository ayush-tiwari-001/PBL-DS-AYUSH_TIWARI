'use strict';
// Page proxy: fetches a website server-side and re-serves it so it can be shown
// inside the browser viewport (many sites forbid being framed directly).
//
// Safety rules:
//  * only http/https
//  * private, loopback and link-local addresses are refused (no SSRF into your LAN)
//  * pages are shown in a sandboxed iframe WITHOUT allow-same-origin, so they
//    cannot read StackBrowser's own origin.
const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOW_PRIVATE = process.env.STACKBROWSER_ALLOW_PRIVATE === '1'; // for local testing only

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
           (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
           (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
  }
  return true;
}

async function assertPublicHost(hostname) {
  if (ALLOW_PRIVATE) return;
  const host = hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    const e = new Error('Blocked: ' + hostname + ' resolves to a private or local address');
    e.status = 403;
    throw e;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function errorPage(title, detail, url) {
  return '<!doctype html><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
    '<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0B1020;color:#cbd5e1;' +
    'font:15px/1.6 Segoe UI,Inter,system-ui,sans-serif"><div style="max-width:520px;padding:32px">' +
    '<div style="font-size:12px;letter-spacing:.12em;color:#60a5fa;text-transform:uppercase">StackBrowser</div>' +
    '<h1 style="color:#f1f5f9;font-weight:600;margin:.4em 0">' + escapeHtml(title) + '</h1>' +
    '<p>' + escapeHtml(detail) + '</p><p style="color:#64748b;word-break:break-all">' + escapeHtml(url || '') + '</p></div>';
}

// Script injected into proxied pages: reports the title and routes link clicks / GET forms
// through the parent so they go into the C++ history.
const BRIDGE = '<script>(function(){' +
  'var P=window.parent;function post(m){try{P.postMessage(m,"*")}catch(e){}}' +
  'function abs(u){try{return new URL(u,document.baseURI).href}catch(e){return null}}' +
  'document.addEventListener("click",function(e){' +
    'if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey)return;' +
    'var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;' +
    'var h=a.getAttribute("href");if(!h||h[0]==="#"||/^(javascript|mailto|tel):/i.test(h))return;' +
    'var u=abs(h);if(!u||!/^https?:/i.test(u))return;e.preventDefault();post({sb:"navigate",url:u});},true);' +
  'document.addEventListener("submit",function(e){var f=e.target;if(!f||(f.method||"get").toLowerCase()!=="get")return;' +
    'var u=new URL(f.getAttribute("action")||"",document.baseURI);var d=new FormData(f);' +
    'd.forEach(function(v,k){if(typeof v==="string")u.searchParams.set(k,v)});' +
    'if(!/^https?:/i.test(u.protocol))return;e.preventDefault();post({sb:"navigate",url:u.href});},true);' +
  'function title(){post({sb:"title",title:document.title||""})}' +
  'window.addEventListener("load",function(){title();post({sb:"loaded"})});title();' +
  'new MutationObserver(title).observe(document.querySelector("title")||document.documentElement,{subtree:true,childList:true,characterData:true});' +
'})();</script>';

async function fetchPage(target, userAgent, acceptLanguage) {
  let url;
  try { url = new URL(target); } catch (_) { return { status: 400, type: 'text/html; charset=utf-8', body: errorPage('Invalid address', 'That address could not be understood.', target) }; }
  if (!/^https?:$/.test(url.protocol)) {
    return { status: 400, type: 'text/html; charset=utf-8', body: errorPage('Unsupported protocol', 'Only http and https pages can be opened.', target) };
  }

  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    try { await assertPublicHost(current.hostname); }
    catch (e) { return { status: e.status || 502, type: 'text/html; charset=utf-8', body: errorPage('Blocked for your safety', e.message, current.href) }; }

    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
        headers: {
          'user-agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StackBrowser/1.0',
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': acceptLanguage || 'en-US,en;q=0.9',
        },
      });
    } catch (e) {
      return { status: 502, type: 'text/html; charset=utf-8', body: errorPage('Could not reach this site', (e.cause && e.cause.code) || e.message, current.href) };
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current);
      if (!/^https?:$/.test(current.protocol)) break;
      continue;
    }

    const ctype = res.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return { status: 413, type: 'text/html; charset=utf-8', body: errorPage('Page too large', 'This response is larger than the 8 MB proxy limit.', current.href) };
    }
    if (!/text\/html|application\/xhtml/i.test(ctype)) {
      // Non-HTML (images, PDFs, ...): pass through unchanged.
      return { status: res.status, type: ctype, body: buf, finalUrl: current.href };
    }

    let html = buf.toString('utf8');
    // <base> makes relative links/images resolve against the real site.
    const inject = '<base href="' + escapeHtml(current.href) + '"><meta name="referrer" content="no-referrer">' + BRIDGE;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inject) : inject + html;
    return { status: res.status, type: 'text/html; charset=utf-8', body: html, finalUrl: current.href };
  }
  return { status: 508, type: 'text/html; charset=utf-8', body: errorPage('Too many redirects', 'This site redirected too many times.', target) };
}

module.exports = { fetchPage, errorPage };
